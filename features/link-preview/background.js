import { handle } from '../../shared/messages.js';
import { DEFAULT_HOLD_MS, HOST_NAME, KEY_HOLD_MS, LP } from './protocol.js';

const CACHE_TTL_MS = 30 * 60 * 1000;

const cache = new Map();

export function register() {
  handle(LP.META, (message) => getMeta(message.url));
  handle(LP.SUMMARIZE, (message) => getSummary(message.url));
  handle(LP.GET_SETTINGS, () => readSettings());
  handle(LP.SET_SETTINGS, (message) => writeSettings(message));
  handle(LP.PING, () => pingHost());
  handle(LP.LOG, (message) => fileLog(message.event || 'ext', message.extra));
}

function getMeta(rawUrl) {
  const page = pageFromUrl(rawUrl);
  fileLog('meta', { url: page.url });
  return {
    url: page.url,
    host: page.host,
    title: page.title,
    description: '',
    image: '',
  };
}

async function getSummary(rawUrl) {
  const page = pageFromUrl(rawUrl);
  const hit = cache.get(page.url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.summary;

  fileLog('summarize-start', { url: page.url });
  const extracted = await tryExtract(page.url);
  if (extracted) {
    page.title = extracted.title || page.title;
    page.description = extracted.description;
    page.text = extracted.text;
    page.url = extracted.url || page.url;
  }
  fileLog('extract', {
    url: page.url,
    ok: Boolean(extracted?.text),
    title: page.title,
    textChars: extracted?.text?.length ?? 0,
  });

  const summary = await askGrok(page, !extracted?.text);
  fileLog('summarize-done', { url: page.url, points: summary.points?.length ?? 0 });
  cache.set(page.url, { at: Date.now(), summary });
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return summary;
}

function pageFromUrl(rawUrl) {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) throw new Error('invalid url');
  const host = hostnameOf(url);
  return { url, host, title: host };
}

async function tryExtract(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      credentials: 'omit',
      signal: AbortSignal.timeout(3_000),
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('html')) return null;
    const html = (await res.text()).slice(0, 200_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4_000);
    if (!text) return null;
    const title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() ?? '';
    const description = html.match(/content=["']([^"']+)["'][^>]*(?:name|property)=["']description["']/i)?.[1] ?? '';
    return { url: res.url || url, title, description, text };
  } catch (err) {
    fileLog('extract-fail', { url, error: err.message });
    return null;
  }
}

async function askGrok(page, fetchPage) {
  const prompt = fetchPage
    ? [
        'Fetch this URL (follow shorteners like t.co). Return ONLY compact JSON: {"blurb":"one sentence","points":["...","..."]}. 3 to 5 short key points. No markdown.',
        `URL: ${page.url}`,
      ].join('\n')
    : [
        'Return ONLY compact JSON: {"blurb":"one sentence","points":["...","..."]}. 3 to 5 short key points a reader wants before clicking. No markdown. Do not fetch anything.',
        `URL: ${page.url}`,
        `Title: ${page.title}`,
        `Description: ${page.description || ''}`,
        `Text:\n${page.text}`,
      ].join('\n');

  fileLog('grok-request', { url: page.url, fetchPage, promptChars: prompt.length });
  const res = await sendNative({
    type: 'summarize',
    prompt,
    fetch: fetchPage,
    extra: { url: page.url, fetchPage },
  });
  if (!res?.ok) throw new Error(res?.error || 'grok host failed');
  return parseSummary(res.text);
}

async function pingHost() {
  try {
    const res = await sendNative({ type: 'ping' });
    fileLog('ping-ok', { grok: res?.grok || '' });
    return { ok: Boolean(res?.ok), grok: res?.grok || '', log: res?.log || '' };
  } catch (err) {
    fileLog('ping-fail', { error: err.message });
    return { ok: false, error: err.message };
  }
}

function fileLog(event, extra) {
  sendNative({ type: 'log', event, extra }).catch(() => {});
}

let nativeChain = Promise.resolve();

function sendNative(message) {
  const run = () =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(friendlyNativeError(chrome.runtime.lastError.message)));
          return;
        }
        resolve(response);
      });
    });
  const next = nativeChain.then(run, run);
  nativeChain = next.catch(() => {});
  return next;
}

function friendlyNativeError(message) {
  if (/not found|specified native messaging host/i.test(message)) {
    return 'Grok CLI host is not installed. Open brunolm → Link Preview.';
  }
  return message || 'native host failed';
}

async function readSettings() {
  const data = await chrome.storage.local.get([KEY_HOLD_MS]);
  return { holdMs: Number(data[KEY_HOLD_MS]) || DEFAULT_HOLD_MS };
}

async function writeSettings(message) {
  if (message.holdMs) {
    await chrome.storage.local.set({ [KEY_HOLD_MS]: clampHold(message.holdMs) });
  }
  return readSettings();
}

function parseSummary(raw) {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const data = JSON.parse(json);
    const points = Array.isArray(data.points)
      ? data.points.map((p) => String(p).trim()).filter(Boolean).slice(0, 5)
      : [];
    return { blurb: String(data.blurb ?? '').trim(), points };
  } catch {
    return { blurb: raw.trim().slice(0, 280), points: [] };
  }
}

function normalizeHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function clampHold(ms) {
  const n = Number(ms);
  if (!n) return DEFAULT_HOLD_MS;
  return Math.min(2000, Math.max(300, Math.round(n)));
}
