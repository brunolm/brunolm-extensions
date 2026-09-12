import { handle } from '../../shared/messages.js';
import { KEYS, NT } from './protocol.js';

const IP_ENDPOINTS = ['https://ipwho.is/', 'https://ipapi.co/json/'];
// api4/api6 resolve A / AAAA only, so each answer is that family's address or nothing.
const IPV4_ENDPOINT = 'https://api4.ipify.org?format=json';
const IPV6_ENDPOINT = 'https://api6.ipify.org?format=json';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const IP_TTL = 30 * 60 * 1000;
const WEATHER_TTL = 15 * 60 * 1000;
const FORECAST_DAYS = 6;
const TIMEOUT_MS = 8000;

export function register() {
  handle(NT.IP, (message) => lookupLocation(message?.force));
  handle(NT.WEATHER, (message) => loadWeather(message?.force));
}

async function lookupLocation(force) {
  const cached = await readCache(KEYS.IP_CACHE, IP_TTL, force);
  if (cached) return cached;

  const [geo, ipv4, ipv6] = await Promise.all([
    geolocate(),
    publicAddress(IPV4_ENDPOINT),
    publicAddress(IPV6_ENDPOINT),
  ]);

  const ip = geo?.ip || ipv4 || ipv6;
  if (!ip) throw new Error('IP lookup failed');

  return await writeCache(KEYS.IP_CACHE, { ...geo, ip, ipv4, ipv6 });
}

async function geolocate() {
  for (const endpoint of IP_ENDPOINTS) {
    try {
      const location = normalizeLocation(await fetchJson(endpoint));
      if (location) return location;
    } catch {
      // try the next provider; the caller still reports the addresses it has
    }
  }
  return null;
}

async function publicAddress(endpoint) {
  try {
    const data = await fetchJson(endpoint);
    return data?.ip ?? '';
  } catch {
    return '';
  }
}

async function loadWeather(force) {
  const cached = await readCache(KEYS.WEATHER_CACHE, WEATHER_TTL, force);
  if (cached) return cached;

  const location = await lookupLocation(force);
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error('No coordinates for this IP');
  }

  const url = new URL(FORECAST_URL);
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
  });

  const data = await fetchJson(url);
  const current = data.current ?? {};

  return await writeCache(KEYS.WEATHER_CACHE, {
    place: placeName(location),
    current: {
      temp: current.temperature_2m,
      feels: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      code: current.weather_code ?? 0,
      isDay: current.is_day !== 0,
    },
    days: dailyList(data.daily),
  });
}

async function readCache(key, ttl, force) {
  if (force) return null;
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key];
  if (!entry?.fetchedAt) return null;
  if (Date.now() - entry.fetchedAt > ttl) return null;
  return entry;
}

async function writeCache(key, value) {
  const entry = { ...value, fetchedAt: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
  return entry;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return await res.json();
}

function normalizeLocation(data) {
  if (!data?.ip || data.success === false || data.error) return null;
  return {
    ip: data.ip,
    city: data.city ?? '',
    region: data.region ?? data.region_code ?? '',
    country: data.country_name ?? data.country ?? '',
    countryCode: data.country_code ?? '',
    flag: data.flag?.emoji ?? '',
    org: data.connection?.isp ?? data.connection?.org ?? data.org ?? '',
    timezone: data.timezone?.id ?? (typeof data.timezone === 'string' ? data.timezone : ''),
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
  };
}

function placeName(location) {
  return [location.city, location.countryCode || location.country].filter(Boolean).join(', ');
}

function dailyList(daily) {
  if (!daily?.time) return [];
  return daily.time.map((date, i) => ({
    date,
    code: daily.weather_code?.[i] ?? 0,
    max: daily.temperature_2m_max?.[i],
    min: daily.temperature_2m_min?.[i],
    rain: daily.precipitation_probability_max?.[i] ?? null,
  }));
}
