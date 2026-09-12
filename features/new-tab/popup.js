import { ENGINES } from './engines.js';
import { loadEngines, loadSites } from './store.js';

const STYLE_ID = 'nt-popup-css';
const PAGE = 'features/new-tab/newtab.html';

export async function mount(root) {
  ensureStyles();
  root.innerHTML = `
    <div class="nt-pop">
      <p class="nt-pop-lead">Replaces the browser new tab page: clock, Miami time, shortcuts, multi-engine search, weather, and an IP reveal.</p>
      <p id="nt-pop-sites" class="nt-pop-note"></p>
      <p id="nt-pop-engines" class="nt-pop-note"></p>
      <button id="nt-pop-open" type="button" class="nt-pop-btn">Open the page</button>
      <p class="nt-pop-hint">Edit shortcuts and pick search engines on the page itself. Brave may ask to keep the override the first time.</p>
    </div>
  `;

  const [sites, engines] = await Promise.all([loadSites(), loadEngines()]);
  root.querySelector('#nt-pop-sites').textContent = `${sites.length} shortcut${sites.length === 1 ? '' : 's'}`;
  root.querySelector('#nt-pop-engines').textContent = engineNames(engines);

  root.querySelector('#nt-pop-open').addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL(PAGE) });
    window.close();
  });
}

export async function status() {
  const sites = await loadSites();
  return `${sites.length} shortcuts`;
}

function engineNames(ids) {
  const names = ENGINES.filter((engine) => ids.includes(engine.id)).map((engine) => engine.name);
  if (!names.length) return 'No search engine selected';
  return `Searches: ${names.join(', ')}`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./popup.css', import.meta.url);
  document.head.appendChild(link);
}
