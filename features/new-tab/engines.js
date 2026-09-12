// `%s` is replaced with the encoded query.
export const ENGINES = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { id: 'brave', name: 'Brave', url: 'https://search.brave.com/search?q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=%s' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s' },
  { id: 'wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=%s' },
];

export function engineUrl(engine, query) {
  return engine.url.replace('%s', encodeURIComponent(query));
}
