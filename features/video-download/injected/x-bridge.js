window.addEventListener('__brunolm_vdh_found', (event) => {
  let variants;
  try {
    variants = JSON.parse(event.detail);
  } catch {
    return;
  }

  const items = variants.map((v) => {
    const resolution = v.url.match(/\/(\d{3,4}x\d{3,4})\//)?.[1];
    const label = [resolution, v.bitrate ? `${Math.round(v.bitrate / 1000)} kbps` : null]
      .filter(Boolean)
      .join(' · ');
    return {
      url: v.url,
      kind: 'video',
      label,
      contentType: 'video/mp4',
      thumb: v.thumb ?? null,
      pageTitle: document.title,
    };
  });

  chrome.runtime.sendMessage({ type: 'vdh:found-media', items }).catch(() => {});
});
