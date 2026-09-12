import { loadSites, newId, saveSites } from './store.js';

export async function mountSites() {
  const root = document.getElementById('nt-sites');
  const dialog = document.getElementById('nt-site-dialog');
  const form = document.getElementById('nt-site-form');
  const title = document.getElementById('nt-site-title');
  const nameInput = document.getElementById('nt-site-name');
  const urlInput = document.getElementById('nt-site-url');
  const iconInput = document.getElementById('nt-site-icon');
  const error = document.getElementById('nt-site-error');
  const removeButton = document.getElementById('nt-site-delete');

  let sites = await loadSites();
  let editingId = null;

  render();

  root.addEventListener('click', (event) => {
    const edit = event.target.closest('.nt-tile-edit');
    if (edit) {
      event.preventDefault();
      openDialog(sites.find((site) => site.id === edit.dataset.id));
      return;
    }
    if (event.target.closest('.nt-add')) openDialog(null);
  });

  form.addEventListener('submit', async (event) => {
    const url = normalizeUrl(urlInput.value);
    if (!url) {
      event.preventDefault();
      error.textContent = 'Enter a valid URL, e.g. github.com';
      return;
    }

    const icon = iconInput.value.trim();
    if (icon && !/^(https?:|data:image\/)/i.test(icon)) {
      event.preventDefault();
      error.textContent = 'Icon must be an http(s) or data:image URL';
      return;
    }
    // chrome.storage.sync caps a single item at 8 KB; a pasted data URL is the only realistic way to blow it.
    if (icon.length > 2000) {
      event.preventDefault();
      error.textContent = 'Icon URL is too long';
      return;
    }

    const entry = { id: editingId ?? newId(), name: nameInput.value.trim() || hostLabel(url), url, icon };
    sites = editingId ? sites.map((site) => (site.id === editingId ? entry : site)) : [...sites, entry];
    render();
    await saveSites(sites);
  });

  removeButton.addEventListener('click', async () => {
    sites = sites.filter((site) => site.id !== editingId);
    dialog.close();
    render();
    await saveSites(sites);
  });

  document.getElementById('nt-site-cancel').addEventListener('click', () => dialog.close());

  function openDialog(site) {
    editingId = site?.id ?? null;
    title.textContent = site ? 'Edit shortcut' : 'Add shortcut';
    nameInput.value = site?.name ?? '';
    urlInput.value = site?.url ?? '';
    iconInput.value = site?.icon ?? '';
    error.textContent = '';
    removeButton.hidden = !site;
    dialog.showModal();
    nameInput.focus();
  }

  function render() {
    root.replaceChildren(...sites.map(renderTile), renderAddTile());
  }
}

function renderTile(site) {
  const tile = document.createElement('div');
  tile.className = 'nt-tile';

  const link = document.createElement('a');
  link.className = 'nt-tile-link';
  link.href = site.url;
  link.title = site.url;

  const icon = document.createElement('span');
  icon.className = 'nt-tile-icon';

  const letter = document.createElement('span');
  letter.className = 'nt-tile-letter';
  letter.textContent = (site.name || hostLabel(site.url)).charAt(0).toUpperCase();
  letter.hidden = true;

  const img = document.createElement('img');
  img.alt = '';
  img.src = iconUrl(site);
  img.addEventListener('error', () => {
    img.remove();
    letter.hidden = false;
  });

  const name = document.createElement('span');
  name.className = 'nt-tile-name';
  name.textContent = site.name || hostLabel(site.url);

  icon.append(img, letter);
  link.append(icon, name);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'nt-tile-edit';
  edit.dataset.id = site.id;
  edit.title = 'Edit';
  edit.setAttribute('aria-label', `Edit ${name.textContent}`);
  edit.textContent = '✎';

  tile.append(link, edit);
  return tile;
}

function renderAddTile() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nt-tile nt-add';
  button.innerHTML = '<span class="nt-tile-icon">+</span><span class="nt-tile-name">Add</span>';
  return button;
}

function iconUrl(site) {
  if (site.icon) return site.icon;
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', site.url);
  url.searchParams.set('size', '64');
  return url.toString();
}

function normalizeUrl(value) {
  const raw = value.trim();
  if (!raw) return '';
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
