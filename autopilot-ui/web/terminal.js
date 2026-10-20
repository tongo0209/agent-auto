import { $, esc } from './lib.js';

const STORE = 'console2.terminal';
const MIN_W = 360;
const THEME = { background: '#07090b', foreground: '#e7ebef', cursor: '#34d399', selectionBackground: '#2e3742', black: '#0b0d10', green: '#34d399', yellow: '#fbbf24', red: '#f87171', blue: '#60a5fa' };

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {};
  } catch {
    return {};
  }
})();
const state = { open: saved.open ?? false, width: saved.width ?? 640, tabs: saved.tabs ?? [], active: saved.active ?? null };
const live = new Map();

const persist = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify({ open: state.open, width: state.width, tabs: state.tabs, active: state.active }));
  } catch {}
};

function applyWidth() {
  document.documentElement.style.setProperty('--term-w', state.open ? `${state.width}px` : '0px');
  $('#termBtn')?.classList.toggle('on', state.open);
  $('#term').hidden = !state.open;
  if (state.open) requestAnimationFrame(() => live.get(state.active)?.fit());
}

function connect(tab, { fresh, command }) {
  const term = new window.Terminal({ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 12.5, theme: THEME, cursorBlink: true, scrollback: 5000 });
  const fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.dataset.id = tab.id;
  $('#termBody').append(pane);
  term.open(pane);

  const ws = new WebSocket(`ws://${location.host}/term?id=${encodeURIComponent(tab.id)}${fresh ? '&startup=1' : ''}`);
  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const entry = {
    term, pane, ws,
    fit: () => {
      fit.fit();
      send({ type: 'resize', cols: term.cols, rows: term.rows });
    },
    run: (cmd) => send({ type: 'input', data: `${cmd}\r` }),
  };
  ws.onopen = () => entry.fit();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'output') term.write(msg.data);
    if (msg.type === 'attached' && msg.fresh) entry.run(command ?? msg.startup ?? '');
    if (msg.type === 'exit') term.write('\r\n[phiên đã thoát]\r\n');
  };
  ws.onclose = renderTabs;
  term.onData((data) => send({ type: 'input', data }));
  live.set(tab.id, entry);
  new ResizeObserver(() => pane.classList.contains('on') && entry.fit()).observe(pane);
  return entry;
}

function renderTabs() {
  $('#termTabs').innerHTML = state.tabs.map((t) => {
    const dead = live.get(t.id)?.ws.readyState > 1;
    return `<button class="term-tab ${t.id === state.active ? 'on' : ''}" data-id="${esc(t.id)}"><span class="live ${dead ? 'dead' : ''}"></span>${esc(t.title)}<span class="x" data-close="${esc(t.id)}" title="Đóng và kết thúc phiên">×</span></button>`;
  }).join('') + '<button class="term-add" id="termAdd" title="Tab mới (chạy claude)"><i class="ph-bold ph-plus"></i></button>';
  for (const [id, entry] of live) entry.pane.classList.toggle('on', id === state.active);
  live.get(state.active)?.term.focus();
}

function activate(id) {
  state.active = id;
  persist();
  renderTabs();
  requestAnimationFrame(() => live.get(id)?.fit());
}

function addTab({ command, title } = {}) {
  const tab = { id: `t-${Date.now().toString(36)}`, title: title ?? `claude ${state.tabs.length + 1}` };
  state.tabs.push(tab);
  connect(tab, { fresh: true, command });
  activate(tab.id);
}

function closeTab(id) {
  const entry = live.get(id);
  entry?.ws.readyState === 1 && entry.ws.send(JSON.stringify({ type: 'kill' }));
  entry?.ws.close();
  entry?.term.dispose();
  entry?.pane.remove();
  live.delete(id);
  state.tabs = state.tabs.filter((t) => t.id !== id);
  activate(state.tabs.at(-1)?.id ?? null);
}

function setOpen(open) {
  state.open = open;
  persist();
  applyWidth();
}

export function toggleTerminal() {
  setOpen(!state.open);
  if (state.open && !state.tabs.length) addTab();
}

export function openTerminal(command, title) {
  setOpen(true);
  addTab({ command, title });
}

export function initTerminal() {
  for (const tab of state.tabs) connect(tab, { fresh: false });
  if (!state.tabs.some((t) => t.id === state.active)) state.active = state.tabs[0]?.id ?? null;
  renderTabs();
  applyWidth();

  $('#termTabs').addEventListener('click', (e) => {
    const close = e.target.closest('[data-close]');
    if (close) return closeTab(close.dataset.close);
    if (e.target.closest('#termAdd')) return addTab();
    const tab = e.target.closest('.term-tab');
    if (tab) activate(tab.dataset.id);
  });
  $('#termGrip').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
    const move = (ev) => {
      state.width = Math.max(MIN_W, Math.min(window.innerWidth - 600, window.innerWidth - ev.clientX));
      applyWidth();
    };
    const up = () => {
      document.body.classList.remove('dragging');
      persist();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
