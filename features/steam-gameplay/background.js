import { handle } from '../../shared/messages.js';
import { NATIVE_HOST, SG } from './protocol.js';

const YT_SEARCH = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const MAX_RESULTS = 6;
const YT_VIDEOS_ONLY = 'EgIQAQ%3D%3D';
const SKIP_TITLE = /\b(review|worth it|should you|trailer|teaser|cinematic|announcement|ost|soundtrack|interview|explained|tier list|news)\b/i;
const GAMEPLAY_TITLE = /\b(gameplay|playthrough|walkthrough|let'?s play|in-game|first (?:look|hour|hours)|no commentary)\b/i;

export function register() {
  handle(SG.SEARCH, (message) => searchGameplay(message.query));
}

async function searchGameplay(query) {
  const name = gameNameFromQuery(query);
  if (!name) return { videos: [], searchUrl: youtubeSearchUrl('') };

  const primary = `"${name}" gameplay walkthrough`;
  const secondary = `"${name}" 10 minutes gameplay`;

  const first = await youtubeSearch(primary);
  let raw = collectVideos(first);
  if (uniqueById(raw).length < MAX_RESULTS) {
    const extra = await youtubeSearch(secondary).catch(() => null);
    if (extra) raw = raw.concat(collectVideos(extra));
  }

  return {
    videos: pickGameplay(uniqueById(raw), name),
    searchUrl: youtubeSearchUrl(primary),
  };
}

async function youtubeSearch(q) {
  const res = await sendNative({
    type: 'http',
    url: YT_SEARCH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
      query: q,
      params: YT_VIDEOS_ONLY,
    }),
    impersonate: 'chrome',
    timeout: 15,
  });
  if (!res?.ok) throw new Error(res?.error || 'curl_cffi host failed');
  if (res.status && res.status >= 400) throw new Error(`YouTube search HTTP ${res.status}`);
  return JSON.parse(res.text || '{}');
}

function collectVideos(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.videoRenderer?.videoId) {
    const video = node.videoRenderer;
    out.push({
      id: video.videoId,
      title: textOf(video.title),
      author: textOf(video.ownerText) || textOf(video.shortBylineText),
      thumb: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      seconds: parseDuration(textOf(video.lengthText)),
      views: parseViews(textOf(video.viewCountText)),
      short: isShort(video),
    });
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out);
    return out;
  }
  for (const value of Object.values(node)) collectVideos(value, out);
  return out;
}

function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text).join('');
  return '';
}

function pickGameplay(videos, name) {
  const ranked = videos
    .map((video) => ({ ...video, score: scoreGameplay(video, name) }))
    .filter((video) => video.score > -8 && !video.short && !(video.seconds > 0 && video.seconds < 90))
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, MAX_RESULTS).map(({ score, seconds, views, short, ...video }) => video);
}

function scoreGameplay(video, name) {
  const title = video.title.toLowerCase();
  let score = 0;
  if (/\bwalkthrough\b/.test(title)) score += 4;
  if (GAMEPLAY_TITLE.test(title)) score += 10;
  if (name && titleIncludesName(title, name)) score += 6;
  else score -= 4;
  if (SKIP_TITLE.test(title)) score -= 12;
  if (video.seconds >= 600) score += 4;
  if (video.seconds >= 1200) score += 2;
  if (video.seconds > 0 && video.seconds < 180) score -= 8;
  if (video.views) score += Math.min(5, Math.log10(video.views));
  return score;
}

function titleIncludesName(title, name) {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !/^(the|and|for|edition)$/.test(w));
  if (!words.length) return title.includes(name.toLowerCase());
  return words.filter((w) => title.includes(w)).length >= Math.ceil(words.length * 0.6);
}

function parseDuration(text) {
  const parts = String(text)
    .split(':')
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  if (!parts.length) return 0;
  return parts.reduce((sum, n) => sum * 60 + n, 0);
}

function parseViews(text) {
  const raw = String(text).replace(/views/i, '').trim().replace(/,/g, '');
  const m = raw.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mul = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase()] || 1;
  return n * mul;
}

function isShort(video) {
  const blob = JSON.stringify(video.thumbnailOverlays || video.badges || '');
  return /SHORTS/i.test(blob);
}

function gameNameFromQuery(query) {
  return String(query ?? '')
    .replace(/\s+gameplay$/i, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function uniqueById(videos) {
  const seen = new Set();
  return videos.filter((video) => {
    if (!video.id || seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  });
}

function youtubeSearchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function sendNative(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
