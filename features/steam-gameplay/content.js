(() => {
  const STYLE_ID = 'sg-panel-css';

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'sg:page-info') return;
    const game = readGame();
    sendResponse(
      game
        ? { name: game.name, appId: game.appId, query: gameplayQuery(game.name) }
        : null,
    );
    return true;
  });

  const first = readGame();
  if (first) {
    mount(first);
  } else {
    const observer = new MutationObserver(() => {
      const game = readGame();
      if (!game) return;
      observer.disconnect();
      mount(game);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function readGame() {
    const appId = location.pathname.match(/\/app\/(\d+)/)?.[1];
    if (!appId) return null;

    const name = (
      document.querySelector('#appHubAppName')?.textContent ||
      document.querySelector('.apphub_AppName')?.textContent ||
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title.replace(/\s+on Steam$/i, '')
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (!name || name === 'Steam') return null;
    return { appId, name };
  }

  function mount(info) {
    if (document.getElementById('sg-wrap')) return;
    ensureStyles();

    const wrap = document.createElement('div');
    wrap.id = 'sg-wrap';
    wrap.className = 'sg-wrap';
    wrap.innerHTML = `
      <div class="sg-bar">
        <span class="sg-label">YouTube gameplay</span>
        <a class="sg-search" target="_blank" rel="noopener">More on YouTube</a>
      </div>
      <div class="sg-stage">
        <div class="sg-list">${'<div class="sg-item sg-skel" aria-hidden="true"></div>'.repeat(6)}</div>
        <p class="sg-empty">Loading videos…</p>
      </div>
    `;

    const query = gameplayQuery(info.name);
    wrap.querySelector('.sg-search').href = youtubeSearchUrl(query);
    insert(wrap);
    fillResults(wrap, query);
  }

  async function fillResults(wrap, query) {
    const list = wrap.querySelector('.sg-list');
    const empty = wrap.querySelector('.sg-empty');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'sg:search', query });
      if (typeof response === 'string') throw new Error(response);
      if (response?.searchUrl) wrap.querySelector('.sg-search').href = response.searchUrl;

      const videos = response?.videos ?? [];
      if (!videos.length) {
        empty.textContent = 'No videos found — use More on YouTube.';
        return;
      }

      empty.hidden = true;
      list.replaceChildren();
      for (const video of videos) {
        list.appendChild(renderVideo(video));
      }
      while (list.children.length < 6) {
        const pad = document.createElement('div');
        pad.className = 'sg-item sg-skel';
        pad.setAttribute('aria-hidden', 'true');
        list.appendChild(pad);
      }
    } catch (err) {
      empty.hidden = false;
      empty.textContent = err.message || 'Could not load YouTube results.';
    }
  }

  function renderVideo(video) {
    const a = document.createElement('a');
    a.className = 'sg-item';
    a.href = video.url;
    a.rel = 'noopener';
    a.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      openModal(video);
    });

    const img = document.createElement('img');
    img.className = 'sg-thumb';
    img.src = video.thumb;
    img.alt = '';

    const meta = document.createElement('div');
    meta.className = 'sg-meta';

    const title = document.createElement('div');
    title.className = 'sg-title';
    title.textContent = video.title;

    const author = document.createElement('div');
    author.className = 'sg-author';
    author.textContent = video.author;

    meta.append(title, author);
    a.append(img, meta);
    return a;
  }

  function openModal(video) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'sg-modal';
    overlay.className = 'sg-modal';
    overlay.innerHTML = `
      <div class="sg-modal-card">
        <div class="sg-modal-bar">
          <div class="sg-modal-title"></div>
          <button type="button" class="sg-modal-close" aria-label="Close">×</button>
        </div>
        <div class="sg-modal-player">
          <iframe class="sg-modal-frame" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
        </div>
      </div>
    `;
    overlay.querySelector('.sg-modal-title').textContent = video.title;
    overlay.querySelector('.sg-modal-frame').src =
      `https://www.youtube.com/embed/${encodeURIComponent(video.id)}?autoplay=1&rel=0`;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    overlay.querySelector('.sg-modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', onModalKey);
    document.documentElement.appendChild(overlay);
  }

  function closeModal() {
    document.removeEventListener('keydown', onModalKey);
    document.getElementById('sg-modal')?.remove();
  }

  function onModalKey(event) {
    if (event.key === 'Escape') closeModal();
  }

  function insert(wrap) {
    const header = document.querySelector('.apphub_HomeHeaderContent') || document.querySelector('#appHubAppName')?.parentElement;
    if (header) {
      header.insertAdjacentElement('afterend', wrap);
      return;
    }
    const glance = document.querySelector('.glance_ctn') || document.querySelector('#game_highlights');
    if (glance) {
      glance.insertAdjacentElement('beforebegin', wrap);
      return;
    }
    document.body.prepend(wrap);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('features/steam-gameplay/panel.css');
    document.documentElement.appendChild(link);
  }

  function gameplayQuery(name) {
    return `"${name}" gameplay walkthrough`;
  }

  function youtubeSearchUrl(query) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }
})();
