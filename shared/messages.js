const handlers = new Map();

export function handle(type, fn) {
  if (handlers.has(type)) {
    throw new Error(`duplicate message handler: ${type}`);
  }
  handlers.set(type, fn);
}

export function listen() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return;
    const fn = handlers.get(message.type);
    if (!fn) return;

    const out = fn(message, sender);
    if (out && typeof out.then === 'function') {
      out.then(sendResponse, (err) => sendResponse(err?.message ?? String(err)));
      return true;
    }

    if (out !== undefined) sendResponse(out);
  });
}
