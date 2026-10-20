import { $, esc, toast } from './lib.js';

const STORE = 'console2.terminal';
const MIN_W = 360;
const MIN_MAIN_W = 320;
const IDLE = { busyGapMs: 3000, idleMs: 5000, minBusyMs: 30000, tickMs: 1000 };
const QUICK = [
  { cmd: 'claude', label: 'claude', icon: 'ph-play', primary: true },
  { cmd: '/daily', label: '/daily', icon: 'ph-sun-horizon' },
  { cmd: '/daily delta', label: 'quét ngay', icon: 'ph-radar' },
];
const DAILY_MENU = ['/daily plan', '/daily week', '/daily wrap', '/daily status'];
const THEME = { background: '#07090b', foreground: '#e7ebef', cursor: '#34d399', selectionBackground: '#2e3742', black: '#0b0d10', green: '#34d399', yellow: '#fbbf24', red: '#f87171', blue: '#60a5fa' };

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {};
  } catch {
    return {};
  }
})();
const state = { open: saved.open ?? true, width: saved.width ?? 640, tabs: saved.tabs ?? [], active: saved.active ?? null, grid: saved.grid ?? false };
const live = new Map();

const persist = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify({ open: state.open, width: state.width, tabs: state.tabs, active: state.active, grid: state.grid }));
  } catch {}
};

function applyWidth() {
  const navW = $('#nav').offsetWidth;
  const width = Math.max(MIN_W, Math.min(state.width, window.innerWidth - navW - MIN_MAIN_W));
  document.documentElement.style.setProperty('--term-w', state.open ? `${width}px` : '0px');
  $('#termBtn')?.classList.toggle('on', state.open);
  $('#term').hidden = !state.open;
  if (state.open) requestAnimationFrame(fitVisible);
}

function fitVisible() {
  for (const [id, entry] of live) if (state.grid || id === state.active) entry.fit();
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
    type: (data) => send({ type: 'input', data }),
    lastOutput: 0,
    busySince: 0,
    done: false,
  };
  ws.onopen = () => entry.fit();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'output') {
      term.write(msg.data);
      trackOutput(entry);
    }
    if (msg.type === 'attached' && msg.fresh) entry.run(command ?? msg.startup ?? '');
    if (msg.type === 'exit') term.write('\r\n[phiên đã thoát]\r\n');
  };
  ws.onclose = renderTabs;
  term.onData((data) => send({ type: 'input', data }));
  live.set(tab.id, entry);
  pane.addEventListener('pointerdown', () => state.active !== tab.id && activate(tab.id));
  new ResizeObserver(() => pane.offsetWidth && entry.fit()).observe(pane);
  return entry;
}

function trackOutput(entry) {
  const now = Date.now();
  if (now - entry.lastOutput > IDLE.busyGapMs) entry.busySince = now;
  entry.lastOutput = now;
}

function watchIdle() {
  const now = Date.now();
  let changed = false;
  for (const [id, entry] of live) {
    const busy = entry.busySince && now - entry.lastOutput < IDLE.idleMs;
    const finished = entry.busySince && !busy && entry.lastOutput - entry.busySince >= IDLE.minBusyMs;
    if (finished) notifyDone(id, entry);
    if (finished || (entry.busySince && !busy)) entry.busySince = 0;
    const cls = busy ? 'busy' : entry.done ? 'done' : '';
    if (entry.dotState !== cls) changed = true;
    entry.dotState = cls;
  }
  if (changed) renderTabs();
}

function notifyDone(id, entry) {
  const title = state.tabs.find((t) => t.id === id)?.title ?? 'terminal';
  if (id !== state.active || document.hidden) entry.done = true;
  toast(`${title} xong việc`);
  if (document.hidden && window.Notification?.permission === 'granted') new Notification('Autopilot', { body: `${title} xong việc` });
}

