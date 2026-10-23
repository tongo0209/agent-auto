import { $, esc, toast, api } from './lib.js';
import { subscribeRuns } from './live-runs.js';
import { initTerminal, toggleTerminal, openTerminal, isOpen as isTerminalOpen } from './terminal.js';
import './run-palette.js';

const VIEWS = [
  { id: 'timeline', label: 'Lịch', icon: 'ph-calendar-check' },
  { id: 'today', label: 'Hôm nay', icon: 'ph-sun-horizon' },
  { id: 'tasks', label: 'Task', icon: 'ph-kanban' },
  { id: 'autopilot', label: 'Autopilot', icon: 'ph-flow-arrow' },
  { id: 'review', label: 'Review', icon: 'ph-git-diff' },
  { id: 'bugs', label: 'Bug', icon: 'ph-bug' },
  { id: 'git', label: 'Git', icon: 'ph-git-branch' },
  { id: 'board', label: 'Board', icon: 'ph-notebook' },
  { id: 'months', label: 'Tháng', icon: 'ph-calendar-dots' },
];
// bug-radar sinh key tạm (source adhoc), sameAs trỏ 2 chiều với ticket thật: chỉ ẩn bản tạm
const sameAsMap = (data) => new Map(Object.entries(data.state?.issues ?? {}).filter(([, i]) => i.sameAs && i.source === 'adhoc').map(([key, i]) => [key, i.sameAs]));
let duplicates = api('state').then(sameAsMap).catch(() => new Map());

function dropDuplicates(value, dup) {
  if (Array.isArray(value)) {
    const kept = value.filter((v) => !dup.has(v?.key)).map((v) => dropDuplicates(v, dup));
    return kept.some((v) => dup.has(v)) ? [...new Set(kept.map((v) => dup.get(v) ?? v))] : kept;
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !dup.has(k)).map(([k, v]) => [k, dropDuplicates(v, dup)]));
  return value;
}

async function viewApi(path, options) {
  const data = await api(path, options);
  if (path === 'state') duplicates = Promise.resolve(sameAsMap(data));
  const dup = await duplicates;
  return dup.size ? dropDuplicates(data, dup) : data;
}

// Bản cache vừa về trong FRESH_MS thì không tải nền lại, tránh vòng onFresh → load → tải lại
const FRESH_MS = 1000;
const cache = new Map();
const inflight = new Map();

function fetchShared(path) {
  if (inflight.has(path)) return inflight.get(path);
  const request = viewApi(path).then(
    (data) => {
      if (inflight.get(path) === request) cache.set(path, { data, at: Date.now() });
      return data;
    },
    (err) => {
      cache.delete(path);
      throw err;
    },
  );
  inflight.set(path, request);
  request.catch(() => {}).then(() => inflight.get(path) === request && inflight.delete(path));
  return request;
}

// GET có onFresh: trả ngay bản cache, tải nền, bản mới khác (hoặc lỗi) thì gọi onFresh để màn tự load lại
async function cachedApi(path, { onFresh, ...options } = {}) {
  if (options.method && options.method !== 'GET') {
    const out = await viewApi(path, options);
    cache.clear();
    inflight.clear();
    return out;
  }
  const hit = cache.get(path);
  if (!onFresh || !hit) return fetchShared(path);
  if (Date.now() - hit.at > FRESH_MS) {
    fetchShared(path).then((data) => JSON.stringify(data) !== JSON.stringify(hit.data) && onFresh(), () => onFresh());
  }
  return hit.data;
}

const ctx = { api: cachedApi, toast, openTerminal, go: (id, param) => (location.hash = `#/${id}${param ? `/${encodeURIComponent(param)}` : ''}`) };
let cleanup = null;

function renderNav(active) {
  $('#nav').innerHTML = `<a href="#" class="term-btn${isTerminalOpen() ? ' on' : ''}" id="termBtn" title="Mở/đóng Claude CLI (Ctrl+\`)"><i class="ph-bold ph-terminal-window"></i>Claude</a>
    ${VIEWS.map((v) => `<a href="#/${v.id}" class="${v.id === active ? 'on' : ''}" data-view="${v.id}"><i class="ph${v.id === active ? '-fill' : ''} ${v.icon}"></i>${v.label}</a>`).join('')}`;
}

async function route() {
  const [, id = 'timeline', param] = location.hash.split('/');
  const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
  renderNav(view.id);
  cleanup?.();
  cleanup = null;
  const page = document.createElement('div');
  page.className = 'page';
  $('#view').replaceChildren(page);
  try {
    const mod = await import(`./views/${view.id}.js`);
    cleanup = (await mod.mount(page, { ...ctx, param: param && decodeURIComponent(param) })) ?? null;
  } catch (e) {
    page.innerHTML = `<div class="empty"><div><i class="ph ph-warning-circle"></i><p>Màn ${esc(view.label)} chưa tải được: ${esc(e.message)}</p></div></div>`;
  }
  updateBadge();
}

let badgeRuns = [];
function updateBadge() {
  const need = badgeRuns.filter((r) => r.status === 'paused' || r.status === 'attached' || (r.status === 'chat' && r.chatState === 'ask')).length;
  const link = $('[data-view="autopilot"]');
  link?.querySelector('.count')?.remove();
  if (need) link?.insertAdjacentHTML('beforeend', `<span class="count">${need}</span>`);
}

$('#nav').addEventListener('click', (e) => {
  if (!e.target.closest('#termBtn')) return;
  e.preventDefault();
  toggleTerminal();
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '`') {
    e.preventDefault();
    toggleTerminal();
  }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-sync-jira]')) openTerminal('claude "/daily delta"', 'Đồng bộ Jira', 'daily-delta');
});
window.addEventListener('hashchange', route);
initTerminal();
route();
subscribeRuns(({ runs }) => {
  badgeRuns = runs;
  updateBadge();
});
