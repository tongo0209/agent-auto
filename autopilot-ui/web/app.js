import { $, esc, toast, api } from './lib.js';
import { initTerminal, toggleTerminal, openTerminal } from './terminal.js';

const VIEWS = [
  { id: 'today', label: 'Hôm nay', icon: 'ph-sun-horizon' },
  { id: 'tasks', label: 'Task', icon: 'ph-kanban' },
  { id: 'autopilot', label: 'Autopilot', icon: 'ph-flow-arrow' },
  { id: 'review', label: 'Review', icon: 'ph-git-diff' },
  { id: 'bugs', label: 'Bug', icon: 'ph-bug' },
  { id: 'git', label: 'Git', icon: 'ph-git-branch' },
  { id: 'board', label: 'Board', icon: 'ph-notebook' },
  { id: 'months', label: 'Tháng', icon: 'ph-calendar-dots' },
];
const ctx = { api, toast, openTerminal, go: (id, param) => (location.hash = `#/${id}${param ? `/${encodeURIComponent(param)}` : ''}`) };
let cleanup = null;

function renderNav(active) {
  $('#nav').innerHTML = `<div class="logo"><i class="ph-bold ph-terminal-window"></i></div>
    ${VIEWS.map((v) => `<a href="#/${v.id}" class="${v.id === active ? 'on' : ''}" data-view="${v.id}"><i class="ph${v.id === active ? '-fill' : ''} ${v.icon}"></i>${v.label}</a>`).join('')}
    <div class="spacer"></div>
    <a href="#" class="term-btn" id="termBtn" title="Terminal (Ctrl+\`)"><i class="ph ph-terminal"></i>CLI</a>`;
}

async function route() {
  const [, id = 'today', param] = location.hash.split('/');
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

async function updateBadge() {
  const { runs } = await api('autopilot/runs').catch(() => ({ runs: [] }));
  const need = runs.filter((r) => r.status === 'paused' || r.status === 'attached').length;
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
window.addEventListener('hashchange', route);
initTerminal();
route();
setInterval(updateBadge, 10000);
