// Popup catalog. A feature may have load (panel), action (one-shot), or neither.
export const features = [
  {
    id: 'video-download',
    name: 'Video Download',
    description: 'Detect and download videos and audio on this page',
    load: () => import('./video-download/popup.js'),
  },
];
