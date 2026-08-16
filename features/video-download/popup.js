import { groupCount, groupKey } from './groups.js';
import { MIN_VIDEO_BYTES } from './limits.js';
import { VDH } from './protocol.js';

const STYLE_ID = 'vdh-popup-css';

export async function mount(root) {
  ensureStyles();
  root.innerHTML = `
    <div class="vdh-list"></div>
    <div class="vdh-empty" hidden>
      <p>No media detected on this page yet.</p>
      <p class="vdh-hint">Play the video first — streams are detected as they load.</p>
    </div>
  `;

  const list = root.querySelector('.vdh-list');
  const empty = root.querySelector('.vdh-empty');
  const rows = new Map();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    empty.hidden = false;
    return;
  }

  const response = (await chrome.runtime.sendMessage({ type: VDH.GET_MEDIA, tabId: tab.id })) ?? {};
  const items = response.items ?? [];
  render(buildGroups(items), tab, response.pageThumb ?? null, { list, empty, rows });
  await enhance(items, rows);
  refreshEmptyState(empty, rows);

  const dropped = items.filter((item) => !rows.has(item.url)).map((item) => item.url);
  if (dropped.length) {
    chrome.runtime.sendMessage({ type: VDH.PRUNE, urls: dropped }).catch(() => {});
  }
}

export async function status(tab) {
  if (!tab?.id) return '';
  const response = await chrome.runtime.sendMessage({ type: VDH.GET_MEDIA, tabId: tab.id }).catch(() => null);
  const n = groupCount(response?.items ?? []);
  if (!n) return 'No media on this page';
  return n === 1 ? '1 item on this page' : `${n} items on this page`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./popup.css', import.meta.url);
  document.head.appendChild(link);
}

function buildGroups(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = groupKey(item);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }

  return [...byKey.values()].map((variants) => {
    variants.sort((a, b) => pixelsOf(b) - pixelsOf(a));
    const foundAt = Math.max(...variants.map((item) => item.foundAt ?? 0));
    return { variants, current: variants[0], foundAt };
  });
}

function render(groups, tab, pageThumb, ui) {
  groups.sort((a, b) => b.foundAt - a.foundAt);

  for (const group of groups) {
    ui.list.appendChild(renderItem(group, tab, pageThumb, ui));
  }
  refreshEmptyState(ui.empty, ui.rows);
}

function renderItem(group, tab, pageThumb, ui) {
  const item = group.current;

  const row = document.createElement('div');
  row.className = 'vdh-item';

  const thumb = document.createElement('div');
  thumb.className = 'vdh-thumb';

  const thumbSrc = item.thumb || pageThumb;
  if (thumbSrc) {
    const img = document.createElement('img');
    img.src = thumbSrc;
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    thumb.appendChild(img);
  }

  const badge = document.createElement('span');
  badge.className = `vdh-badge ${item.kind}`;
  badge.textContent = item.kind;
  thumb.appendChild(badge);

  const info = document.createElement('div');
  info.className = 'vdh-info';

  const name = document.createElement('div');
  name.className = 'vdh-name';
  name.textContent = displayName(item, tab);
  name.title = item.url;

  const meta = document.createElement('div');
  meta.className = 'vdh-meta';
  meta.textContent = metaText(item);

  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'vdh-actions';

  const select = group.variants.length > 1 ? renderQualitySelect(group, name, meta) : null;
  if (select) actions.appendChild(select);

  const download = document.createElement('button');
  download.textContent = item.kind === 'hls' ? 'Download stream' : 'Download';
  download.addEventListener('click', () => startDownload(group.current, tab, download));

  const copy = document.createElement('button');
  copy.className = 'vdh-secondary';
  copy.textContent = 'Copy URL';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(group.current.url);
    copy.textContent = 'Copied!';
    setTimeout(() => (copy.textContent = 'Copy URL'), 1200);
  });

  actions.append(download, copy);
  row.append(thumb, info, actions);

  for (const variant of group.variants) {
    ui.rows.set(variant.url, {
      row,
      group,
      item: variant,
      metaEl: meta,
      option: select?.querySelector(`option[value="${CSS.escape(variant.url)}"]`) ?? null,
    });
  }
  return row;
}

function renderQualitySelect(group, nameEl, metaEl) {
  const select = document.createElement('select');
  select.className = 'vdh-quality';

  for (const variant of group.variants) {
    const option = document.createElement('option');
    option.value = variant.url;
    option.textContent = optionLabel(variant);
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    group.current = group.variants.find((v) => v.url === select.value) ?? group.variants[0];
    nameEl.title = group.current.url;
    metaEl.textContent = metaText(group.current);
  });

  return select;
}

function optionLabel(variant) {
  const res = resolutionOf(variant);
  const parts = [res ? `${res.w}x${res.h}` : variant.label || 'default'];
  if (variant.size) parts.push(formatSize(variant.size));
  return parts.join(' · ');
}

