(() => {
  const reported = new Set();
  let debounceTimer;

  reportPageThumb();
  scan();
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scan, 1000);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function reportPageThumb() {
    const thumb = document.querySelector('meta[property="og:image"]')?.content;
    if (!thumb || !thumb.startsWith('http')) return;
    chrome.runtime.sendMessage({ type: 'vdh:page-thumb', thumb }).catch(() => {});
  }

  function scan() {
    const items = [];

    for (const el of document.querySelectorAll('video, audio, video source, audio source')) {
      const src = el.currentSrc || el.src || el.getAttribute('src');
      const video = el.closest('video');
      collect(items, src, el.closest('audio') ? 'audio' : 'video', video?.poster || null);
    }

    const ogThumb = document.querySelector('meta[property="og:image"]')?.content ?? null;
    for (const meta of document.querySelectorAll(
      'meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]',
    )) {
      collect(items, meta.content, 'video', ogThumb);
    }

    if (items.length) {
      chrome.runtime.sendMessage({ type: 'vdh:found-media', items }).catch(() => {});
    }
  }

  function collect(items, src, kind, thumb) {
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return;

    let url;
    try {
      url = new URL(src, location.href).toString();
    } catch {
      return;
    }
    if (!url.startsWith('http') || reported.has(url)) return;

    reported.add(url);
    items.push({ url, kind, thumb, pageTitle: document.title });
  }
})();