function renderTabs() {
  $('#termTabs').innerHTML = state.tabs.map((t) => {
    const entry = live.get(t.id);
    const dot = entry?.ws.readyState > 1 ? 'dead' : entry?.dotState ?? '';
    return `<button class="term-tab ${t.id === state.active ? 'on' : ''}" data-id="${esc(t.id)}"><span class="live ${dot}"></span>${esc(t.title)}<span class="x" data-close="${esc(t.id)}" title="Đóng và kết thúc phiên">×</span></button>`;
  }).join('') + '<button class="term-add" id="termAdd" title="Tab mới (chạy claude)"><i class="ph-bold ph-plus"></i></button>';
  for (const [id, entry] of live) entry.pane.classList.toggle('on', id === state.active);
  $('#termBody').classList.toggle('grid', state.grid && live.size > 1);
  $('#termBody').style.setProperty('--cols', live.size > 1 && $('#termBody').offsetWidth >= 720 ? 2 : 1);
  $('#termGridBtn')?.classList.toggle('on', state.grid);
  live.get(state.active)?.term.focus();
}

function renderTools() {
  const quick = QUICK.map((q) => `<button class="tt ${q.primary ? 'primary' : ''}" data-cmd="${esc(q.cmd)}" title="Gõ ${esc(q.cmd)} vào tab đang mở"><i class="ph-bold ${q.icon}"></i>${esc(q.label)}</button>`).join('');
  const menu = DAILY_MENU.map((cmd) => `<button data-cmd="${esc(cmd)}">${esc(cmd)}</button>`).join('');
  $('#termTools').innerHTML = `${quick}
    <details class="tt-menu"><summary class="tt" title="Các lệnh /daily khác"><i class="ph-bold ph-caret-down"></i>daily…</summary><div class="tt-pop">${menu}</div></details>
    <span class="tt-gap"></span>
    <button class="tt" data-act="interrupt" title="Gửi Ctrl+C"><i class="ph-bold ph-hand"></i>Ctrl+C</button>
    <button class="tt" data-act="clear" title="Xoá màn hình tab đang mở"><i class="ph-bold ph-broom"></i></button>
    <button class="tt" id="termGridBtn" data-act="grid" title="Xem mọi tab cùng lúc"><i class="ph-bold ph-squares-four"></i></button>
    <button class="tt" data-act="hide" title="Thu terminal"><i class="ph-bold ph-caret-double-right"></i></button>`;
}

function runQuick(cmd) {
  const entry = live.get(state.active);
  if (!entry || entry.ws.readyState > 1) return addTab({ command: cmd, title: cmd === 'claude' ? undefined : cmd });
  entry.run(cmd);
  entry.term.focus();
}

const ACTIONS = {
  interrupt: () => live.get(state.active)?.type('\x03'),
  clear: () => live.get(state.active)?.term.clear(),
  grid: () => {
    state.grid = !state.grid;
    persist();
    renderTabs();
    requestAnimationFrame(fitVisible);
  },
  hide: () => setOpen(false),
};

function activate(id) {
  state.active = id;
  const entry = live.get(id);
  if (entry) entry.done = false;
  persist();
  renderTabs();
  requestAnimationFrame(fitVisible);
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
  if (state.open && !state.tabs.length) addTab();
  renderTools();
  renderTabs();
  applyWidth();
  setInterval(watchIdle, IDLE.tickMs);

  $('#termTools').addEventListener('click', (e) => {
    if (window.Notification?.permission === 'default') Notification.requestPermission();
    const quick = e.target.closest('[data-cmd]');
    if (quick) {
      quick.closest('details')?.removeAttribute('open');
      return runQuick(quick.dataset.cmd);
    }
    const act = e.target.closest('[data-act]');
    if (act) ACTIONS[act.dataset.act]();
  });
  $('#termTabs').addEventListener('click', (e) => {
    const close = e.target.closest('[data-close]');
    if (close) return closeTab(close.dataset.close);
    if (e.target.closest('#termAdd')) return addTab();
    const tab = e.target.closest('.term-tab');
    if (tab) activate(tab.dataset.id);
  });
  window.addEventListener('resize', applyWidth);
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
