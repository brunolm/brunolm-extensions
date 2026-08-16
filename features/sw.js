// Service-worker side. Import and call each feature's register() here.
import { register as registerLinkPreview } from './link-preview/background.js';
import { register as registerSteamGameplay } from './steam-gameplay/background.js';
import { register as registerVideoDownload } from './video-download/background.js';

export function registerAll() {
  registerVideoDownload();
  registerLinkPreview();
  registerSteamGameplay();
}
