(() => {
  const HOLD_DEFAULT = 550;
  const MOVE_PX = 8;

  let holdMs = HOLD_DEFAULT;
  let holdTimer = 0;
  let suppressClick = false;
  let host = null;
  let card = null;
  let currentUrl = '';
  let lastAnchor = null;
  let lastX = 0;
  let lastY = 0;
  let inflight = false;

  chrome.storage.local.get('lp:hold-ms', (data) => {
    if (Number(data['lp:hold-ms'])) holdMs = Number(data['lp:hold-ms']);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Number(changes['lp:hold-ms']?.newValue)) {
      holdMs = Number(changes['lp:hold-ms'].newValue);
    }
  });

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onSuppress, true);
  document.addEventListener('click', onSuppress, true);
  document.addEventListener('contextmenu', onSuppress, true);
  document.addEventListener('keydown', onKeyDown, true);

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (host?.contains(event.target)) return;
    if (inflight && host) return;

    dismiss();
    const anchor = event.target.closest?.('a[href]');
    const url = httpUrl(anchor);
    if (!url) return;

    const startX = event.clientX;
    const startY = event.clientY;

    const cancel = (move) => {
      if (move.type === 'pointermove' && Math.hypot(move.clientX - startX, move.clientY - startY) < MOVE_PX) {
        return;
      }
      window.clearTimeout(holdTimer);
      holdTimer = 0;
      removeHoldListeners();
    };

    const removeHoldListeners = () => {
      document.removeEventListener('pointerup', cancel, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('pointermove', cancel, true);
    };

    document.addEventListener('pointerup', cancel, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('pointermove', cancel, true);

    holdTimer = window.setTimeout(() => {
      removeHoldListeners();
      suppressClick = true;
      openPreview(anchor, url, event.clientX, event.clientY);
    }, holdMs);
  }

  function onSuppress(event) {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'click') suppressClick = false;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') dismiss();
  }

  async function openPreview(anchor, url, x, y) {
    currentUrl = url;
    lastAnchor = anchor;
    lastX = x;
    lastY = y;
    mountCard(anchor, x, y);
    setCard({ url, host: hostnameOf(url), title: hostnameOf(url), wait: 'Grok is summarizing…' });
    inflight = true;
    log('preview-open', { url });

    try {
      log('summarize-send', { url });
      const summary = await request({ type: 'lp:summarize', url }, 50_000);
      if (typeof summary === 'string') throw new Error(summary);
      log('preview-apply', { url, points: summary?.points?.length ?? 0, hasCard: Boolean(card) });
      showResult(url, {
        url: summary?.url || url,
        host: summary?.host || hostnameOf(url),
        title: summary?.title || hostnameOf(url),
        description: summary?.description,
        image: summary?.image,
        hero: summary?.hero,
        blurb: summary?.blurb,
        points: summary?.points,
        error: summary?.error === 'no-host' ? 'Install the Grok CLI host in brunolm → Link Preview.' : '',
        wait: '',
      });
    } catch (err) {
      log('preview-error', { url, error: err.message });
      showResult(url, { url, host: hostnameOf(url), title: hostnameOf(url), error: err.message || 'Preview failed' });
    } finally {
      inflight = false;
    }
  }

  function showResult(url, data) {
    if (currentUrl !== url) {
      log('preview-skip-url', { url, currentUrl });
      return;
    }
    if (!card && lastAnchor) mountCard(lastAnchor, lastX, lastY);
    if (!card) {
      log('preview-skip-no-card', { url });
      return;
    }
    setCard(data);
  }

  function log(event, extra) {
    chrome.runtime.sendMessage({ type: 'lp:log', event, extra }).catch(() => {});
  }

  function mountCard(anchor, x, y) {
    host?.remove();
    host = document.createElement('div');
    host.id = 'lp-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('features/link-preview/tooltip.css');

    card = document.createElement('div');
    card.className = 'lp-card';
    shadow.append(link, card);
    document.documentElement.appendChild(host);
    placeCard(anchor, x, y);
  }

  function setCard(data) {
    if (!card) return;
    card.replaceChildren();

    if (data.image) {
      const img = document.createElement('img');
      img.className = data.hero === false ? 'lp-icon' : 'lp-image';
      img.src = data.image;
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      if (data.hero === false) {
        const wrap = document.createElement('div');
        wrap.className = 'lp-icon-wrap';
        wrap.appendChild(img);
        card.appendChild(wrap);
      } else {
        card.appendChild(img);
      }
    }

    const body = document.createElement('div');
    body.className = 'lp-body';

    const hostLine = document.createElement('div');
    hostLine.className = 'lp-host';
    hostLine.textContent = data.host || hostnameOf(data.url);

    const title = document.createElement('div');
    title.className = 'lp-title';
    title.textContent = data.title || data.host || data.url;

    body.append(hostLine, title);

    if (data.description) {
      const desc = document.createElement('p');
      desc.className = 'lp-desc';
      desc.textContent = data.description;
      body.appendChild(desc);
    }

    if (data.blurb) {
      const blurb = document.createElement('p');
      blurb.className = 'lp-blurb';
      blurb.textContent = data.blurb;
      body.appendChild(blurb);
    }

    if (data.points?.length) {
      const list = document.createElement('ul');
      list.className = 'lp-points';
      for (const point of data.points) {
        const li = document.createElement('li');
        li.textContent = point;
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    if (data.wait) {
      const wait = document.createElement('p');
      wait.className = 'lp-wait';
      wait.textContent = data.wait;
      body.appendChild(wait);
    }

    if (data.error) {
      const error = document.createElement('p');
      error.className = 'lp-error';
      error.textContent = data.error;
      body.appendChild(error);
    }

    const probe = document.createElement('p');
    probe.className = 'lp-probe';
    probe.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'lp-actions';

    const open = document.createElement('button');
    open.className = 'lp-open';
    open.type = 'button';
    open.textContent = 'Open link';
    open.addEventListener('click', () => {
      window.open(data.url, '_blank', 'noopener');
      dismiss();
    });

    const test = document.createElement('button');
    test.className = 'lp-test';
    test.type = 'button';
    test.textContent = 'Test connection';
    test.addEventListener('click', () => runConnectionTest(test, probe));

    actions.append(open, test);
    body.append(probe, actions);
    card.appendChild(body);
    placeCard(lastAnchor, lastX, lastY);
  }

  async function runConnectionTest(button, probe) {
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Testing…';
    probe.hidden = false;
    probe.className = 'lp-probe';
    probe.textContent = 'Pinging Grok host…';
    try {
      const ping = await request({ type: 'lp:ping' }, 15_000);
      if (typeof ping === 'string') throw new Error(ping);
      if (!ping?.ok) throw new Error(ping?.error || 'Host not installed');
      probe.className = 'lp-probe lp-probe-ok';
      probe.textContent = `Host ok${ping.grok ? ` — ${ping.grok}` : ''}`;
    } catch (err) {
      probe.className = 'lp-probe lp-error';
      probe.textContent = err.message || 'Connection failed';
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function placeCard(anchor, x, y) {
    if (!host || !card) return;
    const gap = 8;
    const width = 320;
    const left = Math.min(Math.max(8, x - width / 2), window.innerWidth - width - 8);
    let top = y + gap;
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;

    const box = card.getBoundingClientRect();
    if (box.bottom > window.innerHeight - 8) {
      const above = (anchor?.getBoundingClientRect().top ?? y) - box.height - gap;
      host.style.top = `${Math.max(8, above)}px`;
    }
  }

  function dismiss() {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    currentUrl = '';
    host?.remove();
    host = null;
    card = null;
  }

  function request(message, ms) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out. Check the extension service worker console.'));
      }, ms);

      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function httpUrl(anchor) {
    if (!anchor) return '';
    try {
      const url = new URL(anchor.href, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      if (url.href === location.href) return '';
      return url.toString();
    } catch {
      return '';
    }
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
})();
