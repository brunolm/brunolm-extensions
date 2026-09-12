import { NT } from './protocol.js';
import { loadUnits, saveUnits } from './store.js';

const WMO = {
  0: ['☀️', 'Clear'],
  1: ['🌤️', 'Mainly clear'],
  2: ['⛅', 'Partly cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'],
  48: ['🌫️', 'Rime fog'],
  51: ['🌦️', 'Light drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌦️', 'Heavy drizzle'],
  56: ['🌧️', 'Freezing drizzle'],
  57: ['🌧️', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'],
  63: ['🌧️', 'Rain'],
  65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'],
  67: ['🌧️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'],
  73: ['🌨️', 'Snow'],
  75: ['❄️', 'Heavy snow'],
  77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Rain showers'],
  81: ['🌧️', 'Rain showers'],
  82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'],
  86: ['❄️', 'Snow showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm, hail'],
  99: ['⛈️', 'Thunderstorm, hail'],
};

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

export async function mountWeather() {
  const root = document.getElementById('nt-weather');
  let units = await loadUnits();
  let weather = null;

  root.addEventListener('click', async (event) => {
    if (event.target.closest('.nt-wx-temp')) {
      units = units === 'c' ? 'f' : 'c';
      await saveUnits(units);
      render();
      return;
    }
    if (event.target.closest('.nt-wx-retry')) await load(true);
  });

  await load(false);

  async function load(force) {
    root.replaceChildren(note('nt-wx-loading', 'Loading weather…'));
    const result = await chrome.runtime.sendMessage({ type: NT.WEATHER, force });
    if (typeof result === 'string' || !result?.current) {
      root.replaceChildren(note('nt-wx-error', typeof result === 'string' ? result : 'Weather unavailable'), retry());
      return;
    }
    weather = result;
    render();
  }

  function render() {
    if (!weather) return;

    root.innerHTML = `
      <button class="nt-wx-temp" type="button" title="Switch °C / °F">
        <span class="nt-wx-icon"></span><span class="nt-wx-value"></span>
      </button>
      <div class="nt-wx-place"></div>
      <div class="nt-wx-desc"></div>
      <div class="nt-wx-days"></div>
    `;

    const [icon, label] = describe(weather.current.code);
    root.querySelector('.nt-wx-icon').textContent = icon;
    root.querySelector('.nt-wx-value').textContent = Number.isFinite(weather.current.temp)
      ? `${temp(weather.current.temp, units)}${units === 'f' ? 'F' : 'C'}`
      : '—';
    root.querySelector('.nt-wx-place').textContent = weather.place || 'Your location';
    root.querySelector('.nt-wx-desc').textContent = [
      label,
      Number.isFinite(weather.current.feels) ? `feels ${temp(weather.current.feels, units)}` : '',
      Number.isFinite(weather.current.humidity) ? `${Math.round(weather.current.humidity)}% hum` : '',
      Number.isFinite(weather.current.wind) ? `${Math.round(weather.current.wind)} km/h` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const days = root.querySelector('.nt-wx-days');
    for (const day of weather.days.slice(1)) days.appendChild(renderDay(day));
  }

  function renderDay(day) {
    const cell = document.createElement('div');
    cell.className = 'nt-wx-day';

    const [icon, label] = describe(day.code);
    cell.title = Number.isFinite(day.rain) ? `${label} · ${day.rain}% rain` : label;

    const name = document.createElement('span');
    name.className = 'nt-wx-day-name';
    name.textContent = weekday.format(new Date(`${day.date}T12:00:00`));

    const glyph = document.createElement('span');
    glyph.className = 'nt-wx-day-icon';
    glyph.textContent = icon;

    const range = document.createElement('span');
    range.className = 'nt-wx-day-range';
    range.textContent = `${temp(day.max, units)} / ${temp(day.min, units)}`;

    cell.append(name, glyph, range);
    return cell;
  }
}

function describe(code) {
  return WMO[code] ?? ['🌡️', 'Unknown'];
}

function temp(celsius, units) {
  if (!Number.isFinite(celsius)) return '—';
  const value = units === 'f' ? celsius * 1.8 + 32 : celsius;
  return `${Math.round(value)}°`;
}

function note(className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

function retry() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nt-wx-retry nt-btn nt-btn-ghost';
  button.textContent = 'Retry';
  return button;
}
