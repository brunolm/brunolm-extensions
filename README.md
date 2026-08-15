# brunolm

A personal Chromium extension (Brave first, Chrome-compatible) that is a grab-bag of unrelated tools, not a single-purpose product. Each tool is a **namespaced feature** living in its own folder. The shell only owns the toolbar popup, the service worker boot, and message routing.

## Install (Brave)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** and select this folder (`extensions/brunolm`).

If the standalone `video-download-helper` extension is still loaded, disable it. Both would hook `fetch` on X and fight over the toolbar badge.

Reload the extension after any `manifest.json` change.

## Features

### Video Download

Detects videos and audio on the current page and lets you download them. Everything runs locally — no accounts, no tokens, no external services.

1. Open a page with media and **play it** — streams are detected as they load.
2. The toolbar icon badges the number of items found.
3. Click the icon → **Video Download** → **Download**, or **Copy URL**. HLS (`.m3u8`) opens a progress tab that fetches every segment into one file.

Site-specific:

- **X / Twitter** — hooks the page `fetch`/XHR and pulls progressive `.mp4` URLs (video + audio in one file) from `video_info.variants`. Prefer those over the HLS rows.

Limitations:

- **YouTube** adaptive streams are often video-only or audio-only, and URLs expire. Progressive (combined) formats download fine.
- Encrypted HLS / DRM is rejected rather than written as a broken file.
- **DASH (`.mpd`)** saves the manifest only — no assembler.
- `blob:` sources can't be downloaded; the network sniffer usually catches the real stream instead.

## Layout

```
brunolm/
  manifest.json              # name, permissions, every content-script entry
  background/index.js        # boots feature service-worker registrations
  shared/messages.js         # message bus (handle / listen)
  popup/                     # shell: header + feature host
  features/
    catalog.js               # popup panels
    sw.js                    # service-worker registrations
    <feature-id>/            # one folder per feature
  icons/
```

The popup is a host. It always opens on a home list of features. Click a feature to open its panel; ← goes back. A feature can also be a one-shot action (no panel) or list-only.

## Adding a feature

Treat each feature as a mini-extension that happens to share this process. It must not reach into another feature's files, message types, storage keys, or CSS.

1. Create `features/<id>/`. Use a kebab-case id (`link-cleaner`, `tab-stash`).
2. Pick a short prefix (`lc`, `stash`) and use it on **every** public name — see [Namespacing](#namespacing).
3. **Popup** (optional): add an entry to `features/catalog.js`. A panel exports `mount(root)` (and optionally `status(tab)`). A one-shot exports `run()` via `action`.
4. **Background work** (optional): export `register()` from `features/<id>/background.js` and call it from `features/sw.js`.
5. **Content scripts / extra permissions**: declare them in `manifest.json`. MV3 cannot pick these up from the feature folder alone.
6. Reload the unpacked extension.

`features/video-download/` is the reference implementation.

### Popup contract

```js
export async function mount(root) {
  // render into `root` (do not touch the shell header)
  // optionally return a function the shell calls when going home
}

export async function status(tab) {
  return '3 items on this page'; // optional home-card line
}
```

Load feature CSS from the feature folder and prefix every class:

```js
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = new URL('./popup.css', import.meta.url);
document.head.appendChild(link);
```

### Background contract

```js
import { handle } from '../../shared/messages.js';

export function register() {
  handle('prefix:do-thing', (message, sender) => { /* ... */ });
  // attach chrome.* listeners here, not at module top level
}
```

`handle(type, fn)` throws if `type` is already registered. Return a value or a Promise; the bus forwards it through `sendResponse`.

Content scripts stay classic IIFEs (not modules) unless there is a reason not to. A MAIN-world script cannot use `chrome.*` — talk to an isolated-world bridge via `CustomEvent`.

## Namespacing

| Surface | Pattern | Example (`video-download`) |
|---|---|---|
| Feature id / folder | kebab-case | `video-download` |
| Message `type` | `<prefix>:<action>` | `vdh:found-media` |
| `chrome.storage` keys | `<prefix>:<name>` | `vdh:media_${tabId}` |
| CSS classes / ids | `<prefix>-*` | `vdh-item` |
| Page `CustomEvent` names | `__brunolm_<prefix>_*` | `__brunolm_vdh_found` |
| Protocol constants | `features/<id>/protocol.js` | `VDH.GET_MEDIA` |

Do **not** use the `brunolm:` prefix. That is reserved for the shell (`brunolm:last-feature`).

Permissions and host permissions are extension-wide (MV3 has no per-feature permission set). Add only what the new feature actually needs.

## Stack

No build step, no bundler, no TypeScript, no dependencies. Manifest V3 with ES modules in the service worker (`"type": "module"`) and the popup. Load unpacked as this folder.
