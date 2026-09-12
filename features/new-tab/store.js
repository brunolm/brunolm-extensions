import { KEYS } from './protocol.js';

const DEFAULT_SITES = [
  { name: 'X', url: 'https://x.com/' },
  { name: 'Reddit', url: 'https://www.reddit.com/' },
  { name: 'MyAnimeList', url: 'https://myanimelist.net/' },
  { name: 'Chess.com', url: 'https://www.chess.com/' },
  { name: 'Claude', url: 'https://claude.ai/' },
  { name: 'Grok', url: 'https://grok.com/' },
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
];

const DEFAULT_ENGINES = ['google'];

export async function loadSites() {
  const stored = await chrome.storage.sync.get(KEYS.SITES);
  const sites = stored[KEYS.SITES];
  if (!Array.isArray(sites)) return DEFAULT_SITES.map((site) => ({ ...site, id: newId(), icon: '' }));
  return sites;
}

export async function saveSites(sites) {
  await chrome.storage.sync.set({ [KEYS.SITES]: sites });
}

export async function loadEngines() {
  const stored = await chrome.storage.sync.get(KEYS.ENGINES);
  const ids = stored[KEYS.ENGINES];
  if (!Array.isArray(ids)) return [...DEFAULT_ENGINES];
  return ids;
}

export async function saveEngines(ids) {
  await chrome.storage.sync.set({ [KEYS.ENGINES]: ids });
}

export async function loadUnits() {
  const stored = await chrome.storage.sync.get(KEYS.UNITS);
  return stored[KEYS.UNITS] === 'f' ? 'f' : 'c';
}

export async function saveUnits(units) {
  await chrome.storage.sync.set({ [KEYS.UNITS]: units });
}

export function newId() {
  return crypto.randomUUID();
}
