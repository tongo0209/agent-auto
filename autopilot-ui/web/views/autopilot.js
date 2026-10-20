import { $, esc, toast } from '../lib.js';
import { openTerminal, hasTab } from '../terminal.js';

const money = (n) => `$${(n ?? 0).toFixed(2)}`;
const mins = (ms) => Math.round((ms ?? 0) / 60000);
const globRe = (g) => new RegExp('^' + g.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

const STATUS = { paused: 'Chờ bạn duyệt', attached: 'Chờ chạy trong phiên', chat: 'Đang chat', running: 'Đang chạy', stopped: 'Đã dừng', done: 'Xong' };
const isAborted = (r) => r.stopReason === 'aborted';
const isUserPaused = (r) => r.stopReason === 'paused';
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
const FOLD_KEY = 'console2.apAbortedOpen';
let abortedOpen = false;
try { abortedOpen = localStorage.getItem(FOLD_KEY) === '1'; } catch {}
const ICON_BY_STATE = { done: 'ph-check', running: 'ph-circle-notch spin', waiting: 'ph-hand', stopped: 'ph-x' };
const ICON_BY_ID = { plan: 'ph-map-trifold', 'plan-review': 'ph-magnifying-glass', implement: 'ph-code', 'code-review': 'ph-git-diff', gates: 'ph-shield-check', 'gates-final': 'ph-shield-check', 'ui-check': 'ph-browser', fix: 'ph-wrench', commit: 'ph-git-commit', cut: 'ph-scissors', 'check-design': 'ph-ruler', spec: 'ph-list-checks', 'clean-code': 'ph-broom', 'intake-triage': 'ph-tray', lanes: 'ph-git-fork', verify: 'ph-check-square', 'write-sheet': 'ph-table' };
const LIVE = 'live';
const CHANGES = 'changes';
const TAB_LABEL = (f) => f === LIVE ? 'Trực tiếp' : f === CHANGES ? 'Thay đổi' : f === 'plan.md' ? 'Plan' : `${f.endsWith('.log') ? 'Log ' : ''}${f.replace(/\.(json|log|md)$/, '').replace(/-r(\d+)$/, ' · vòng $1')}`;

let data = { runs: [], flows: [] };
let selectedKey = null;
let artifact = null;
let lastStates = {};
let lastSig = '';
let flowChoice = 0;
let runFiles = [];
const ACTION_LABEL = { approve: 'duyệt', reject: 'trả về', abort: 'huỷ và dọn sạch', resume: 'chạy tiếp', done: 'xong', reviewed: 'đã review' };
const ABORT_BTN = '<button class="btn ghost" data-act="abort">Huỷ run</button>';


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

const shQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const tabIdOf = ({ key, runId }) => `ap-${key}-${runId}`;

function openChatTab(launch) {
  const env = Object.entries(launch.env).map(([k, v]) => `${k}=${shQuote(v)}`).join(' ');
  openTerminal(`cd ${shQuote(launch.cwd)} && ${env} claude ${launch.args.map(shQuote).join(' ')}`, launch.key, tabIdOf(launch));
}

// Tab còn mở thì chỉ chuyển sang; đã đóng thì xin CLI lệnh nối phiên claude mới nhất của worktree
async function reopenChat(run) {
  if (hasTab(tabIdOf(run))) return openTerminal(null, run.key, tabIdOf(run));
  const launch = await post('open', { key: run.key, resume: true }, 'Đã mở lại tab Claude của run.');
  if (launch) openChatTab(launch);
}

function renderQueue() {
  if (!data.runs.length) {
    $('#apQueue').innerHTML = '<p style="color:var(--text-3);padding:12px 8px;font-size:13px">Chưa có run nào. Bấm "Chạy ticket" để bắt đầu.</p>';
    return;
  }
  $('#apQueue').innerHTML = GROUPS.map(([cls, title, belongs]) => {
    const runs = data.runs.filter(belongs);
    if (!runs.length) return '';
    const folded = cls === 'aborted' && !abortedOpen;
    const head = cls === 'aborted'
      ? `<h3 class="fold" data-fold title="Run đã huỷ và hoàn tác — giữ lại để xem log, không cần xử lý"><span><i class="ph ph-caret-${folded ? 'right' : 'down'}"></i> ${title}</span><span class="mono">${runs.length}</span></h3>`
      : `<h3><span>${title}</span><span class="mono">${runs.length}</span></h3>`;
    return `<div class="group ${cls}">${head}${folded ? '' : runs.map((r) => `
      <button class="item ${r.key === selectedKey ? 'on' : ''}" data-key="${esc(r.key)}">
        <span class="key">${esc(r.key)}</span><span class="cost mono">${r.mode === 'chat' ? `${compact(r.totals.tokens)} tok` : money(r.totals.usd)}</span>
        <span class="sub">${esc(r.flowLabel)} · ${esc(r.stage ?? (r.awaitingReview ? 'chờ review' : 'hoàn tất'))}</span>
        <span class="mini">${r.cells.filter((c) => !c.side).map((c) => `<i class="${c.state}"></i>`).join('')}</span>
      </button>`).join('')}</div>`;
  }).join('');
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
  return `<div class="node ${c.state} ${kind} ${changed}" id="n-${esc(c.id)}">
    ${c.rounds > 1 ? `<span class="badge-round">×${c.rounds}</span>` : ''}
    <div class="dot"><i class="ph-bold ${icon}"></i></div>
    <div class="name">${esc(c.id)}</div><div class="note">${note}</div></div>`;
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

const fetchChanges = async (run) => (await fetch(`/api/autopilot/runs/${run.key}/${run.runId}/changes`)).json();

const DIFF_LINE = { '+': 'add', '-': 'del', '@': 'hunk' };
// Bỏ phần đầu (diff --git, index, ---/+++) để dấu +/- chỉ còn là dòng thêm/bớt
function diffHtml(diff) {
  const hunks = diff.indexOf('\n@@');
  const body = hunks < 0 ? diff : diff.slice(hunks + 1);
  return body.split('\n').map((line) => `<span class="${DIFF_LINE[line[0]] ?? ''}">${esc(line)}</span>`).join('\n');
}

const repoChangesHtml = (c) => `<div class="repo-changes">
  <div class="rc-head"><b>${esc(c.name)}</b><code>${esc(c.branch)}</code><button class="btn ghost sm" data-code="${esc(c.worktree)}"><i class="ph-bold ph-code"></i>Mở trong VS Code</button></div>
  ${c.commits.length ? `<ul class="commits">${c.commits.map((x) => `<li><code>${x.sha.slice(0, 9)}</code>${esc(x.subject)}</li>`).join('')}</ul>` : '<p class="rc-empty">Không có commit mới trên nhánh này.</p>'}
  ${c.files.map((f) => `<details class="file-diff"><summary><span class="fs ${f.status}">${f.status}</span><code>${esc(f.path)}</code></summary><pre class="diff">${diffHtml(f.diff)}${f.truncated ? '\n<span class="hunk">… diff quá dài, mở VS Code để xem hết</span>' : ''}</pre></details>`).join('')}
</div>`;

async function renderChanges(run) {
  const repos = await fetchChanges(run);
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
  $('#apMain').innerHTML = `
    <div class="top">
      <div>
        <div class="head"><h1>${esc(run.key)}</h1><span class="state ${statusClass(run)}">${statusLabel(run)}${run.stopReason && !isUserPaused(run) ? ` · ${esc(run.stopReason)}` : ''}</span>${run.status === 'running' && !run.interrupted ? `<button class="btn ghost" data-pause><i class="ph-bold ph-pause"></i>Dừng ngay</button>${ABORT_BTN}` : ''}</div>
        <div class="meta">${esc(run.flowLabel)}. Router chọn vì: ${esc(run.routerReason)}</div>
        <div class="meta"><code>${esc(run.campaignDir ?? 'chưa có campaign')}</code></div>
      </div>
      <div class="meters">${usage('ph-lightning', compact(tokens), 'token tiêu hao', `${tokens.toLocaleString('vi-VN')} token (gồm cache) · ${money(run.totals.usd)}`)}${usage('ph-timer', `${run.totals.minutes}′`, 'phút tiêu hao', run.mode === 'chat' ? 'từ đầu tới cuối phiên claude mới nhất của tab' : 'thời gian máy chạy các bước, không tính lúc chờ duyệt')}</div>
    </div>
    <div class="flow"><div class="flow-inner" id="flowInner">
      <svg class="wires" id="wires"></svg>
      <div class="lane">${lane.map(nodeHtml).join('')}</div>
      ${side.length ? `<div class="lane side" id="sideLane">${side.map(nodeHtml).join('')}</div>` : ''}
    </div></div>
    <div class="panes">
      <section>
        <div class="tabs">${tabs.map((f) => `<button class="tab ${f === artifact ? 'on' : ''}" data-file="${esc(f)}">${f === LIVE ? '<span class="pulse"></span>' : starred.includes(f) ? '<span class="star">★</span>' : ''}${esc(TAB_LABEL(f))}</button>`).join('')}</div>
        <div id="doc"><div class="skel"></div><div class="skel" style="width:70%"></div></div>
      </section>
      <section>
        <p class="side-h">Các lượt đã chạy</p>
        <div class="timeline">${run.receipts.map((r, i) => `
          <div class="tl ${esc(r.verdict)}" style="animation-delay:${i * 30}ms">
            <div class="row1"><b>${esc(r.stage)} · vòng ${r.round}</b><span>${money(r.costUsd)}</span></div>
            <div class="row2">${esc(r.verdict)}${r.note !== undefined ? (r.note ? ` · ${esc(r.note)}` : '') : ` · ${r.blocking} chặn · ${r.advisory} gợi ý · ${r.turns} lượt · ${mins(r.ms)}′`}</div>
          </div>`).join('') || '<p style="color:var(--text-3);font-size:13px">Chưa có lượt nào.</p>'}</div>
        <div class="total"><span>${run.totals.runs} lượt claude · ${run.totals.turns} turns</span><span>${money(run.totals.usd)}</span></div>
      </section>
    </div>`;
  placeSideLane(run, lane, side);
  requestAnimationFrame(() => drawWires(run));
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

function dockMessage(run) {
  const stage = `<b>${esc(run.stage ?? '')}</b>`;
  if (run.awaitingReview) return 'Run xong, <b>chờ bạn review</b> code ở tab Thay đổi. Cần sửa thì ghi chú rồi Trả về sửa hoặc Sửa tiếp bằng chat.';
  if (isAsking(run)) return `Claude đang chờ bạn ở ${stage}${run.chatNote ? `: ${esc(run.chatNote)}` : ''} — trả lời trong tab Claude.`;
  if (run.status === 'chat') return `Run chat đang ở ${stage}. Làm việc trong tab Claude, claude tự báo tiến độ lên board.`;
  if (run.interrupted) return `Run bị ngắt ở ${stage} (không còn process chạy). Chạy tiếp để làm lại bước này.`;
  if (run.status === 'paused') return `Chờ bạn ở ${stage}. Duyệt để chạy tiếp, hoặc ghi chú rồi trả về.`;
  if (run.status === 'attached') return `Chờ bạn ở ${stage}: chạy <code>${esc(run.command)}</code> trong phiên Claude.`;
  if (isUserPaused(run) && run.cutSession) return `Đã dừng giữa ${stage}. Nhắn thêm cho claude (tuỳ chọn) rồi Chạy tiếp, claude nối đúng phiên đang dở.`;
  if (isUserPaused(run)) return `Đã tạm dừng trước ${stage}. Chạy tiếp khi bạn sẵn sàng.`;
  return `Run đã dừng <b>(${esc(run.stopReason)})</b>.`;
}

const REVIEW_ACTIONS = `${ABORT_BTN}<button class="btn ghost" data-pick><i class="ph-bold ph-git-merge"></i>Đưa vào source</button><button class="btn ghost" data-act="followup"><i class="ph-bold ph-terminal-window"></i>Sửa tiếp bằng chat</button><button class="btn back" data-act="reject"><i class="ph-bold ph-arrow-u-up-left"></i>Trả về sửa</button><button class="btn go" data-act="reviewed"><i class="ph-bold ph-check"></i>Đã review</button>`;

function renderDock(run) {
  const show = ['paused', 'attached', 'stopped', 'chat'].includes(run.status) || run.interrupted || run.awaitingReview;
  $('#dock').classList.toggle('show', show);
  $('#pickBox').innerHTML = '';
  if (!show) return;
  const paused = run.status === 'paused';
  $('#dockMessage').innerHTML = dockMessage(run);
  const cut = isUserPaused(run) && run.cutSession;
  $('#note').style.display = paused || cut || run.awaitingReview ? '' : 'none';
  $('#note').placeholder = cut ? 'Nhắn claude khi chạy tiếp: đổi hướng, bổ sung gì...' : run.awaitingReview ? 'Cần sửa gì (cho Trả về sửa hoặc Sửa tiếp bằng chat)...' : 'Ghi chú khi trả về: cần sửa gì...';
  $('#prevNote').textContent = run.rejectNote ? `Lần trả về trước: ${run.rejectNote}` : '';
  $('#actions').innerHTML = run.awaitingReview ? REVIEW_ACTIONS : run.status === 'chat'
    ? `${ABORT_BTN}<button class="btn ghost" data-act="reopen"><i class="ph-bold ph-terminal-window"></i>Mở lại tab</button><button class="btn go" data-act="done"><i class="ph-bold ph-check"></i>Xong</button>`
    : paused
    ? `${ABORT_BTN}<button class="btn back" data-act="reject"><i class="ph-bold ph-arrow-u-up-left"></i>Trả về <kbd>R</kbd></button><button class="btn go" data-act="approve"><i class="ph-bold ph-check"></i>Duyệt <kbd>A</kbd></button>`
    : run.status === 'attached'
      ? `${ABORT_BTN}<button class="btn go" data-act="approve"><i class="ph-bold ph-check"></i>Đã xong, chạy tiếp</button>`
      : run.stopReason === 'aborted' ? '' : `${ABORT_BTN}<button class="btn go" data-act="resume"><i class="ph-bold ph-play"></i>Chạy tiếp</button>`;
}

async function togglePickBox(run) {
  if ($('#pickBox').innerHTML) return ($('#pickBox').innerHTML = '');
  const picks = (await fetchChanges(run)).filter((c) => c.cherryPick);
  $('#pickBox').innerHTML = picks.length
    ? `<p>Chạy trong terminal để đưa commit vào repo gốc (autopilot không tự chạy):</p>${picks.map((c) => `<div class="pick"><code>${esc(c.cherryPick)}</code><button class="btn ghost sm" data-copy="${esc(c.cherryPick)}"><i class="ph-bold ph-copy"></i>Chép</button></div>`).join('')}`
    : '<p>Nhánh không có commit mới, không có gì để đưa vào source.</p>';
}

async function copyCommand(btn) {
  await navigator.clipboard.writeText(btn.dataset.copy);
  toast('Đã chép lệnh cherry-pick.');
}

// Chat sửa tiếp chạy trên chính worktree của run đã xong, lời nhắn vào brief
async function followupChat(run) {
  const launch = await post('open', { key: run.key, followup: true, note: $('#note').value.trim() }, 'Đã mở tab Claude trên worktree của run.');
  if (!launch) return;
  $('#note').value = '';
  openChatTab(launch);
  lastSig = '';
  refresh();
}

async function refresh() {
  const next = await (await fetch('/api/autopilot/runs')).json();
  const sig = JSON.stringify(next.runs);
  data = next;
  selectedKey ??= data.runs.find((r) => !isAborted(r))?.key ?? null;
  if (sig === lastSig) return;
  lastSig = sig;
  renderQueue();
  if (document.activeElement?.id !== 'note') await renderMain();
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

async function act(action) {
  const run = data.runs.find((r) => r.key === selectedKey);
  if (!run) return;
  const note = $('#note').value.trim();
  if (action === 'reject' && !note) {
    $('#note').focus();
    return toast('Trả về cần ghi chú để bước sau biết sửa gì.', true);
  }
  document.querySelectorAll('#actions .btn').forEach((b) => (b.disabled = true));
  if (!(await post(action, { key: run.key, note }))) return renderDock(run);
  $('#note').value = '';
  $('#actions').innerHTML = `<span class="sending"><i class="ph-bold ph-circle-notch spin"></i>Đã gửi lệnh ${ACTION_LABEL[action]}, chờ autopilot nhận…</span>`;
  lastSig = '';
  setTimeout(refresh, 1500);
}

async function pauseRun(btn) {
  const run = data.runs.find((r) => r.key === selectedKey);
  btn.disabled = true;
  if (await post('pause', { key: run.key }, `Đã dừng ngay bước ${run.stage}.`)) btn.innerHTML = '<i class="ph-bold ph-circle-notch spin"></i>Đang dừng…';
  else btn.disabled = false;
}

function renderFlows() {
  const opts = [{ id: '', label: 'Router tự chọn luồng' }, ...data.flows];
  $('#flows').innerHTML = opts.map((f, i) => `<button class="flowopt ${i === flowChoice ? 'on' : ''}" data-i="${i}"><span>${esc(f.label)}</span><small>${esc(f.id || 'auto')}</small></button>`).join('');
}
function openPalette() {
  flowChoice = 0;
  renderFlows();
  $('#veil').classList.add('show');
  setTimeout(() => $('#ticket').focus(), 50);
}
const closePalette = () => $('#veil').classList.remove('show');
async function startRun(mode) {
  const input = $('#ticket').value.trim();
  if (!input) return toast('Nhập mã ticket hoặc link.', true);
  const flow = [{ id: '' }, ...data.flows][flowChoice].id || undefined;
  const out = mode === 'chat' ? await post('open', { input, flow }, 'Đã tạo worktree, mở tab Claude.') : await post('run', { input, flow });
  if (!out) return;
  $('#ticket').value = '';
  closePalette();
  if (mode === 'chat') openChatTab(out);
  selectedKey = mode === 'chat' ? out.key : input.match(/[A-Z][A-Z0-9]*-\d+/)?.[0] ?? selectedKey;
  setTimeout(() => { lastSig = ''; refresh(); }, mode === 'chat' ? 0 : 2500);
}


const MARKUP = `
<aside class="ap-queue">
  <div class="brand">
    <i class="ph-bold ph-flow-arrow" style="font-size:20px;color:var(--ok)"></i>
    <b>Autopilot</b>
    <button class="new" id="openPalette"><i class="ph ph-plus"></i>Chạy ticket <kbd>⌘K</kbd></button>
  </div>
  <div class="queue" id="apQueue"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
</aside>

<section class="ap-main" id="apMain"><div class="skel" style="width:30%;height:28px"></div><div class="skel" style="height:80px"></div></section>

<div class="dock" id="dock">
  <div class="dock-card">
    <div>
      <label for="note" id="dockMessage"></label>
      <textarea id="note" placeholder="Ghi chú khi trả về: cần sửa gì..."></textarea>
      <div class="prev" id="prevNote"></div>
      <div class="pick-box" id="pickBox"></div>
    </div>
    <div class="actions" id="actions"></div>
  </div>
</div>

<div class="veil" id="veil">
  <div class="palette" role="dialog" aria-label="Chạy ticket mới">
    <input id="ticket" placeholder="GW-123 hoặc link sheet / Jira" autocomplete="off">
    <div class="flows" id="flows"></div>
    <div class="foot"><span>↑↓ chọn luồng · Esc đóng</span><span class="modes"><button class="btn ghost" data-mode="auto" title="Chạy các bước bằng claude -p tới mốc cần bạn">Chạy tự động <kbd>⌘↵</kbd></button><button class="btn go" data-mode="chat" title="Tạo worktree rồi mở một tab Claude để làm cùng bạn">Mở tab chat <kbd>↵</kbd></button></span></div>
  </div>
</div>`;

export function mount(el) {
  el.innerHTML = `<div class="ap">${MARKUP}</div>`;
  lastSig = '';
  lastStates = {};
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
  function stageFile(id) {
    const rounds = runFiles.filter((f) => f.startsWith(`${id}-r`) && f.endsWith('.json')).sort();
    return id === 'plan' && runFiles.includes('plan.md') ? 'plan.md' : rounds.at(-1);
  }
  $('#apMain').addEventListener('click', (e) => {
    const pauseBtn = e.target.closest('[data-pause]');
    if (pauseBtn) return pauseRun(pauseBtn);
    const abortBtn = e.target.closest('.head [data-act="abort"]');
    if (abortBtn) return armAbort(abortBtn) && act('abort');
    const node = e.target.closest('.node');
    if (node) {
      const file = stageFile(node.id.slice(2));
      if (!file) return toast(`Bước ${node.id.slice(2)} chưa chạy, chưa có kết quả để xem.`);
      artifact = file;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.file === file));
      renderArtifact(data.runs.find((r) => r.key === selectedKey));
      return $('.panes').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const codeBtn = e.target.closest('[data-code]');
    if (codeBtn) {
      const run = data.runs.find((r) => r.key === selectedKey);
      return post('code', { key: run.key, runId: run.runId, dir: codeBtn.dataset.code }, 'Đã mở worktree trong VS Code.');
    }
    const tab = e.target.closest('.tab');
    if (!tab) return;
    artifact = tab.dataset.file;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    renderArtifact(data.runs.find((r) => r.key === selectedKey));
  });
  $('#dock').addEventListener('click', (e) => {
    const run = data.runs.find((r) => r.key === selectedKey);
    if (e.target.closest('[data-pick]')) return togglePickBox(run);
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) copyCommand(copyBtn);
  });
  $('#actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b?.dataset.act === 'reopen') return reopenChat(data.runs.find((r) => r.key === selectedKey));
    if (b?.dataset.act === 'followup') return followupChat(data.runs.find((r) => r.key === selectedKey));
    if (b && (b.dataset.act !== 'abort' || armAbort(b))) act(b.dataset.act);
  });
  $('#openPalette').addEventListener('click', openPalette);
  $('#veil').addEventListener('click', (e) => {
    if (e.target.id === 'veil') return closePalette();
    const mode = e.target.closest('[data-mode]');
    if (mode) return startRun(mode.dataset.mode);
    const opt = e.target.closest('.flowopt');
    if (opt) { flowChoice = Number(opt.dataset.i); renderFlows(); $('#ticket').focus(); }
  });
  const onKey = (e) => {
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
    if ($('#veil').classList.contains('show')) {
      const total = data.flows.length + 1;
      if (e.key === 'Escape') closePalette();
      if (e.key === 'ArrowDown') { flowChoice = (flowChoice + 1) % total; renderFlows(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { flowChoice = (flowChoice + total - 1) % total; renderFlows(); e.preventDefault(); }
      if (e.key === 'Enter') startRun(e.metaKey || e.ctrlKey ? 'auto' : 'chat');
      return;
    }
    if (typing || !$('#dock').classList.contains('show')) return;
    if (e.key === 'a' && $('#actions [data-act="approve"]')) act('approve');
    if (e.key === 'r') $('#note').focus();
  };
  $('#note').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) act('reject');
  });
  const onResize = () => {
    const run = data.runs.find((r) => r.key === selectedKey);
    if (run) drawWires(run);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  refresh();
  const timer = setInterval(() => refresh().catch(() => {}), 4000);
  const liveTimer = setInterval(() => {
    const run = data.runs.find((r) => r.key === selectedKey);
    if (run?.status === 'running' && artifact === LIVE) renderLog(run).catch(() => {});
  }, 2000);
  return () => {
    clearInterval(timer);
    clearInterval(liveTimer);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
