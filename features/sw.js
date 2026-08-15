// Service-worker side. Import and call each feature's register() here.
import { register as registerVideoDownload } from './video-download/background.js';

export function registerAll() {
  registerVideoDownload();
}
