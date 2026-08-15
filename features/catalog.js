// Popup catalog. A feature may have load (panel), action (one-shot), or neither.
export const features = [
  {
    id: 'video-download',
    name: 'Video Download',
    description: 'Detect and download videos and audio on this page',
    load: () => import('./video-download/popup.js'),
  },
  {
    id: 'link-preview',
    name: 'Link Preview',
    description: 'Long-press a link for a preview and Grok key points',
    load: () => import('./link-preview/popup.js'),
  },
];
