import { DEFAULT_HOLD_MS, LP } from './protocol.js';

const STYLE_ID = 'lp-popup-css';

export async function mount(root) {
  ensureStyles();
  const id = chrome.runtime.id;
  const command = `pwsh -File features/link-preview/native/install.ps1 -ExtensionId ${id}`;

  root.innerHTML = `
    <form class="lp-form">
      <p class="lp-lead">Long-press a link for a preview. Summaries run <code>grok --effort medium</code> on this machine via a native host — no API key in the extension.</p>
      <p class="lp-id">Extension ID: <code id="lp-ext-id">${id}</code></p>
      <button id="lp-copy" type="button" class="lp-secondary">Copy install command</button>
      <p class="lp-note">Run that from the repo folder, then reload the extension.</p>
      <label class="lp-field">
        <span>Hold duration (ms)</span>
        <input id="lp-hold" type="number" min="300" max="2000" step="50" />
      </label>
      <button type="submit">Save</button>
      <button id="lp-ping" type="button" class="lp-secondary">Test Grok host</button>
      <p id="lp-note" class="lp-note"></p>
    </form>
  `;

  const settings = (await chrome.runtime.sendMessage({ type: LP.GET_SETTINGS })) ?? {};
  const hold = root.querySelector('#lp-hold');
  const note = root.querySelector('#lp-note');
  hold.value = String(settings.holdMs || DEFAULT_HOLD_MS);

  root.querySelector('#lp-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(command);
    note.textContent = 'Install command copied.';
  });

  root.querySelector('#lp-ping').addEventListener('click', async () => {
    note.textContent = 'Pinging host…';
    const ping = await chrome.runtime.sendMessage({ type: LP.PING });
    if (typeof ping === 'string') {
      note.textContent = ping;
      return;
    }
    note.textContent = ping.ok ? `Host ok — ${ping.grok || 'grok found'}` : ping.error || 'Host not installed.';
  });

  root.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const saved = await chrome.runtime.sendMessage({ type: LP.SET_SETTINGS, holdMs: Number(hold.value) });
    if (typeof saved === 'string') {
      note.textContent = saved;
      return;
    }
    hold.value = String(saved.holdMs || DEFAULT_HOLD_MS);
    note.textContent = 'Saved.';
  });
}

export async function status() {
  const ping = await chrome.runtime.sendMessage({ type: LP.PING }).catch(() => null);
  if (ping?.ok) return 'Long-press a link';
  return 'Needs grok CLI host';
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./popup.css', import.meta.url);
  document.head.appendChild(link);
}