function resolutionOf(item) {
  const m = (item.url.match(/\/(\d{3,4})x(\d{3,4})\//) ?? item.label?.match(/(\d{3,4})x(\d{3,4})/)) || null;
  return m ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : null;
}

function pixelsOf(item) {
  const res = resolutionOf(item);
  return res ? res.w * res.h : 0;
}

async function enhance(items, rows) {
  const direct = items.filter((i) => i.kind === 'video' || i.kind === 'audio');
  const hls = items.filter((i) => i.kind === 'hls');

  await Promise.all([...direct.map((item) => probeAndUpdate(item, rows)), classifyHls(hls, rows)]);
}

async function probeAndUpdate(item, rows) {
  const size = await probeSize(item.url);
  const entry = rows.get(item.url);
  if (!entry || !size) return;

  const isLoneInitSegment =
    entry.group.variants.length === 1 && item.kind === 'video' && size < MIN_VIDEO_BYTES;
  if (isLoneInitSegment) {
    entry.row.remove();
    rows.delete(item.url);
    return;
  }

  entry.item.size = size;
  if (entry.option) entry.option.textContent = optionLabel(entry.item);
  if (entry.group.current === entry.item) entry.metaEl.textContent = metaText(entry.item);
}

async function probeSize(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, credentials: 'include' });
    res.body?.cancel();

    const total = res.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
    if (total) return parseInt(total, 10);
    if (res.status === 200) return parseInt(res.headers.get('content-length') ?? '0', 10);
    return 0;
  } catch {
    return 0;
  }
}

async function classifyHls(items, rows) {
  const masters = [];
  const hide = new Set();

  await Promise.all(
    items.map(async (item) => {
      const text = await fetchText(item.url);
      if (!text.includes('#EXTM3U') || text.includes('#EXT-X-I-FRAMES-ONLY')) {
        hide.add(item.url);
        return;
      }

      if (!text.includes('#EXT-X-STREAM-INF')) {
        const hasSegment = text.split(/\r?\n/).some((line) => line && !line.startsWith('#'));
        if (!hasSegment) hide.add(item.url);
        return;
      }

      const variants = new Set();
      let best = null;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
        const resolution = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1];
        const bandwidth = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
        if (!best || bandwidth > best.bandwidth) best = { resolution, bandwidth };

        const uri = lines.slice(i + 1).find((l) => l && !l.startsWith('#'));
        if (uri) variants.add(pathOf(new URL(uri, item.url).toString()));
      }
      for (const line of lines) {
        const uri = line.startsWith('#EXT-X-MEDIA') && line.match(/URI="([^"]+)"/)?.[1];
        if (uri) variants.add(pathOf(new URL(uri, item.url).toString()));
      }

      if (!variants.size) {
        hide.add(item.url);
        return;
      }

      masters.push({ item, variants });

      const entry = rows.get(item.url);
      if (entry && best) {
        entry.item.label = ['master', best.resolution].filter(Boolean).join(' · ');
        entry.item.size = 0;
        entry.metaEl.textContent = metaText(entry.item);
      }
    }),
  );

  for (const item of items) {
    const covered = masters.some((m) => m.item.url !== item.url && m.variants.has(pathOf(item.url)));
    if (hide.has(item.url) || covered) {
      rows.get(item.url)?.row.remove();
      rows.delete(item.url);
    }
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

function refreshEmptyState(empty, rows) {
  empty.hidden = rows.size > 0;
}

async function startDownload(item, tab, button) {
  if (item.kind === 'hls') {
    const url = chrome.runtime.getURL(
      `features/video-download/downloader/downloader.html?src=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.pageTitle || tab.title || 'video')}`,
    );
    await chrome.tabs.create({ url });
    window.close();
    return;
  }

  if (item.kind === 'dash') {
    await chrome.runtime.sendMessage({
      type: VDH.DOWNLOAD,
      url: item.url,
      filename: `${sanitize(tab.title ?? 'video')}.mpd`,
      saveAs: true,
    });
    return;
  }

  button.textContent = 'Starting…';
  const error = await chrome.runtime.sendMessage({
    type: VDH.DOWNLOAD,
    url: item.url,
    filename: suggestedFilename(item, tab),
    saveAs: true,
  });
  button.textContent = error ? 'Failed' : 'Download';
}

function metaText(item) {
  const size = item.kind === 'hls' || !item.size ? null : formatSize(item.size);
  return [item.label || null, hostOf(item.url), size, item.contentType || null]
    .filter(Boolean)
    .join(' · ');
}

function displayName(item, tab) {
  if (item.label && item.pageTitle) return item.pageTitle;
  const file = fileOf(item.url);
  if (file && !/^[0-9a-f-]{20,}/i.test(file)) return file;
  return item.pageTitle || tab.title || file || item.url;
}

function suggestedFilename(item, tab) {
  const ext = (fileOf(item.url).match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? extFromType(item)).toLowerCase();
  const base = sanitize(item.pageTitle || tab.title || 'media');
  const res = resolutionOf(item);
  return res ? `${base} (${res.w}x${res.h}).${ext}` : `${base}.${ext}`;
}

function extFromType(item) {
  const type = item.contentType ?? '';
  if (type.includes('webm')) return 'webm';
  if (type.startsWith('audio/')) return 'mp3';
  return 'mp4';
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'media';
}

function fileOf(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  } catch {
    return '';
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}
