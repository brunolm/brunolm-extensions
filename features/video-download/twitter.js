export function withoutRedundantTwitterHls(items) {
  if (!items.some((item) => item.kind === 'video' && isTwimgUrl(item.url))) return items;
  return items.filter((item) => item.kind !== 'hls' || !isTwimgUrl(item.url));
}

function isTwimgUrl(url) {
  try {
    return new URL(url).hostname.endsWith('twimg.com');
  } catch {
    return false;
  }
}
