const handlers = new Map();

export function handle(type, fn) {
  if (handlers.has(type)) {
    throw new Error(`duplicate message handler: ${type}`);
  }
  handlers.set(type, fn);
}

export function listen() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!message?.type) return;
    const fn = handlers.get(message.type);
    if (!fn) return;
    return Promise.resolve()
      .then(() => fn(message, sender))
      .catch((err) => err?.message ?? String(err));
  });
}
