import { ENGINES, engineUrl } from './engines.js';
import { loadEngines, saveEngines } from './store.js';

export async function mountSearch() {
  const form = document.getElementById('nt-search');
  const input = document.getElementById('nt-query');
  const list = document.getElementById('nt-engines');

  const selected = new Set(await loadEngines());
  list.replaceChildren(...ENGINES.map((engine) => renderChip(engine, selected.has(engine.id))));

  list.addEventListener('change', async (event) => {
    const box = event.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) selected.add(box.value);
    else selected.delete(box.value);
    await saveEngines([...selected]);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    const targets = ENGINES.filter((engine) => selected.has(engine.id));
    if (!targets.length) {
      list.classList.add('nt-engines-warn');
      setTimeout(() => list.classList.remove('nt-engines-warn'), 1200);
      return;
    }

    await openSearches(targets.map((engine) => engineUrl(engine, query)));
  });

  input.focus();
}

async function openSearches([first, ...rest]) {
  const current = await chrome.tabs.getCurrent();
  for (const [i, url] of rest.entries()) {
    await chrome.tabs.create({ url, active: false, index: current ? current.index + 1 + i : undefined });
  }
  window.location.href = first;
}

function renderChip(engine, checked) {
  const label = document.createElement('label');
  label.className = 'nt-engine';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.value = engine.id;
  box.checked = checked;

  const text = document.createElement('span');
  text.textContent = engine.name;

  label.append(box, text);
  return label;
}
