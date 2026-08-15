// Runs in the page's MAIN world on x.com/twitter.com. The player streams HLS,
// but the API responses also list direct progressive mp4 URLs (video+audio in
// one file) under video_info.variants — hook fetch/XHR to capture them.
(() => {
  const seen = new Set();

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      res.clone().text().then(inspect).catch(() => {});
    } catch {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', () => {
      try {
        if (typeof this.responseText === 'string') inspect(this.responseText);
      } catch {}
    });
    return origOpen.apply(this, args);
  };

  function inspect(text) {
    if (!text || !text.includes('video_info')) return;
    try {
      report(extractVariants(JSON.parse(text)));
    } catch {}
  }

  function extractVariants(root) {
    const found = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;

      // media entity shape: { media_url_https, video_info: { variants: [...] } }
      if (node.video_info && Array.isArray(node.video_info.variants)) {
        const thumb = node.media_url_https || node.media_url || null;
        for (const v of node.video_info.variants) {
          if (v.content_type === 'video/mp4' && v.url) {
            found.push({ url: v.url, bitrate: v.bitrate ?? 0, thumb });
          }
        }
        continue;
      }

      for (const key in node) stack.push(node[key]);
    }
    return found;
  }

  function report(variants) {
    const fresh = variants.filter((v) => !seen.has(v.url));
    if (!fresh.length) return;

    for (const v of fresh) seen.add(v.url);
    window.dispatchEvent(new CustomEvent('__brunolm_vdh_found', { detail: JSON.stringify(fresh) }));
  }
})();
