import { features } from '../features/catalog.js';

let unmount = null;
let toastTimer = null;
let viewGen = 0;

init();

function init() {
  document.getElementById('back').addEventListener('click', showHome);
  showHome();
}

function showHome() {
  viewGen += 1;
  clearView();
  setChrome('brunolm', { back: false });

  const view = document.getElementById('view');
  if (!features.length) {
    view.appendChild(note('home-empty', 'No features registered.'));
    return;
  }

  const home = document.createElement('div');
  home.className = 'home';
  for (const feature of features) {
    home.appendChild(renderCard(feature));
  }
  view.appendChild(home);

  fillStatuses(home);
}

function renderCard(feature) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'home-card';
  card.dataset.id = feature.id;

  const name = document.createElement('span');
  name.className = 'home-card-name';
  name.textContent = feature.name;

  const desc = document.createElement('span');
  desc.className = 'home-card-desc';
  desc.textContent = feature.description ?? '';

  const status = document.createElement('span');
  status.className = 'home-card-status';
  status.hidden = true;

  card.append(name, desc, status);

  if (feature.load) {
    card.addEventListener('click', () => openFeature(feature));
    return card;
  }

  if (feature.action) {
    card.addEventListener('click', () => runAction(feature, card));
    return card;
  }

  card.disabled = true;
  desc.textContent = feature.description || 'No popup panel';
  return card;
}

async function fillStatuses(home) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await Promise.all(
    features.map(async (feature) => {
      if (!feature.load) return;
      const card = home.querySelector(`[data-id="${feature.id}"]`);
      if (!card) return;

      try {
        const mod = await feature.load();
        if (!mod.status) return;
        const text = await mod.status(tab);
        if (!text) return;
        const el = card.querySelector('.home-card-status');
        el.textContent = text;
        el.hidden = false;
      } catch {
        // card still opens; status is optional
      }
    }),
  );
}

async function openFeature(feature) {
  const gen = (viewGen += 1);
  clearView();
  setChrome(feature.name, { back: true });

  const view = document.getElementById('view');
  try {
    const mod = await feature.load();
    if (gen !== viewGen) return;
    if (!mod.mount) {
      view.appendChild(note('shell-error', `${feature.name} has no popup panel.`));
      return;
    }
    unmount = (await mod.mount(view)) ?? null;
  } catch (err) {
    if (gen !== viewGen) return;
    view.appendChild(note('shell-error', `Failed to load ${feature.name}: ${err.message}`));
  }
}

async function runAction(feature, card) {
  try {
    const mod = await feature.action();
    const result = await mod.run();
    if (typeof result === 'string' && result) toast(result);
    else flashStatus(card, 'Done');
  } catch (err) {
    toast(err.message || 'Action failed');
  }
}

function clearView() {
  if (unmount) {
    unmount();
    unmount = null;
  }
  document.getElementById('view').replaceChildren();
}

function setChrome(title, { back }) {
  document.getElementById('title').textContent = title;
  document.getElementById('back').hidden = !back;
}

function flashStatus(card, text) {
  const el = card.querySelector('.home-card-status');
  el.textContent = text;
  el.hidden = false;
}

function toast(text) {
  clearTimeout(toastTimer);
  document.querySelector('.shell-toast')?.remove();
  const el = note('shell-toast', text);
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 1800);
}

function note(className, text) {
  const el = document.createElement('p');
  el.className = className;
  el.textContent = text;
  return el;
}
