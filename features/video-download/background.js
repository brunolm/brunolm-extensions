import { handle } from '../../shared/messages.js';
import { evictOldestGroups, groupCount } from './groups.js';
import { MIN_VIDEO_BYTES } from './limits.js';
import { VDH } from './protocol.js';
import { withoutRedundantTwitterHls } from './twitter.js';

const MEDIA_EXT_RE = /\.(mp4|webm|mkv|mov|m4v|flv|avi|mp3|m4a|aac|ogg|opus|wav|m3u8|mpd)(?=[?#]|$)/i;
const SEGMENT_RE = /\.(ts|m4s|m4f|frag|seg|init)(?=[?#]|$)|[?&](?:range|bytestart|segment)=/i;
const MEDIA_CONTENT_TYPES = [
  'video/',
  'audio/',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/dash+xml',
];

export function register() {
  chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, { urls: ['<all_urls>'] }, ['responseHeaders']);

  handle(VDH.FOUND_MEDIA, (message, sender) => {
    const items = message.items.map((item) => ({
      ...item,
      kind: item.kind || guessKind(item.url, ''),
      source: 'page',
    }));
    return addMedia(sender.tab?.id, items).then(() => true);
  });

  handle(VDH.PAGE_THUMB, (message, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined || tabId < 0) return false;
    return chrome.storage.session.set({ [thumbKey(tabId)]: message.thumb }).then(() => true);
  });

  handle(VDH.GET_MEDIA, (message) => getMedia(message.tabId));

  handle(VDH.PRUNE, (message, sender) => pruneMedia(sender.tab?.id, message.urls));

  handle(VDH.DOWNLOAD, (message) => download(message));

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    if (details.transitionType === 'auto_subframe') return;
    clearTab(details.tabId);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove([storageKey(tabId), thumbKey(tabId)]);
  });
}

async function onHeadersReceived(details) {
  if (details.tabId < 0) return;
  if (details.method !== 'GET') return;

  const contentType = header(details.responseHeaders, 'content-type');
  const isMediaType = MEDIA_CONTENT_TYPES.some((t) => contentType.startsWith(t));
  const isMediaExt = MEDIA_EXT_RE.test(pathOf(details.url));
  if (!isMediaType && !isMediaExt) return;

  // normalize before the segment check: googlevideo chunks carry a range=
  // param that would otherwise be misread as a segment marker
  const url = normalizeUrl(details.url);
  if (isSegment(url, contentType)) return;

  const size = parseInt(header(details.responseHeaders, 'content-length'), 10) || 0;
  await addMedia(details.tabId, [
    {
      url,
      kind: guessKind(details.url, contentType),
      contentType,
      size,
      source: 'network',
    },
  ]);
}

async function addMedia(tabId, items) {
  if (tabId === undefined || tabId < 0 || !items.length) return;

  const key = storageKey(tabId);
  const existing = (await chrome.storage.session.get(key))[key] ?? [];
  const byUrl = new Map(existing.map((item) => [item.url, item]));

  let added = 0;
  const now = Date.now();
  for (const item of items) {
    if (!item.url || byUrl.has(item.url)) continue;
    if (item.kind === 'video' && item.size && item.size < MIN_VIDEO_BYTES) continue;
    const next = item.kind === 'hls' ? { ...item, size: 0, foundAt: now } : { ...item, foundAt: now };
    byUrl.set(item.url, next);
    added += 1;
  }

  const list = evictOldestGroups(withoutRedundantTwitterHls([...byUrl.values()]));
  if (!added && list.length === existing.length) return;

  await chrome.storage.session.set({ [key]: list });
  updateBadge(tabId, groupCount(list));
}

async function pruneMedia(tabId, urls) {
  if (tabId === undefined || tabId < 0 || !urls?.length) return;

  const key = storageKey(tabId);
  const existing = (await chrome.storage.session.get(key))[key] ?? [];
  const drop = new Set(urls);
  const list = existing.filter((item) => !drop.has(item.url));
  if (list.length === existing.length) return;

  await chrome.storage.session.set({ [key]: list });
  updateBadge(tabId, groupCount(list));
}

async function getMedia(tabId) {
  const key = storageKey(tabId);
  const data = await chrome.storage.session.get([key, thumbKey(tabId)]);
  const stored = data[key] ?? [];
  const items = withoutRedundantTwitterHls(stored);
  if (items.length !== stored.length) {
    await chrome.storage.session.set({ [key]: items });
    updateBadge(tabId, groupCount(items));
  }
  return {
    items,
    pageThumb: data[thumbKey(tabId)] ?? null,
  };
}

function download(message) {
  return new Promise((resolve) => {
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: message.saveAs ?? false },
      () => resolve(chrome.runtime.lastError?.message ?? null),
    );
  });
}

function clearTab(tabId) {
  chrome.storage.session.remove([storageKey(tabId), thumbKey(tabId)]);
  updateBadge(tabId, 0);
}

function updateBadge(tabId, count) {
  chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b82f6' });
}

function isSegment(url, contentType) {
  if (SEGMENT_RE.test(url)) return true;
  // googlevideo serves adaptive chunks with a range param already caught above;
  // mp2t segments only matter via their m3u8 playlist
  if (contentType === 'video/mp2t') return true;
  return false;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // googlevideo chunked streams differ only by range; keep one canonical URL
    if (u.hostname.endsWith('.googlevideo.com')) {
      u.searchParams.delete('range');
      u.searchParams.delete('rn');
      u.searchParams.delete('rbuf');
    }
    return u.toString();
  } catch {
    return url;
  }
}

function guessKind(url, contentType) {
  const path = pathOf(url);
  if (/\.(m3u8)(?=[?#]|$)/i.test(path) || contentType.includes('mpegurl')) return 'hls';
  if (/\.(mpd)(?=[?#]|$)/i.test(path) || contentType.includes('dash')) return 'dash';
  if (contentType.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav)(?=[?#]|$)/i.test(path)) return 'audio';
  return 'video';
}

function header(headers, name) {
  return (headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '').toLowerCase();
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function storageKey(tabId) {
  return `vdh:media_${tabId}`;
}

function thumbKey(tabId) {
  return `vdh:thumb_${tabId}`;
}
