import { SG } from './protocol.js';

const STYLE_ID = 'sg-popup-css';

export async function mount(root) {
  ensureStyles();
  root.innerHTML = `
    <div class="sg-pop">
      <p class="sg-lead">On a Steam store app page, a YouTube gameplay row appears under the title.</p>
      <p id="sg-status" class="sg-note">Checking this tab…</p>
      <div id="sg-actions" hidden>
        <a id="sg-open" class="sg-btn" target="_blank" rel="noopener">Open YouTube search</a>
      </div>
    </div>
  `;

  const status = root.querySelector('#sg-status');
  const actions = root.querySelector('#sg-actions');
  const open = root.querySelector('#sg-open');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/store\.steampowered\.com\/app\//.test(tab.url ?? '')) {
    status.textContent = 'Open a Steam game page to see gameplay videos.';
    return;
  }

  let info;
  try {
    info = await chrome.tabs.sendMessage(tab.id, { type: SG.PAGE_INFO });
  } catch {
    info = null;
  }

  if (!info?.name) {
    status.textContent = 'Steam page detected, but the game name is not ready yet. Refresh the tab.';
    return;
  }

  status.textContent = `Looking up “${info.query}”.`;
  actions.hidden = false;
  open.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(info.query)}`;

  try {
    const result = await chrome.runtime.sendMessage({ type: SG.SEARCH, query: info.query });
    if (typeof result === 'string') throw new Error(result);
    const n = result.videos?.length ?? 0;
    status.textContent = n
      ? `${info.name}: ${n} gameplay videos on the store page.`
      : `${info.name}: no video cards, use the YouTube search link.`;
    if (result.searchUrl) open.href = result.searchUrl;
  } catch (err) {
    status.textContent = err.message || 'YouTube search failed.';
  }
}

export async function status(tab) {
  if (!tab?.url || !/store\.steampowered\.com\/app\//.test(tab.url)) {
    return 'Opens on Steam store pages';
  }
  return 'Steam game page';
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./popup.css', import.meta.url);
  document.head.appendChild(link);
}
