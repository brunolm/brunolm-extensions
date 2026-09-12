import { NT } from './protocol.js';

export function mountIp() {
  const dialog = document.getElementById('nt-ip-dialog');
  const body = document.getElementById('nt-ip-body');

  document.getElementById('nt-ip-open').addEventListener('click', () => {
    dialog.showModal();
    load(false);
  });

  document.getElementById('nt-ip-refresh').addEventListener('click', () => load(true));
  document.getElementById('nt-ip-close').addEventListener('click', () => dialog.close());

  body.addEventListener('click', async (event) => {
    const button = event.target.closest('.nt-ip-copy');
    if (!button) return;
    await navigator.clipboard.writeText(button.dataset.value);
    const shown = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = shown), 1000);
  });

  async function load(force) {
    body.replaceChildren(row('Status', 'Looking up…'));

    const result = await chrome.runtime.sendMessage({ type: NT.IP, force });
    if (typeof result === 'string' || !result?.ip) {
      body.replaceChildren(row('Error', typeof result === 'string' ? result : 'Lookup failed'));
      return;
    }

    body.replaceChildren(
      addressRow('IPv4', result.ipv4),
      addressRow('IPv6', result.ipv6),
      row('Location', [result.city, result.region, [result.flag, result.country].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · ') || '—'),
      row('Provider', result.org || '—'),
      row('Time zone', result.timezone || '—'),
      row('Coordinates', coordinates(result)),
    );
  }
}

function addressRow(label, value) {
  if (!value) return row(label, 'Not available');

  const line = row(label, '');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nt-ip-copy';
  button.dataset.value = value;
  button.title = 'Copy';
  button.textContent = value;
  line.querySelector('.nt-ip-value').replaceChildren(button);
  return line;
}

function row(label, value) {
  const line = document.createElement('div');
  line.className = 'nt-ip-row';

  const key = document.createElement('span');
  key.className = 'nt-ip-key';
  key.textContent = label;

  const val = document.createElement('span');
  val.className = 'nt-ip-value';
  val.textContent = value;

  line.append(key, val);
  return line;
}

function coordinates({ latitude, longitude }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '—';
  return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}
