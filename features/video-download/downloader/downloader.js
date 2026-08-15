const CONCURRENCY = 6;

const params = new URLSearchParams(location.search);
const src = params.get('src');
const title = params.get('title') || 'video';

const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
document.getElementById('title').textContent = title;

main().catch((err) => {
  statusEl.textContent = `Failed: ${err.message}`;
  statusEl.style.color = '#b91c1c';
});

async function main() {
  if (!src) throw new Error('missing src parameter');

  const { videoUrl, audioUrl } = await resolvePlaylists(src);

  const video = await assemble(videoUrl, 'video');
  await save(video, sanitize(title));

  // some streams (e.g. X/Twitter fmp4 HLS) carry audio as a separate
  // rendition — save it as a second file since we can't mux without ffmpeg
  if (audioUrl) {
    const audio = await assemble(audioUrl, 'audio');
    await save(audio, `${sanitize(title)}.audio`);
    statusEl.textContent =
      'Done — video and audio saved as separate files (this stream keeps them apart; merge with ffmpeg if needed).';
  } else {
    statusEl.textContent = `Done — ${formatSize(video.blob.size)} saved.`;
  }

  statusEl.style.color = '#047857';
  progressEl.style.width = '100%';
}

async function assemble(url, label) {
  const text = await fetchText(url);
  const { initUrl, segments, keyInfo } = parseMediaPlaylist(text, url);
  if (!segments.length) throw new Error(`no segments found in ${label} playlist`);
  if (keyInfo) throw new Error('stream is AES-encrypted (DRM/protected) — not supported');

  const parts = [];
  if (initUrl) parts.push(await fetchBuffer(initUrl));

  let done = 0;
  const results = new Array(segments.length);
  await runPool(segments, CONCURRENCY, async (segUrl, i) => {
    results[i] = await fetchBuffer(segUrl);
    done++;
    statusEl.textContent = `Downloading ${label} segments… ${done}/${segments.length}`;
    progressEl.style.width = `${(done / segments.length) * 100}%`;
  });
  parts.push(...results);

  const isFmp4 = !!initUrl || /\.(m4s|mp4)(?=[?#]|$)/i.test(segments[0]);
  const ext = isFmp4 ? (label === 'audio' ? 'm4a' : 'mp4') : 'ts';
  return { blob: new Blob(parts, { type: isFmp4 ? 'video/mp4' : 'video/mp2t' }), ext };
}

async function save({ blob, ext }, name) {
  await chrome.downloads.download({
    url: URL.createObjectURL(blob),
    filename: `${name}.${ext}`,
    saveAs: true,
  });
}

async function resolvePlaylists(url) {
  const text = await fetchText(url);
  if (!text.includes('#EXT-X-STREAM-INF')) return { videoUrl: url, audioUrl: null };

  // master playlist: pick the highest-bandwidth variant
  const lines = text.split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const bandwidth = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const audioGroup = lines[i].match(/AUDIO="([^"]+)"/)?.[1] ?? null;
    const uri = lines.slice(i + 1).find((l) => l && !l.startsWith('#'));
    if (uri) variants.push({ bandwidth, audioGroup, url: new URL(uri, url).toString() });
  }
  if (!variants.length) throw new Error('master playlist has no variants');

  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  const best = variants[0];
  statusEl.textContent = `Selected best quality (${Math.round(best.bandwidth / 1000)} kbps)…`;

  let audioUrl = null;
  if (best.audioGroup) {
    const media = lines.find(
      (l) => l.startsWith('#EXT-X-MEDIA') && l.includes('TYPE=AUDIO') && l.includes(`GROUP-ID="${best.audioGroup}"`),
    );
    const uri = media?.match(/URI="([^"]+)"/)?.[1];
    if (uri) audioUrl = new URL(uri, url).toString();
  }

  return { videoUrl: best.url, audioUrl };
}

function parseMediaPlaylist(text, baseUrl) {
  const segments = [];
  let initUrl = null;
  let keyInfo = null;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#EXT-X-MAP')) {
      const uri = line.match(/URI="([^"]+)"/)?.[1];
      if (uri) initUrl = new URL(uri, baseUrl).toString();
    } else if (line.startsWith('#EXT-X-KEY') && !line.includes('METHOD=NONE')) {
      keyInfo = line;
    } else if (line && !line.startsWith('#')) {
      segments.push(new URL(line, baseUrl).toString());
    }
  }

  return { initUrl, segments, keyInfo };
}

async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching playlist`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching segment`);
  return res.arrayBuffer();
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}
