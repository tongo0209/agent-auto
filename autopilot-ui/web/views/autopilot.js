import { $, api, esc, toast, pushCommand } from '../lib.js';
import { draft } from './_kit.js';
import { openTerminal, hasTab } from '../terminal.js';
import { subscribeRuns } from '../live-runs.js';
import { openRunPalette } from '../run-palette.js';

const money = (n) => `$${(n ?? 0).toFixed(2)}`;
const mins = (ms) => Math.round((ms ?? 0) / 60000);
const globRe = (g) => new RegExp('^' + g.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

const STATUS = { paused: 'Chờ bạn duyệt', attached: 'Chờ chạy trong phiên', chat: 'Đang chat', running: 'Đang chạy', stopped: 'Đã dừng', done: 'Xong' };
const isAborted = (r) => r.stopReason === 'aborted';
const isUserPaused = (r) => r.stopReason === 'paused';
const hasCode = (r) => r.status === 'done' && Object.keys(r.worktrees ?? {}).length > 0;
const isAsking = (r) => r.status === 'chat' && r.chatState === 'ask';
const statusClass = (r) => (r.interrupted ? 'interrupted' : isAsking(r) || r.awaitingReview ? 'paused' : r.status);
const statusLabel = (r) => (r.interrupted ? 'Bị ngắt' : isUserPaused(r) ? 'Tạm dừng' : isAsking(r) ? 'Chờ bạn' : r.awaitingReview ? 'Chờ review' : STATUS[r.status]);
const GROUPS = [
  ['need', 'Cần bạn', (r) => ['paused', 'attached'].includes(r.status) || isAsking(r)],
  ['review', 'Chờ review', (r) => r.awaitingReview],
  ['chat', 'Đang chat', (r) => r.status === 'chat' && !isAsking(r)],
  ['broken', 'Bị ngắt', (r) => r.interrupted],
  ['run', 'Đang chạy', (r) => r.status === 'running' && !r.interrupted],
  ['stop', 'Đã dừng', (r) => r.status === 'stopped' && !isAborted(r)],
  ['done', 'Xong', (r) => r.status === 'done' && !r.awaitingReview],
  ['aborted', 'Đã huỷ', isAborted],
];
const QUEUE_FILTERS = [
  ['all', 'Tất cả', null],
  ['running', 'đang chạy', ['run', 'chat']],
  ['waiting', 'chờ bạn', ['need', 'review', 'broken']],
  ['stopped', 'dừng', ['stop', 'aborted']],
  ['done', 'xong', ['done']],
];
let queueFilter = 'all';
let queueQuery = '';
let ticketTitles = {};
const queueNote = (text) => `<p style="color:var(--text-3);padding:12px 8px;font-size:13px">${text}</p>`;
const FOLD_KEY = 'console2.apAbortedOpen';
let abortedOpen = false;
try { abortedOpen = localStorage.getItem(FOLD_KEY) === '1'; } catch {}
const ICON_BY_STATE = { done: 'ph-check', running: 'ph-circle-notch spin', waiting: 'ph-hand', stopped: 'ph-x' };
const ICON_BY_ID = { plan: 'ph-map-trifold', 'plan-review': 'ph-magnifying-glass', implement: 'ph-code', 'code-review': 'ph-git-diff', gates: 'ph-shield-check', 'gates-final': 'ph-shield-check', 'ui-check': 'ph-browser', fix: 'ph-wrench', commit: 'ph-git-commit', cut: 'ph-scissors', 'check-design': 'ph-ruler', spec: 'ph-list-checks', 'clean-code': 'ph-broom', 'intake-triage': 'ph-tray', lanes: 'ph-git-fork', verify: 'ph-check-square', 'write-sheet': 'ph-table' };
const LIVE = 'live';
const CHANGES = 'changes';
const TAB_LABEL = (f) => f === LIVE ? 'Trực tiếp' : f === CHANGES ? 'Thay đổi' : f === 'plan.md' ? 'Plan' : `${f.endsWith('.log') ? 'Log ' : ''}${f.replace(/\.(json|log|md)$/, '').replace(/-r(\d+)$/, ' · vòng $1')}`;

let data = { runs: [] };
let selectedKey = null;
let artifact = null;
let lastStates = {};
let lastSig = '';
let runFiles = [];
let stageMenu = null;
const ACTION_LABEL = { approve: 'duyệt', reject: 'trả về', abort: 'huỷ và dọn sạch', resume: 'chạy tiếp', reviewed: 'đã review', retry: 'chạy lại', skip: 'bỏ qua', goto: 'quay về', pick: 'chọn phương án' };
const ABORT_BTN = '<button class="btn ghost" data-act="abort">Huỷ run</button>';
const MORE_MENU = `<div class="dock-more"><button class="btn ghost" data-more aria-haspopup="menu" aria-label="Thêm thao tác"><i class="ph-bold ph-dots-three"></i></button><div class="dock-more-menu" id="dockMore" role="menu" hidden>${ABORT_BTN}</div></div>`;
const FLOW_LEGEND = '<div class="flow-legend"><span class="done">xong</span><span class="running">đang chạy</span><span class="waiting">chờ bạn</span><span class="stopped">dừng</span><span class="user-skipped">bỏ qua</span></div>';
const FLOW_MODE_SWITCH = '<div class="flow-mode" id="flowModeSwitch" role="group" aria-label="Kiểu sơ đồ" hidden><button data-mode="2d">2D</button><button data-mode="3d">3D</button></div>';
const CLAUDE_BTN = '<button class="btn claude" data-claude><i class="ph-bold ph-terminal-window"></i>Mở trong Claude</button>';
const FLOW_NUDGE_RATIO = 0.7;
const FLOW_MODE_KEY = 'console2.apFlowMode';
let flowMode = '3d';
try { flowMode = localStorage.getItem(FLOW_MODE_KEY) === '2d' ? '2d' : '3d'; } catch {}
let mountFlow3d = null;
let flow3d = null;
let flowScroll = { id: '', left: 0 };
let lastPointer = { x: 0, y: 0 };


async function post(action, body, sentMessage = 'Đã gửi. Autopilot chạy nền, trang tự cập nhật.') {
  try {
    const res = await fetch(`/api/autopilot/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    toast(res.ok ? sentMessage : `Không gửi được: ${out.error}`, !res.ok);
    return res.ok ? out : null;
  } catch (e) {
    toast(`Không tới được server autopilot: ${e.message}`, true);
    return null;
  }
}

const tabIdOf = ({ key, runId }) => `ap-${key}-${runId}`;

// Mỗi run một tab cố định: còn mở thì chỉ chuyển sang, chưa có thì CLI dựng brief rồi trả lệnh claude
async function openInClaude(run) {
  if (hasTab(tabIdOf(run))) return openTerminal(null, run.key, tabIdOf(run));
  const launch = await post('open', { key: run.key, attach: true }, 'Đã mở tab Claude của run.');
  if (launch) openTerminal(launch.command, launch.key, tabIdOf(launch));
}

function renderQueue() {
  if (!data.runs.length) {
    $('#apQueue').innerHTML = queueNote('Chưa có run nào. Bấm "Chạy ticket" để bắt đầu.');
    return;
  }
  const shownGroups = QUEUE_FILTERS.find(([id]) => id === queueFilter)[2];
  const query = queueQuery.trim().toLowerCase();
  const matchesQuery = (r) => `${r.key} ${ticketTitles[r.key] ?? ''}`.toLowerCase().includes(query);
  $('#apQueue').innerHTML = GROUPS.filter(([cls]) => !shownGroups || shownGroups.includes(cls)).map(([cls, title, belongs]) => {
    const runs = data.runs.filter((r) => belongs(r) && matchesQuery(r));
    if (!runs.length) return '';
    const folded = cls === 'aborted' && !abortedOpen;
    const head = cls === 'aborted'
      ? `<h3 class="fold" data-fold title="Run đã huỷ và hoàn tác — giữ lại để xem log, không cần xử lý"><span><i class="ph ph-caret-${folded ? 'right' : 'down'}"></i> ${title}</span><span class="mono">${runs.length}</span></h3>`
      : `<h3><span>${title}</span><span class="mono">${runs.length}</span></h3>`;
    return `<div class="group ${cls}">${head}${folded ? '' : runs.map((r) => `
      <button class="item ${r.key === selectedKey ? 'on' : ''}" data-key="${esc(r.key)}" title="${esc(ticketTitles[r.key] ?? '')}">
        <span class="key">${esc(r.key)}</span><span class="cost mono">${r.mode === 'chat' ? `${compact(r.totals.tokens)} tok` : money(r.totals.usd)}</span>
        <span class="sub">${esc(r.flowLabel)} · ${esc(r.stage ?? (r.awaitingReview ? 'chờ review' : 'hoàn tất'))}</span>
        <span class="mini">${r.cells.filter((c) => !c.side).map((c) => `<i class="${c.state}"></i>`).join('')}</span>
      </button>`).join('')}</div>`;
  }).join('') || queueNote('Không có run nào khớp bộ lọc.');
}

function syncQueueChips() {
  document.querySelectorAll('[data-filter]').forEach((chip) => chip.setAttribute('aria-pressed', chip.dataset.filter === queueFilter));
}

function mainLane(cells) {
  const byId = Object.fromEntries(cells.map((c) => [c.id, c]));
  const lane = [];
  for (let c = cells[0]; c && !lane.includes(c); c = byId[c.next]) lane.push(c);
  return { lane, side: cells.filter((c) => !lane.includes(c)) };
}

function nodeHtml(c) {
  const icon = ICON_BY_STATE[c.state] ?? ICON_BY_ID[c.id] ?? 'ph-circle';
  const note = c.state === 'waiting' ? 'chờ' : c.usd ? money(c.usd) : c.state === 'skipped' ? 'bỏ qua' : '';
  const kind = c.kind === 'pause' || c.kind === 'attached' ? 'pause' : c.kind === 'gate' ? 'gate' : '';
  const changed = lastStates[c.id] && lastStates[c.id] !== c.state ? 'pop' : '';
  const userSkipped = c.state === 'skipped' && c.skippedReason !== null;
  const skipText = `bỏ qua${c.skippedReason ? ` · ${c.skippedReason}` : ''}`;
  return `<div class="node ${c.state} ${kind} ${changed} ${userSkipped ? 'user-skipped' : ''}" id="n-${esc(c.id)}">
    ${c.rounds > 1 ? `<span class="badge-round">${c.max ? `vòng ${c.rounds}/${c.max}` : `×${c.rounds}`}</span>` : ''}
    ${c.breakpoint ? '<span class="pin" title="Dừng sau bước này"><i class="ph-bold ph-map-pin"></i></span>' : ''}
    <div class="dot"><i class="ph-bold ${icon}"></i></div>
    <div class="name">${esc(c.id)}</div>${userSkipped ? `<div class="note why" title="${esc(skipText)}">${esc(skipText)}</div>` : `<div class="note">${note}</div>`}</div>`;
}

function curve(a, b, below) {
  if (!below) return `M${a.x},${a.y} L${b.x},${b.y}`;
  const midY = Math.max(a.y, b.y) + 40;
  return `M${a.x},${a.y} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`;
}

function drawWires(run) {
  const host = $('#flowInner');
  if (!host) return;
  const box = host.getBoundingClientRect();
  const pt = (id, edge) => {
    const el = document.getElementById(`n-${id}`)?.querySelector('.dot');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left - box.left + r.width / 2;
    const y = r.top - box.top + r.height / 2;
    return { right: { x: x + r.width / 2, y }, left: { x: x - r.width / 2, y }, bottom: { x, y: y + r.height / 2 }, top: { x, y: y - r.height / 2 } }[edge];
  };
  const { lane } = mainLane(run.cells);
  const paths = [];
  let live = null;
  lane.forEach((c, i) => {
    const next = lane[i + 1];
    if (!next) return;
    const a = pt(c.id, 'right'), b = pt(next.id, 'left');
    if (!a || !b) return;
    const isLive = c.state === 'done' && ['running', 'waiting'].includes(next.state);
    const cls = isLive ? `live${next.state === 'waiting' ? ' wait' : ''}` : c.state === 'done' && next.state !== 'pending' ? 'done' : '';
    const d = curve(a, b);
    if (isLive) live = { d, wait: next.state === 'waiting' };
    paths.push(`<path class="wire ${cls}" d="${d}"/>`);
  });
  for (const c of run.cells.filter((x) => x.back)) {
    const target = run.cells.find((x) => x.id === c.back);
    const from = pt(c.id, target?.side ? 'bottom' : 'bottom');
    const to = pt(c.back, target?.side ? 'top' : 'bottom');
    if (!from || !to) continue;
    const used = c.rounds > 1 || (target?.side && target.rounds > 0 && c.rounds > 0);
    const d = target?.side ? `M${from.x},${from.y} C${from.x},${(from.y + to.y) / 2} ${to.x},${(from.y + to.y) / 2} ${to.x},${to.y}` : curve(from, to, true);
    paths.push(`<path class="wire loop ${used ? 'used' : ''}" d="${d}"/>`);
    if (run.stage === c.back && target?.side) live = { d: `M${from.x},${from.y} C${from.x},${(from.y + to.y) / 2} ${to.x},${(from.y + to.y) / 2} ${to.x},${to.y}`, wait: false };
  }
  const packet = live && run.status !== 'stopped' && !run.interrupted
    ? `<circle r="4" class="packet ${live.wait ? 'wait' : ''}"><animateMotion dur="${live.wait ? '2.6s' : '1.1s'}" repeatCount="indefinite" path="${live.d}"/></circle>`
    : '';
  $('#wires').innerHTML = paths.join('') + packet;
  $('#wires').setAttribute('width', host.scrollWidth);
  $('#wires').setAttribute('height', host.scrollHeight);
}

const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${n}`);

const usage = (icon, value, label, title) =>
  `<div class="usage" title="${esc(title)}"><i class="ph ${icon}"></i><div><b>${value}</b><small>${label}</small></div></div>`;

const BLOCK_TAG = 'h1|h2|h3|ul|ol|table|blockquote';
const tableHtml = (rows) => {
  const cells = rows.trim().split('\n').filter((r) => !/^\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|'));
  const [head, ...body] = cells;
  return `<table><thead><tr>${head.map((c) => `<th>${c.trim()}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c.trim()}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
};

function markdown(src) {
  const blocks = esc(src).split(/\n```[^\n]*\n([\s\S]*?)\n```/);
  return blocks.map((part, i) => {
    if (i % 2) return `<pre><code>${part}</code></pre>`;
    return part
      .replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
      .replace(/(?:^\|.*\|[ \t]*(?:\n|$))+/gm, tableHtml)
      .replace(/(?:^\s*[-*] .*(?:\n|$))+/gm, (list) => `<ul>${list.trim().split('\n').map((l) => `<li>${l.replace(/^\s*[-*] /, '')}</li>`).join('')}</ul>`)
      .replace(/(?:^\d+\. .*(?:\n|$))+/gm, (list) => `<ol>${list.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('')}</ol>`)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(new RegExp(`\\s*(</?(?:${BLOCK_TAG})>)\\s*`, 'g'), '$1')
      .replace(/\n{2,}/g, '<br><br>');
  }).join('');
}

function verdictView(v) {
  if (v.results) {
    return `<div class="verdict"><span class="tag ${v.pass ? 'pass' : 'fail'}"><i class="ph-bold ${v.pass ? 'ph-check-circle' : 'ph-warning'}"></i>${v.pass ? 'Cổng đạt' : 'Cổng chưa đạt'}</span>
      ${v.results.map((r, i) => `<div class="finding ${r.status === 'fail' || r.status === 'error' ? '' : 'adv'}" style="animation-delay:${i * 40}ms"><b>${esc(r.check)}</b> · ${esc(r.status)}${r.note ? ` · ${esc(r.note)}` : ''}${r.blocking?.length ? `<pre class="raw">${esc(r.blocking.join('\n'))}</pre>` : ''}</div>`).join('')}</div>`;
  }
  const list = (items, cls) => items.map((b, i) => `<div class="finding ${cls}" style="animation-delay:${i * 40}ms">${esc(typeof b === 'string' ? b : JSON.stringify(b))}</div>`).join('');
  return `<div class="verdict">
    <span class="tag ${esc(v.verdict)}"><i class="ph-bold ${v.verdict === 'pass' ? 'ph-check-circle' : 'ph-arrow-u-up-left'}"></i>${v.verdict === 'pass' ? 'Đạt' : v.verdict === 'revise' ? 'Cần sửa' : esc(v.verdict)}</span>
    ${v.note ? `<div class="md">${markdown(v.note)}</div>` : ''}
    ${v.blocking?.length ? `<h4>Chặn (${v.blocking.length})</h4>${list(v.blocking, '')}` : ''}
    ${v.advisory?.length ? `<h4>Gợi ý (${v.advisory.length})</h4>${list(v.advisory, 'adv')}` : ''}
    ${v.files?.length ? `<h4>File</h4><pre class="raw">${esc(v.files.join('\n'))}</pre>` : ''}</div>`;
}

const LOG_ICON = { init: 'ph-power', text: 'ph-chat-text', tool: 'ph-wrench', result: 'ph-arrow-bend-down-right', done: 'ph-flag-checkered' };

async function renderLog(run) {
  const pane = $('#doc');
  const res = await fetch(`/api/autopilot/runs/${run.key}/${run.runId}/live${artifact === LIVE ? '' : `/${encodeURIComponent(artifact)}`}`);
  if (res.status === 204) return (pane.innerHTML = '<p style="color:var(--text-3)">Bước hiện tại chưa ghi log. Log hiện ở đây ngay khi claude bắt đầu chạy.</p>');
  const { file, lines } = await res.json();
  const stick = !pane.firstElementChild || pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
  pane.innerHTML = `<div class="log">
    <div class="log-h">${artifact === LIVE && run.status === 'running' && !run.interrupted ? '<span class="pulse"></span>' : ''}<code>${esc(file)}</code><span>${lines.length} sự kiện</span></div>
    ${lines.map((l) => `<div class="ll ${l.kind}"><i class="ph ${LOG_ICON[l.kind]}"></i><span>${esc(l.text)}</span></div>`).join('')}
  </div>`;
  if (stick) pane.scrollTop = pane.scrollHeight;
}

const DIFF_LINE = { '+': 'add', '-': 'del', '@': 'hunk' };
// Bỏ phần đầu (diff --git, index, ---/+++) để dấu +/- chỉ còn là dòng thêm/bớt
function diffHtml(diff) {
  const hunks = diff.indexOf('\n@@');
  const body = hunks < 0 ? diff : diff.slice(hunks + 1);
  return body.split('\n').map((line) => `<span class="${DIFF_LINE[line[0]] ?? ''}">${esc(line)}</span>`).join('\n');
}

// Tên file nổi một dòng, thư mục mờ và bị cắt từ bên trái để luôn thấy thư mục gần file nhất
function fileDiffHtml(f) {
  const nameAt = f.path.lastIndexOf('/') + 1;
  return `<details class="file-diff"><summary><span class="fs ${f.status}">${f.status}</span><code class="fpath" title="${esc(f.path)}"><span class="dir"><bdi>${esc(f.path.slice(0, nameAt))}</bdi></span><b>${esc(f.path.slice(nameAt))}</b></code></summary><pre class="diff">${diffHtml(f.diff)}${f.truncated ? '\n<span class="hunk">… diff quá dài, mở VS Code để xem hết</span>' : ''}</pre></details>`;
}

// Push đẩy cả nhánh: liệt kê đủ commit sẽ đi kèm (cả của phiên khác) để duyệt trước khi chép lệnh
function unpushedHtml(c) {
  const command = pushCommand(c.repo, c.branch);
  return `<div class="rc-push">
  <p><b>${c.unpushed.length} commit chưa push</b> trên <code>${esc(c.branch)}</code>, sẽ đi cùng lệnh:</p>
  <ul class="commits">${c.unpushed.map((x) => `<li><code>${x.sha.slice(0, 9)}</code>${esc(x.subject)}</li>`).join('')}</ul>
  <div class="rc-push-cmd"><code>${esc(command)}</code><button class="btn go sm" data-push-cmd="${esc(command)}"><i class="ph-bold ph-arrow-fat-up"></i>Chép lệnh push</button></div>
</div>`;
}

const repoChangesHtml = (c) => `<div class="repo-changes">
  <div class="rc-head"><b>${esc(c.name)}</b><code>${esc(c.branch)}</code><button class="btn ghost sm" data-code="${esc(c.worktree)}"><i class="ph-bold ph-code"></i>Mở trong VS Code</button></div>
  ${c.commits.length ? `<ul class="commits">${c.commits.map((x) => `<li><code>${x.sha.slice(0, 9)}</code>${esc(x.subject)}</li>`).join('')}</ul>` : '<p class="rc-empty">Không có commit mới trên nhánh này.</p>'}
  ${c.unpushed?.length ? unpushedHtml(c) : ''}
  ${c.files.map(fileDiffHtml).join('')}
</div>`;

async function renderChanges(run) {
  const repos = await (await fetch(`/api/autopilot/runs/${run.key}/${run.runId}/changes`)).json();
  $('#doc').innerHTML = `<div class="doc">${repos.map(repoChangesHtml).join('')}</div>`;
}

async function renderArtifact(run) {
  const pane = $('#doc');
  if (!artifact) return (pane.innerHTML = '<p style="color:var(--text-3)">Chưa có kết quả nào.</p>');
  if (artifact === CHANGES) return renderChanges(run);
  if (artifact === LIVE || artifact.endsWith('.log')) return renderLog(run);
  const text = await (await fetch(`/api/autopilot/runs/${run.key}/${run.runId}/artifacts/${encodeURIComponent(artifact)}`)).text();
  let html;
  if (artifact.endsWith('.md')) html = `<div class="md">${markdown(text)}</div>`;
  else if (artifact.endsWith('.json')) {
    try { html = verdictView(JSON.parse(text)); } catch { html = `<pre class="raw">${esc(text)}</pre>`; }
  } else html = `<pre class="raw">${esc(text.slice(-20000))}</pre>`;
  pane.innerHTML = `<div class="doc">${html}</div>`;
}

async function renderMain() {
  const run = data.runs.find((r) => r.key === selectedKey);
  if (!run) {
    $('#apMain').innerHTML = `<div class="empty"><div><i class="ph ph-flow-arrow"></i><p>Chọn một run bên trái, hoặc bấm <b>Chạy ticket</b> (⌘K) để autopilot tự chọn luồng và chạy tới mốc cần bạn.</p></div></div>`;
    $('#dock').classList.remove('show');
    fitDock();
    destroyFlow3d();
    return;
  }
  const files = await (await fetch(`/api/autopilot/runs/${run.key}/${run.runId}/artifacts`)).json();
  runFiles = files;
  const starred = files.filter((f) => run.show.some((g) => globRe(g).test(f)));
  const tabs = [...(run.status === 'running' ? [LIVE] : []), ...(run.status === 'done' ? [CHANGES] : []), ...starred, ...files.filter((f) => !starred.includes(f) && !f.endsWith('.log')), ...files.filter((f) => f.endsWith('.log'))];
  if (run.status === 'running' && artifact !== LIVE && !files.includes(artifact)) artifact = LIVE;
  if (run.status === 'done' && !tabs.includes(artifact)) artifact = CHANGES;
  if (!artifact || !tabs.includes(artifact)) artifact = starred.find((f) => f === 'plan.md') ?? starred.at(-1) ?? tabs[0] ?? null;

  const { lane, side } = mainLane(run.cells);
  const tokens = run.totals.tokens ?? 0;
  closeStageMenu();
  $('#apMain').innerHTML = `
    <div class="top">
      <div>
        <div class="head"><h1>${esc(run.key)}</h1><span class="state ${statusClass(run)}">${statusLabel(run)}${run.stopReason && !isUserPaused(run) ? ` · ${esc(run.stopReason)}` : ''}</span>${isAborted(run) ? '' : '<button class="btn ghost" data-claude title="Mở tab Claude của run trong panel"><i class="ph-bold ph-terminal-window"></i>Claude</button>'}${run.status === 'running' && !run.interrupted ? '<button class="btn ghost" data-pause><i class="ph-bold ph-pause"></i>Dừng ngay</button>' : ''}</div>
        <div class="meta">${esc(run.flowLabel)}. Router chọn vì: ${esc(run.routerReason)}</div>
        <div class="meta"><code>${esc(run.campaignDir ?? 'chưa có campaign')}</code></div>
      </div>
      <div class="meters">${usage('ph-lightning', compact(tokens), 'token tiêu hao', `${tokens.toLocaleString('vi-VN')} token (gồm cache) · ${money(run.totals.usd)}`)}${usage('ph-timer', `${run.totals.minutes}′`, 'phút tiêu hao', run.mode === 'chat' ? 'từ đầu tới cuối phiên claude mới nhất của tab' : 'thời gian máy chạy các bước, không tính lúc chờ duyệt')}</div>
    </div>
    <div class="flow-bar">${FLOW_LEGEND}${FLOW_MODE_SWITCH}</div>
    <div class="flow-view" id="flowView">
      <div class="flow" id="flow"><div class="flow-inner" id="flowInner">
        <svg class="wires" id="wires"></svg>
        <div class="lane">${lane.map(nodeHtml).join('')}</div>
        ${side.length ? `<div class="lane side" id="sideLane">${side.map(nodeHtml).join('')}</div>` : ''}
      </div></div>
      <button class="flow-nudge prev" data-nudge="-1" aria-label="Cuộn sơ đồ sang trái"><i class="ph-bold ph-caret-left"></i></button>
      <button class="flow-nudge next" data-nudge="1" aria-label="Cuộn sơ đồ sang phải"><i class="ph-bold ph-caret-right"></i></button>
    </div>
    <div class="panes">
      <section>
        <div class="tabs">${tabs.map((f) => `<button class="tab ${f === artifact ? 'on' : ''}" data-file="${esc(f)}">${f === LIVE ? '<span class="pulse"></span>' : starred.includes(f) ? '<span class="star">★</span>' : ''}${esc(TAB_LABEL(f))}</button>`).join('')}</div>
        <div id="doc"><div class="skel"></div><div class="skel" style="width:70%"></div></div>
      </section>
      <section>
        <p class="side-h">Các lượt đã chạy</p>
        <div class="tl-scroll"><div class="timeline">${run.receipts.map((r, i) => `
          <div class="tl ${esc(r.verdict)}" style="animation-delay:${i * 30}ms">
            <div class="row1"><b>${esc(r.stage)} · vòng ${r.round}</b><span>${money(r.costUsd)}</span></div>
            <div class="row2">${esc(r.verdict)}${r.note !== undefined ? (r.note ? ` · ${esc(r.note)}` : '') : ` · ${r.blocking} chặn · ${r.advisory} gợi ý · ${r.turns} lượt · ${mins(r.ms)}′`}</div>
          </div>`).join('') || '<p style="color:var(--text-3);font-size:13px">Chưa có lượt nào.</p>'}</div></div>
        <div class="total"><span>${run.totals.runs} lượt claude · ${run.totals.turns} turns</span><span>${money(run.totals.usd)}</span></div>
      </section>
    </div>`;
  placeSideLane(run, lane, side);
  placeFlowScroll(run);
  $('#flow').addEventListener('scroll', () => {
    flowScroll.left = $('#flow').scrollLeft;
    syncFlowEdges();
  });
  $('.panes .tabs').addEventListener('scroll', (e) => syncScrollEdges(e.currentTarget));
  revealActiveTab();
  requestAnimationFrame(() => drawWires(run));
  syncFlow3d(run);
  renderDock(run);
  renderArtifact(run);
  lastStates = Object.fromEntries(run.cells.map((c) => [c.id, c.state]));
}

function placeSideLane(run, lane) {
  const sideLane = $('#sideLane');
  if (!sideLane) return;
  const callerIdx = Math.min(...run.cells.filter((c) => c.back && !lane.some((l) => l.id === c.back)).map((c) => lane.findIndex((l) => l.id === c.id)).filter((i) => i >= 0));
  if (Number.isFinite(callerIdx)) sideLane.style.paddingLeft = `${callerIdx * (92 + 44)}px`;
}

// Cùng run + cùng bước đang chạy thì giữ chỗ người dùng đã cuộn, đổi bước mới cuộn tới bước đó
function placeFlowScroll(run) {
  const flow = $('#flow');
  const focus = run.cells.find((c) => ['running', 'waiting', 'stopped'].includes(c.state)) ?? run.cells.find((c) => c.id === run.stage);
  const id = `${run.key}/${run.runId}/${focus?.id ?? ''}`;
  if (flowScroll.id === id) flow.scrollLeft = flowScroll.left;
  else if (focus) {
    const node = document.getElementById(`n-${focus.id}`).getBoundingClientRect();
    const view = flow.getBoundingClientRect();
    flow.scrollLeft += node.left + node.width / 2 - (view.left + view.width / 2);
  }
  flowScroll = { id, left: flow.scrollLeft };
  syncFlowEdges();
}

function syncScrollEdges(scroller, frame = scroller) {
  const hidden = scroller.scrollWidth - scroller.clientWidth;
  frame.classList.toggle('can-prev', scroller.scrollLeft > 1);
  frame.classList.toggle('can-next', scroller.scrollLeft < hidden - 1);
}

const syncFlowEdges = () => syncScrollEdges($('#flow'), $('#flowView'));

// Chỉ cuộn ngang hàng tab: scrollIntoView sẽ kéo cả trang khi hàng tab nằm dưới màn hình (mobile)
function revealActiveTab() {
  const tabs = $('.panes .tabs');
  const on = $('.tab.on', tabs);
  if (on) {
    const view = tabs.getBoundingClientRect();
    const tab = on.getBoundingClientRect();
    tabs.scrollLeft += Math.min(tab.left - view.left, 0) + Math.max(tab.right - view.right, 0);
  }
  syncScrollEdges(tabs);
}

// Bong bóng của robot 3D: việc claude vừa làm = dòng tool/text cuối trong log trực tiếp, đường dẫn rút về tên file
const shortActivity = (text) => text.replace(/\/\S*\/([^/\s]+)/g, '$1').slice(0, 40);
async function showActivity(run) {
  const res = await fetch(`/api/autopilot/runs/${run.key}/${run.runId}/live`);
  const last = res.status === 204 ? null : (await res.json()).lines.findLast((l) => l.kind === 'tool' || l.kind === 'text');
  flow3d?.view.setActivity(last ? shortActivity(last.text) : '');
}

function destroyFlow3d() {
  flow3d?.view.destroy();
  flow3d?.host.remove();
  flow3d = null;
}

// Giữ nguyên canvas 3D qua mỗi lần vẽ lại trang, chỉ dựng mới khi đổi run
function syncFlow3d(run) {
  const use3d = flowMode === '3d' && Boolean(mountFlow3d);
  $('#flowModeSwitch').hidden = !mountFlow3d;
  document.querySelectorAll('#flowModeSwitch [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === (use3d ? '3d' : '2d')));
  $('#flowView').classList.toggle('is-3d', use3d);
  const id = `${run.key}/${run.runId}`;
  if (!use3d || flow3d?.id !== id) destroyFlow3d();
  if (!use3d) return;
  if (flow3d) {
    $('#flowView').append(flow3d.host);
    return flow3d.view.update(run);
  }
  const host = document.createElement('div');
  host.className = 'flow-3d';
  host.addEventListener('pointerup', (e) => (lastPointer = { x: e.clientX, y: e.clientY }), true);
  $('#flowView').append(host);
  const view = mountFlow3d(host, run, { onNodeClick: (stageId, anchorEl) => openStageMenu(stageId, anchorEl ?? pointerAnchor()) });
  if (view) return (flow3d = { id, host, view });
  host.remove();
  mountFlow3d = null;
  syncFlow3d(run);
}

const pointerAnchor = () => {
  const { x, y } = lastPointer;
  return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
};

function fitDock() {
  const dock = $('#dock');
  $('#apMain').style.setProperty('--dock-h', `${dock.classList.contains('show') ? dock.offsetHeight : 0}px`);
}

const STOP_REASON = {
  'loop-exhausted': (s) => `hết vòng sửa ở ${s}`,
  breakpoint: (s) => `dừng theo 📍 sau ${s}`,
  fail: (s) => `${s} trượt`,
  budget: () => 'hết ngân sách',
  paused: () => 'bạn đã dừng',
  runner: (s) => `${s} lỗi khi chạy claude`,
};
const BROKEN_CODES = ['loop-exhausted', 'fail', 'runner'];
const DOCK_ASK = {
  goto: { placeholder: 'Vì sao quay về bước đó (bắt buộc)', missing: 'Quay về cần ghi chú để bước sau biết sửa gì.' },
  skip: { placeholder: 'Lý do bỏ qua cổng (bắt buộc)', missing: 'Bỏ qua cổng cần ghi lý do.' },
};
let dockAsk = null;

const stopCode = (run) => run.stopReason?.split(':')[0];
const stopStage = (run) => run.stopReason?.split(':')[1];
const reasonText = (stopReason) => {
  if (!stopReason) return '';
  const [code, stage] = stopReason.split(':');
  return Object.hasOwn(STOP_REASON, code) ? STOP_REASON[code](stage) : stopReason;
};
const isBroken = (run) => run.status === 'stopped' && BROKEN_CODES.includes(stopCode(run)) && Boolean(actionOf(run, 'retry'));
const isBreakpointStop = (run) => run.status === 'stopped' && stopCode(run) === 'breakpoint';
const hasPlanOptions = (run) => run.status === 'paused' && run.options.length >= 2 && Boolean(actionOf(run, 'pick'));
const askingNow = (run) => (dockAsk?.key === run.key && dockAsk.stage === run.stage ? dockAsk.type : null);

function stopMessage(run) {
  const text = reasonText(run.stopReason);
  if (!text) return 'Run đã dừng.';
  if (isBreakpointStop(run)) return `${esc(text[0].toUpperCase() + text.slice(1))}.`;
  const max = run.cells.find((c) => c.id === stopStage(run))?.max;
  const count = stopCode(run) === 'loop-exhausted' && max ? ` (${run.loops[stopStage(run)]}/${max})` : '';
  return `Run dừng: <b>${esc(text)}${count}</b>.`;
}

function gateStrip(run) {
  if (run.stage !== 'approve-result' || !run.gateSkipped.length) return '';
  return `<span class="gate-strip"><b>Đã bỏ ${run.gateSkipped.length} cổng:</b> ${run.gateSkipped.map((g) => `${esc(g.stage)} (${esc(g.reason)})`).join(' · ')}</span>`;
}

function dockMessage(run) {
  const stage = `<b>${esc(run.stage ?? '')}</b>`;
  if (run.awaitingReview) return 'Run xong, <b>chờ bạn review</b> code ở tab Thay đổi. Ổn thì bấm Đã review.';
  if (hasCode(run)) return 'Run đã review, code ở tab Thay đổi.';
  if (run.status === 'done') return 'Run xong. Commit chưa push (nếu có) chép lệnh ở tab Thay đổi.';
  if (isAsking(run)) return `Claude đang chờ bạn ở ${stage}${run.chatNote ? `: ${esc(run.chatNote)}` : ''} — trả lời trong tab Claude.`;
  if (run.status === 'chat') return `Run chat đang ở ${stage}, claude tự báo tiến độ lên board.`;
  if (run.interrupted) return `Run bị ngắt ở ${stage} (không còn process chạy). Chạy tiếp để làm lại bước này.`;
  if (run.status === 'running') return `Máy đang chạy ${stage}. Muốn sửa file thì bảo claude dừng (pause) trước.`;
  if (hasPlanOptions(run)) return `Chờ bạn chọn phương án ở ${stage}: bấm <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> hoặc nút Chọn, hay ghi chú rồi trả về.`;
  if (run.status === 'paused') return `${gateStrip(run)}Chờ bạn ở ${stage}. Duyệt để chạy tiếp, hoặc ghi chú rồi trả về.`;
  if (run.status === 'attached') return `Chờ bạn ở ${stage}: chạy <code>${esc(run.command)}</code> trong phiên Claude.`;
  if (isUserPaused(run) && run.cutSession) return `Đã dừng giữa ${stage}. Nhắn thêm cho claude (tuỳ chọn) rồi Chạy tiếp, claude nối đúng phiên đang dở.`;
  if (isUserPaused(run)) return `Đã tạm dừng trước ${stage}. Chạy tiếp khi bạn sẵn sàng.`;
  return stopMessage(run);
}

const dockBtn = (act, cls, icon, label) => `<button class="btn ${cls}" data-act="${act}"><i class="ph-bold ph-${icon}"></i>${label}</button>`;

function askButtons(run, asking) {
  const stages = actionOf(run, 'goto')?.stages ?? [];
  const picker = asking === 'goto' ? `<select id="gotoStage" aria-label="Quay về bước">${stages.map((id, i) => `<option value="${esc(id)}"${i === stages.length - 1 ? ' selected' : ''}>${esc(id)}</option>`).join('')}</select>` : '';
  const submit = asking === 'goto' ? dockBtn('goto', 'go', 'arrow-bend-up-left', 'Quay về') : dockBtn('skip', 'go', 'skip-forward', 'Bỏ qua');
  return `${picker}${dockBtn('cancel-ask', 'ghost', 'x', 'Quay lại')}${submit}`;
}

function oneClickAction(run) {
  const asking = askingNow(run);
  if (asking) return askButtons(run, asking);
  if (run.status === 'paused') {
    const skipped = run.stage === 'approve-result' ? run.gateSkipped.length : 0;
    const approve = dockBtn('approve', 'go', 'check', skipped ? `Duyệt dù đã bỏ ${skipped} cổng` : 'Duyệt <kbd>A</kbd>');
    return dockBtn('reject', 'back', 'arrow-u-up-left', 'Trả về <kbd>R</kbd>') + (hasPlanOptions(run) ? '' : approve);
  }
  if (run.status === 'attached') return dockBtn('approve', 'go', 'check', 'Đã xong, chạy tiếp');
  const goto = actionOf(run, 'goto');
  const backBtn = goto ? dockBtn('ask-goto', 'ghost', 'arrow-bend-up-left', 'Quay về…') : '';
  if (isBroken(run)) return backBtn + (actionOf(run, 'skip') ? dockBtn('skip', 'ghost', 'skip-forward', 'Bỏ qua') : '') + dockBtn('retry', 'go', 'arrow-clockwise', 'Chạy lại');
  if (isBreakpointStop(run)) {
    const rerun = goto?.stages.includes(stopStage(run)) ? dockBtn('rerun', 'ghost', 'arrow-clockwise', `Chạy lại ${esc(stopStage(run))}`) : '';
    return backBtn + rerun + dockBtn('resume', 'go', 'play', 'Chạy tiếp');
  }
  if (run.status === 'stopped' || run.interrupted) return dockBtn('resume', 'go', 'play', 'Chạy tiếp');
  if (run.awaitingReview) return dockBtn('reviewed', 'go', 'check', 'Đã review');
  return '';
}

function optionCards(run) {
  if (!hasPlanOptions(run)) return '';
  return run.options.map((o, i) => `
    <div class="opt-card">
      <b>${esc(o.id)} · ${esc(o.title)}</b>
      <p>${esc(o.body)}</p>
      <button class="btn go sm" data-pick="${esc(o.id)}">Chọn ${esc(o.id)} <kbd>${i + 1}</kbd></button>
    </div>`).join('');
}

function renderDock(run) {
  const show = !isAborted(run);
  $('#dock').classList.toggle('show', show);
  $('#dock').classList.toggle('slim', run.status === 'done');
  fitDock();
  if (!show) return;
  const keptStage = $('#gotoStage')?.value;
  const asking = askingNow(run);
  $('#dockMessage').innerHTML = `${asking ? 'Ghi chú rồi bấm gửi.' : dockMessage(run)}<span class="dock-hint">Nói với claude trong panel: sửa gì, chạy lại cổng, đưa vào source, xong…</span>`;
  $('#dockOptions').innerHTML = asking ? '' : optionCards(run);
  $('.dock-card').classList.toggle('stack', Boolean($('#dockOptions').innerHTML || run.status === 'stopped' || $('.gate-strip')));
  const cut = isUserPaused(run) && run.cutSession;
  $('#note').style.display = run.status === 'paused' || cut || asking ? '' : 'none';
  $('#note').placeholder = asking ? DOCK_ASK[asking].placeholder : cut ? 'Nhắn claude khi chạy tiếp: đổi hướng, bổ sung gì...' : 'Ghi chú khi trả về: cần sửa gì...';
  $('#prevNote').textContent = run.rejectNote ? `Lần trả về trước: ${run.rejectNote}` : '';
  $('#actions').innerHTML = (run.status === 'done' ? MORE_MENU : ABORT_BTN) + CLAUDE_BTN + oneClickAction(run);
  if (keptStage && $('#gotoStage')) $('#gotoStage').value = keptStage;
}

function showAlert(lines) {
  const box = $('#apAlert');
  if (!box) return;
  box.hidden = !lines.length;
  box.innerHTML = lines.map((line) => `<p>${esc(line)}</p>`).join('');
}

// Đang gõ ghi chú hoặc mở menu thì hoãn vẽ lại, vòng 2 giây trong mount vẽ bù khi rảnh
async function renderIfChanged() {
  const sig = JSON.stringify(data.runs);
  if (sig === lastSig || stageMenu || ['note', 'smText', 'gotoStage'].includes(document.activeElement?.id)) return;
  lastSig = sig;
  renderQueue();
  await renderMain();
}

function applyRuns(next) {
  data = next;
  showAlert((next.broken ?? []).map((b) => `${b.key} không đọc được: ${b.error}`));
  selectedKey ??= data.runs.find((r) => !isAborted(r))?.key ?? null;
  return renderIfChanged();
}

function onLiveStatus({ online, error }) {
  if (!online) showAlert(['Mất kết nối server autopilot, đang tự nối lại — dữ liệu dưới đây có thể đã cũ.']);
  else if (error) showAlert([`Không đọc được danh sách run: ${error}`]);
}

// Sau khi gửi lệnh: vẽ lại dù run.json chưa đổi, để dock không kẹt ở "chờ autopilot nhận" khi CLI từ chối
async function refresh() {
  try {
    await applyRuns(await api('autopilot/runs'));
  } catch (e) {
    showAlert([`Không tải được danh sách run: ${e.message}`]);
  }
}

// Huỷ xoá hẳn worktree + nhánh + thư mục run nên phải bấm 2 lần
function armAbort(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  btn.textContent = 'Bấm lần nữa để xoá hẳn';
  btn.classList.add('danger');
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Huỷ run'; btn.classList.remove('danger'); }, 3000);
  return false;
}

async function act(action, extra = {}) {
  const run = data.runs.find((r) => r.key === selectedKey);
  if (!run) return;
  const note = $('#note').value.trim();
  const missing = { reject: 'Trả về cần ghi chú để bước sau biết sửa gì.', ...(askingNow(run) && { [askingNow(run)]: DOCK_ASK[askingNow(run)].missing }) }[action];
  if (missing && !note && !extra.note) {
    $('#note').focus();
    return toast(missing, true);
  }
  document.querySelectorAll('#dock .btn').forEach((b) => (b.disabled = true));
  if (!(await post(action, { key: run.key, note, ...extra }))) return renderDock(run);
  dockAsk = null;
  $('#dockOptions').innerHTML = '';
  $('#note').value = '';
  $('#actions').innerHTML = `<span class="sending"><i class="ph-bold ph-circle-notch spin"></i>Đã gửi lệnh ${ACTION_LABEL[action]}, chờ autopilot nhận…</span>`;
  lastSig = '';
  setTimeout(refresh, 1500);
}

function onDockClick(e) {
  const run = currentRun();
  const pick = e.target.closest('[data-pick]');
  if (pick) return act('pick', { option: pick.dataset.pick });
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const type = b.dataset.act;
  if (type === 'abort' && !armAbort(b)) return;
  if (['ask-goto', 'cancel-ask'].includes(type) || (type === 'skip' && !askingNow(run) && actionOf(run, 'skip').needsReason)) {
    dockAsk = type === 'cancel-ask' ? null : { type: type === 'skip' ? 'skip' : 'goto', key: run.key, stage: run.stage };
    return renderDock(run);
  }
  const extras = {
    rerun: ['goto', { stage: stopStage(run), note: `chạy lại ${stopStage(run)}` }],
    goto: ['goto', { stage: $('#gotoStage')?.value }],
    skip: ['skip', { reason: $('#note').value.trim() }],
  };
  act(...(extras[type] ?? [type]));
}

async function pauseRun(btn) {
  const run = data.runs.find((r) => r.key === selectedKey);
  btn.disabled = true;
  if (await post('pause', { key: run.key }, `Đã dừng ngay bước ${run.stage}.`)) btn.innerHTML = '<i class="ph-bold ph-circle-notch spin"></i>Đang dừng…';
  else btn.disabled = false;
}

const currentRun = () => data.runs.find((r) => r.key === selectedKey);
const actionOf = (run, type) => run.actions.find((a) => a.type === type);
const ASK_PLACEHOLDER = { note: 'Ghi chú cho bước sau (bắt buộc)', reason: 'Lý do bỏ qua cổng (bắt buộc)' };

function stageFile(id) {
  const rounds = runFiles.filter((f) => f.startsWith(`${id}-r`) && f.endsWith('.json')).sort();
  return id === 'plan' && runFiles.includes('plan.md') ? 'plan.md' : rounds.at(-1);
}

function showStage(id) {
  const file = stageFile(id);
  if (!file) return toast(`Bước ${id} chưa chạy, chưa có kết quả để xem.`);
  artifact = file;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.file === file));
  revealActiveTab();
  renderArtifact(currentRun());
  $('.panes').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function stageMenuItems(run, cell) {
  const [goto, retry, skip, brk] = ['goto', 'retry', 'skip', 'break'].map((type) => actionOf(run, type));
  const items = [];
  if (goto?.stages.includes(cell.id)) items.push({ type: 'goto', label: 'Quay về đây…', ask: 'note' });
  if (cell.id === run.stage) {
    if (retry) items.push({ type: 'retry', label: 'Chạy lại' });
    if (skip) items.push({ type: 'skip', label: 'Bỏ qua', ask: skip.needsReason ? 'reason' : null });
    if (['stopped', 'paused'].includes(run.status)) items.push({ type: 'claude', label: 'Mở trong Claude' });
  }
  if (brk && (brk.stages.includes(cell.id) || cell.breakpoint)) items.push({ type: 'break', off: cell.breakpoint, label: cell.breakpoint ? 'Gỡ điểm dừng 📍' : 'Dừng sau bước này 📍' });
  return items;
}

const spotOf = (node) => {
  const { left, bottom } = node.getBoundingClientRect();
  return `${left},${bottom}`;
};

function closeStageMenu() {
  stageMenu = null;
  $('#stageMenu').hidden = true;
}

function syncStageMenu() {
  const box = $('#stageMenu');
  box.querySelectorAll('button, input').forEach((el) => (el.disabled = stageMenu.busy));
  const send = $('[data-sm="send"]', box);
  if (send) send.disabled = stageMenu.busy || !$('#smText').value.trim();
}

function renderStageMenu() {
  const box = $('#stageMenu');
  const { items, ask, anchor } = stageMenu;
  box.innerHTML = ask
    ? `<input id="smText" placeholder="${ASK_PLACEHOLDER[ask.ask]}" autocomplete="off" aria-label="${esc(ask.label)}">
       <div class="sm-row"><button class="btn ghost" data-sm="back">Quay lại</button><button class="btn go" data-sm="send">Gửi</button></div>`
    : items.map((item, i) => `<button role="menuitem" data-i="${i}" class="${item.type === 'break' && item.off ? 'warn' : ''}">${esc(item.label)}</button>`).join('');
  box.hidden = false;
  stageMenu.spot = spotOf(anchor);
  const at = anchor.getBoundingClientRect();
  const main = $('#apMain').getBoundingClientRect();
  const left = Math.min(Math.max(at.left + at.width / 2 - box.offsetWidth / 2, main.left + 8), main.right - box.offsetWidth - 8);
  box.style.left = `${left}px`;
  box.style.top = `${at.bottom + 6}px`;
  if (ask) { syncStageMenu(); $('#smText').focus(); }
}

function openStageMenu(stage, anchor) {
  const run = currentRun();
  const items = stageMenuItems(run, run.cells.find((c) => c.id === stage));
  if (!items.length) return showStage(stage);
  if (stageMenu?.stage === stage) return closeStageMenu();
  stageMenu = { key: run.key, stage, items: [...items, ...(stageFile(stage) ? [{ type: 'view', label: 'Xem kết quả' }] : [])], ask: null, busy: false, anchor };
  renderStageMenu();
}

async function submitStageMenu(item, text = '') {
  const menu = stageMenu;
  const { key, stage } = menu;
  const body = { goto: { key, stage, note: text }, retry: { key }, skip: { key, reason: text }, break: { key, stage, off: item.off } }[item.type];
  menu.busy = true;
  syncStageMenu();
  const out = await post(item.type, body, item.type === 'break' ? 'Đã đổi điểm dừng.' : undefined);
  if (out) setTimeout(refresh, 1500);
  if (menu !== stageMenu) return;
  if (out) return closeStageMenu();
  menu.busy = false;
  syncStageMenu();
}

function onStageMenuClick(e) {
  const button = e.target.closest('button');
  if (!button || stageMenu.busy) return;
  if (button.dataset.sm === 'back') {
    stageMenu.ask = null;
    return renderStageMenu();
  }
  if (button.dataset.sm === 'send') return submitStageMenu(stageMenu.ask, $('#smText').value.trim());
  const item = stageMenu.items[Number(button.dataset.i)];
  const { stage } = stageMenu;
  if (item.ask) {
    stageMenu.ask = item;
    return renderStageMenu();
  }
  if (item.type === 'claude') { closeStageMenu(); return openInClaude(currentRun()); }
  if (item.type === 'view') { closeStageMenu(); return showStage(stage); }
  submitStageMenu(item);
}

const MARKUP = `
<aside class="ap-queue">
  <div class="brand">
    <i class="ph-bold ph-flow-arrow" style="font-size:20px;color:var(--ok)"></i>
    <b>Autopilot</b>
    <button class="new" id="openPalette"><i class="ph ph-plus"></i>Chạy ticket <kbd>⌘K</kbd></button>
  </div>
  <div class="ap-alert" id="apAlert" role="status" hidden></div>
  <div class="queue-filter">
    <div class="qf-search"><input id="apSearch" type="search" placeholder="Tìm mã ticket hoặc tiêu đề" aria-label="Tìm run" autocomplete="off"><kbd>/</kbd></div>
    <div class="qf-chips" role="group" aria-label="Lọc run theo trạng thái">${QUEUE_FILTERS.map(([id, label]) => `<button class="qf-chip ${id}" data-filter="${id}">${label}</button>`).join('')}</div>
  </div>
  <div class="queue" id="apQueue"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
</aside>

<section class="ap-main" id="apMain"><div class="skel" style="width:30%;height:28px"></div><div class="skel" style="height:80px"></div></section>

<div class="dock" id="dock">
  <div class="dock-card">
    <div>
      <label for="note" id="dockMessage"></label>
      <div class="opt-cards" id="dockOptions"></div>
      <textarea id="note" placeholder="Ghi chú khi trả về: cần sửa gì..."></textarea>
      <div class="prev" id="prevNote"></div>
    </div>
    <div class="actions" id="actions"></div>
  </div>
</div>

<div class="stage-menu" id="stageMenu" role="menu" hidden></div>`;

export function mount(el, ctx) {
  el.innerHTML = `<div class="ap">${MARKUP}</div>`;
  selectedKey = ctx.param ?? selectedKey;
  lastSig = '';
  lastStates = {};
  stageMenu = null;
  $('#apSearch').value = queueQuery;
  syncQueueChips();
  $('#apSearch').addEventListener('input', (e) => {
    queueQuery = e.target.value;
    renderQueue();
  });
  $('.qf-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    queueFilter = chip.dataset.filter;
    syncQueueChips();
    renderQueue();
  });
  api('state').then(({ state }) => {
    ticketTitles = Object.fromEntries(Object.entries(state.issues).map(([key, issue]) => [key, issue.summary]));
    if (data.runs.length) renderQueue();
  }, () => {});
  $('#apQueue').addEventListener('click', (e) => {
    if (e.target.closest('[data-fold]')) {
      abortedOpen = !abortedOpen;
      try { localStorage.setItem(FOLD_KEY, abortedOpen ? '1' : '0'); } catch {}
      return renderQueue();
    }
    const key = e.target.closest('.item')?.dataset.key;
    if (!key || key === selectedKey) return;
    selectedKey = key;
    artifact = null;
    lastStates = {};
    renderQueue();
    renderMain();
  });
  $('#apMain').addEventListener('click', (e) => {
    const pauseBtn = e.target.closest('[data-pause]');
    if (pauseBtn) return pauseRun(pauseBtn);
    if (e.target.closest('[data-claude]')) return openInClaude(data.runs.find((r) => r.key === selectedKey));
    const node = e.target.closest('.node');
    if (node) return openStageMenu(node.id.slice(2), node);
    const nudge = e.target.closest('[data-nudge]');
    if (nudge) return $('#flow').scrollBy({ left: Number(nudge.dataset.nudge) * $('#flow').clientWidth * FLOW_NUDGE_RATIO, behavior: 'smooth' });
    const mode = e.target.closest('[data-mode]');
    if (mode) {
      flowMode = mode.dataset.mode;
      try { localStorage.setItem(FLOW_MODE_KEY, flowMode); } catch {}
      return syncFlow3d(currentRun());
    }
    const pushBtn = e.target.closest('[data-push-cmd]');
    if (pushBtn) return draft({ openTerminal, toast }, pushBtn.dataset.pushCmd, `push ${selectedKey}`, '');
    const codeBtn = e.target.closest('[data-code]');
    if (codeBtn) {
      const run = data.runs.find((r) => r.key === selectedKey);
      return post('code', { key: run.key, runId: run.runId, dir: codeBtn.dataset.code }, 'Đã mở worktree trong VS Code.');
    }
    const tab = e.target.closest('.tab');
    if (!tab) return;
    artifact = tab.dataset.file;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    revealActiveTab();
    renderArtifact(data.runs.find((r) => r.key === selectedKey));
  });
  // Hàng tab ẩn thanh cuộn nên lăn chuột dọc cũng phải cuộn được ngang
  $('#apMain').addEventListener('wheel', (e) => {
    const tabs = e.target.closest('.panes .tabs');
    if (!tabs || e.deltaX || tabs.scrollWidth <= tabs.clientWidth) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY;
  });
  $('#dock').addEventListener('click', (e) => {
    if (e.target.closest('[data-claude]')) return openInClaude(currentRun());
    if (e.target.closest('[data-more]')) return ($('#dockMore').hidden = !$('#dockMore').hidden);
    onDockClick(e);
  });
  const dockSize = new ResizeObserver(fitDock);
  dockSize.observe($('#dock'));
  $('#stageMenu').addEventListener('click', onStageMenuClick);
  $('#stageMenu').addEventListener('input', syncStageMenu);
  $('#stageMenu').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'smText' && !stageMenu.busy) $('[data-sm="send"]').click();
  });
  const onDocClick = (e) => {
    const inside = e.composedPath().some((el) => el.id === 'stageMenu' || el.classList?.contains('node') || el.classList?.contains('flow-3d'));
    if (stageMenu && !inside) closeStageMenu();
    if ($('#dockMore') && !e.target.closest('.dock-more')) $('#dockMore').hidden = true;
  };
  const onDocScroll = (e) => {
    if (stageMenu && (e.target === document || e.target.classList?.contains('flow')) && spotOf(stageMenu.anchor) !== stageMenu.spot) closeStageMenu();
  };
  $('#openPalette').addEventListener('click', () => openRunPalette());
  const onKey = (e) => {
    const typing = document.activeElement?.closest('input, textarea, select, .xterm, [contenteditable]');
    if (e.key === 'Escape' && stageMenu) return closeStageMenu();
    if (e.key === 'Escape' && $('#dockMore')?.hidden === false) return ($('#dockMore').hidden = true);
    if (e.key === 'Escape' && dockAsk) {
      dockAsk = null;
      return renderDock(currentRun());
    }
    if (e.key === '/' && !typing) {
      e.preventDefault();
      return $('#apSearch').focus();
    }
    if (typing || stageMenu || !$('#dock').classList.contains('show')) return;
    if (e.key === 'a' && $('#actions [data-act="approve"]')) act('approve');
    if (e.key === 'r') $('#note').focus();
    const pickBtn = !(e.metaKey || e.ctrlKey || e.altKey) && '123'.includes(e.key) && document.querySelectorAll('#dock [data-pick]:not(:disabled)')[Number(e.key) - 1];
    if (pickBtn) act('pick', { option: pickBtn.dataset.pick });
  };
  $('#note').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $(`#actions [data-act="${askingNow(currentRun()) ?? 'reject'}"]`)?.click();
  });
  const onResize = () => {
    const run = data.runs.find((r) => r.key === selectedKey);
    if (run) {
      drawWires(run);
      syncFlowEdges();
      revealActiveTab();
    }
    if (stageMenu) closeStageMenu();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onDocClick);
  document.addEventListener('scroll', onDocScroll, true);
  window.addEventListener('resize', onResize);
  import('../flow-3d.js').then((m) => {
    mountFlow3d = m.mountFlow3d;
    if ($('#flowView')) syncFlow3d(currentRun());
  }, () => {});
  const stopLive = subscribeRuns((next) => applyRuns(next).catch(() => {}), onLiveStatus);
  const liveTimer = setInterval(() => {
    renderIfChanged().catch(() => {});
    const run = data.runs.find((r) => r.key === selectedKey);
    if (run?.status === 'running' && artifact === LIVE) renderLog(run).catch(() => {});
    if (flow3d && run?.status === 'running' && !run.interrupted) showActivity(run).catch(() => {});
    else flow3d?.view.setActivity('');
  }, 2000);
  return () => {
    destroyFlow3d();
    dockSize.disconnect();
    stopLive();
    clearInterval(liveTimer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('scroll', onDocScroll, true);
    window.removeEventListener('resize', onResize);
  };
}
