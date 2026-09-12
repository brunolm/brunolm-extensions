const ZONES = [
  { label: 'Miami', timeZone: 'America/New_York' },
  { label: 'LA', timeZone: 'America/Los_Angeles' },
];

const localTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
const localDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const zoneTimes = ZONES.map((zone) => ({
  label: zone.label,
  format: new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: zone.timeZone,
  }),
}));

export function mountClock() {
  const time = document.getElementById('nt-time');
  const date = document.getElementById('nt-date');
  const zones = document.getElementById('nt-zones');

  const value = document.createElement('span');
  const period = document.createElement('span');
  period.className = 'nt-time-period';
  time.replaceChildren(value, period);

  const rows = zoneTimes.map((zone) => {
    const row = document.createElement('div');
    row.className = 'nt-zone';
    zones.appendChild(row);
    return { zone, row };
  });

  const tick = () => {
    const now = new Date();
    const parts = localTime.formatToParts(now);
    value.textContent = parts
      .filter((part) => part.type !== 'dayPeriod')
      .map((part) => part.value)
      .join('')
      .trim();
    period.textContent = parts.find((part) => part.type === 'dayPeriod')?.value ?? '';
    date.textContent = localDate.format(now);
    for (const { zone, row } of rows) row.textContent = `${zone.label} ${zone.format.format(now)}`;
  };

  tick();
  setInterval(tick, 1000);
}
