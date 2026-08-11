const KEY = 'since-clock.display';
const APPEARANCES = ['light', 'dark', 'system'];
const PALETTES = window.SinceStudioPalettes || ['ember', 'signal', 'cyan', 'violet', 'amber', 'paper', 'neutral'].map((name) => ({ name }));
const paletteNames = PALETTES.map(({ name }) => name);
const root = document.documentElement;
const toggle = document.querySelector('.display-toggle');
const menu = document.querySelector('.display-menu');
if (!toggle || !menu) throw new Error('Since Clock display control markup is missing');

const read = () => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  const q = new URLSearchParams(location.hash.slice(1));
  return {
    appearance: APPEARANCES.includes(q.get('appearance')) ? q.get('appearance') : APPEARANCES.includes(saved.appearance) ? saved.appearance : 'system',
    palette: paletteNames.includes(q.get('theme')) ? q.get('theme') : paletteNames.includes(saved.palette) ? saved.palette : 'neutral',
  };
};
let state = read();
const painted = () => state.appearance === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.appearance;
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...state, mode: 'display' })); } catch {} };
const writeHash = () => { const q = new URLSearchParams(location.hash.slice(1)); q.set('appearance', state.appearance); q.set('theme', state.palette); history.replaceState(null, '', `#${q}`); };
const render = () => {
  toggle.setAttribute('aria-expanded', String(!menu.hidden));
  toggle.setAttribute('aria-label', `Display settings: ${state.appearance}, ${state.palette}`);
  menu.querySelectorAll('[role="menuitemradio"]').forEach((button) => {
    const selected = button.dataset.kind === 'theme' ? state.palette === button.dataset.value : state.appearance === button.dataset.value;
    button.setAttribute('aria-checked', String(selected));
  });
};
const apply = ({ hash = true } = {}) => { root.dataset.appearance = painted(); root.dataset.theme = state.palette; if (hash) writeHash(); persist(); render(); };
const close = () => { menu.hidden = true; render(); };
const open = (focus = false) => { menu.hidden = false; render(); if (focus) menu.querySelector('[role="menuitemradio"]')?.focus(); };
const makeItem = (label, value, kind) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'display-menu__item'; button.role = 'menuitemradio'; button.dataset.kind = kind; button.dataset.value = value; button.textContent = label;
  button.addEventListener('click', () => { state[kind === 'theme' ? 'palette' : 'appearance'] = value; apply(); close(); toggle.focus(); });
  return button;
};
const appearanceGroup = document.createElement('fieldset'); appearanceGroup.className = 'display-menu__group'; appearanceGroup.innerHTML = '<legend class="display-menu__label">appearance</legend>';
APPEARANCES.forEach((value) => appearanceGroup.append(makeItem(value, value, 'appearance')));
const paletteGroup = document.createElement('fieldset'); paletteGroup.className = 'display-menu__group'; paletteGroup.innerHTML = '<legend class="display-menu__label">palette</legend>';
paletteNames.forEach((value) => paletteGroup.append(makeItem(value, value, 'theme')));
menu.append(appearanceGroup, paletteGroup);

let held = false; let holdTimer;
toggle.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; held = false; clearTimeout(holdTimer); holdTimer = setTimeout(() => { held = true; open(true); }, 500); });
toggle.addEventListener('pointerup', () => clearTimeout(holdTimer));
toggle.addEventListener('pointercancel', () => clearTimeout(holdTimer));
toggle.addEventListener('click', (event) => { if (held) { event.preventDefault(); held = false; return; } state.appearance = state.appearance === 'light' ? 'dark' : 'light'; apply(); });
toggle.addEventListener('contextmenu', (event) => { event.preventDefault(); open(true); });
toggle.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(true); } });
menu.addEventListener('keydown', (event) => {
  const buttons = [...menu.querySelectorAll('[role="menuitemradio"]')]; const index = buttons.indexOf(document.activeElement);
  if (event.key === 'Escape') { event.preventDefault(); close(); toggle.focus(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); buttons[(index + 1) % buttons.length].focus(); }
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length].focus(); }
});
document.addEventListener('pointerdown', (event) => { if (!menu.hidden && !event.target.closest('.display-control')) close(); });
const system = matchMedia('(prefers-color-scheme: dark)');
system.addEventListener('change', () => { if (state.appearance === 'system') apply({ hash: false }); });
window.addEventListener('hashchange', () => { state = read(); apply({ hash: false }); });
apply({ hash: false });
