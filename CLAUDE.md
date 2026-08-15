# brunolm

Personal Manifest V3 grab-bag extension (Brave first). Unrelated tools share one process. Each tool is a **namespaced feature** in `features/<id>/`. Human-facing install and usage: `README.md`.

No build step. Vanilla JS modules. Do not add a bundler, TypeScript, or a dependency unless the user asks.

## Where things live

| Path | Owns |
|---|---|
| `popup/` | Host: home list + back navigation. No feature UI. |
| `background/index.js` | Boot only: `registerAll()` then `listen()`. |
| `shared/messages.js` | `handle(type, fn)` / `listen()`. Kernel, not a junk drawer. |
| `features/catalog.js` | Popup feature list. |
| `features/sw.js` | Service-worker `register()` calls. |
| `features/<id>/` | One feature. It does not import another feature. |
| `manifest.json` | Permissions + every content-script entry. |

Do not put feature logic in the shell. Do not "just add it to `background/index.js`". Do not share helpers across features unless the same function is already used in two places and is conceptually the same.

Reference feature: `features/video-download/`.

## Adding a feature

1. Create `features/<id>/` (kebab-case id).
2. Pick a short prefix (`vdh`, `lc`) and namespace everything — see below.
3. Popup: add a catalog entry. Panel → `load` + `mount(root)`. One-shot → `action` + `run()`. Optional `status(tab)` for the home-card line.
4. Background: export `register()`, import and call it from `features/sw.js`.
5. Content scripts, host permissions, extra `permissions`: edit `manifest.json`. They cannot be discovered from the folder.
6. Stop. Do not also wire the new feature into another feature's files.

A feature may have only a popup, only a background, only content scripts, or any mix.

### Catalog + popup

The shell always opens on the home list. It does not skip to a feature, even when there is only one.

```js
{
  id: 'video-download',
  name: 'Video Download',
  description: 'Detect and download videos and audio on this page',
  load: () => import('./video-download/popup.js'),   // panel
  // action: () => import('./thing/action.js'),      // one-shot, no panel
}
```

- `load` — click opens a panel. Module exports `mount(root)` and optionally `status(tab)` (string shown on the home card).
- `action` — click runs `run()` and stays on home. A returned string is toasted.
- neither — card is listed, disabled.

```js
export async function mount(root) { /* render into root */ }
export async function status(tab) { return '3 items on this page'; }
```

- Render only into `root`. The shell owns the header and the back button.
- Optionally return an unmount function (called when going home).
- Inject CSS yourself (`new URL('./popup.css', import.meta.url)`). Prefix every class (`vdh-item`, not `item`).

### `register()`

```js
import { handle } from '../../shared/messages.js';

export function register() {
  handle('prefix:action', (message, sender) => { /* return value or Promise */ });
}
```

- Attach `chrome.*` listeners inside `register()`, not at module top level.
- `handle()` throws on a duplicate `type` — that is intentional.
- Returning a Promise keeps the message channel open (`sendResponse` on settle). A thrown error becomes the response string.

### Content scripts

- Declare each file in `manifest.json` `content_scripts`. Isolated world for `chrome.*`; MAIN world for page-hooking (`fetch` / XHR).
- MAIN world cannot use `chrome.*`. Dispatch a namespaced `CustomEvent`; an isolated-world bridge forwards it with `chrome.runtime.sendMessage`.
- Prefer classic IIFE scripts. They cannot `import` `protocol.js`, so keep the `type` string literals identical to that file.
- `document_start` hooks that must not miss the first request belong in the manifest, not `chrome.scripting.registerContentScripts`.

## Namespacing (mandatory)

Every public name a feature introduces is prefixed. Collisions are a bug.

| Surface | Pattern | Do not |
|---|---|---|
| Message `type` | `<prefix>:<action>` | `'get-media'`, `'download'` |
| `chrome.storage` keys | `<prefix>:<name>` | `media_${tabId}` |
| CSS classes / ids | `<prefix>-*` | `.item`, `#list` |
| Page events | `__brunolm_<prefix>_*` | `__found`, a generic `message` listener |
| Protocol constants | `features/<id>/protocol.js` | scattering magic strings in the SW/popup |

`brunolm:` is reserved for the shell. Features never write that prefix.

Put the feature's message types in `protocol.js` and import them from module files (background, popup). Content-script IIFEs duplicate the same literal strings.

Permissions are extension-wide. Add only what this feature needs. The toolbar badge is currently owned by `video-download` — do not write it from another feature without a shared badge API.

## Coding

- Guard clauses / early returns. Truthy checks (`if (x)`) unless `0` / `''` / `false` are valid.
- `async`/`await`. No `.then` chains. `await x().catch(() => fallback)` is fine.
- Newspaper / call-order in each file: imports, constants, exported entry, then helpers in call order. Shared helpers above the internals block; trivial leaves at the bottom.
- Comments only for a *why* the code cannot show (hidden constraint, platform quirk, non-obvious choice). No narration, no ticket numbers, no TODOs without an action.
- Match the surrounding file. No new abstraction that only one caller needs.

## Do not

- Import one feature from another.
- Route feature messages through a generic unprefixed type.
- Move video-download (or any feature) code "up" into `shared/` because a second feature might want it someday.
- Add options pages, feature enable/disable flags, or a build pipeline unless asked.
- Leave the standalone `../video-download-helper` extension as a required runtime. This repo is the one that runs.
