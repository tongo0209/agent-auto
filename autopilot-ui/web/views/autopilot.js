import { $, esc, toast } from '../lib.js';

const money = (n) => `$${(n ?? 0).toFixed(2)}`;
const mins = (ms) => Math.round((ms ?? 0) / 60000);
const globRe = (g) => new RegExp('^' + g.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

const STATUS = { paused: 'Chờ bạn duyệt', attached: 'Chờ chạy trong phiên', running: 'Đang chạy', stopped: 'Đã dừng', done: 'Xong' };
const GROUPS = [['need', 'Cần bạn', ['paused', 'attached']], ['run', 'Đang chạy', ['running']], ['stop', 'Đã dừng', ['stopped']], ['done', 'Xong', ['done']]];
const ICON_BY_STATE = { done: 'ph-check', running: 'ph-circle-notch spin', waiting: 'ph-hand', stopped: 'ph-x' };
const ICON_BY_ID = { plan: 'ph-map-trifold', 'plan-review': 'ph-magnifying-glass', implement: 'ph-code', 'code-review': 'ph-git-diff', gates: 'ph-shield-check', 'gates-final': 'ph-shield-check', 'ui-check': 'ph-browser', fix: 'ph-wrench', commit: 'ph-git-commit', cut: 'ph-scissors', 'check-design': 'ph-ruler', spec: 'ph-list-checks', 'clean-code': 'ph-broom', 'intake-triage': 'ph-tray', lanes: 'ph-git-fork', verify: 'ph-check-square', 'write-sheet': 'ph-table' };
const TAB_LABEL = (f) => f === 'plan.md' ? 'Plan' : `${f.endsWith('.log') ? 'Log ' : ''}${f.replace(/\.(json|log|md)$/, '').replace(/-r(\d+)$/, ' · vòng $1')}`;

let data = { runs: [], flows: [] };
let selectedKey = null;
let artifact = null;
let lastStates = {};
let lastSig = '';
let flowChoice = 0;
let runFiles = [];
const ACTION_LABEL = { approve: 'duyệt', reject: 'trả về', abort: 'huỷ', resume: 'chạy tiếp' };


async function post(action, body) {
  try {
    const res = await fetch(`/api/autopilot/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    toast(res.ok ? 'Đã gửi. Autopilot chạy nền, trang tự cập nhật.' : `Không gửi được: ${out.error}`, !res.ok);
    return res.ok;
  } catch (e) {
    toast(`Không tới được server autopilot: ${e.message}`, true);
    return false;
  }
}

function renderQueue() {
  if (!data.runs.length) {
    $('#apQueue').innerHTML = '<p style="color:var(--text-3);padding:12px 8px;font-size:13px">Chưa có run nào. Bấm "Chạy ticket" để bắt đầu.</p>';
    return;
  }
  $('#apQueue').innerHTML = GROUPS.map(([cls, title, statuses]) => {
    const runs = data.runs.filter((r) => statuses.includes(r.status));
    if (!runs.length) return '';
    return `<div class="group ${cls}"><h3><span>${title}</span><span class="mono">${runs.length}</span></h3>${runs.map((r) => `
      <button class="item ${r.key === selectedKey ? 'on' : ''}" data-key="${esc(r.key)}">
        <span class="key">${esc(r.key)}</span><span class="cost mono">${money(r.totals.usd)}</span>
        <span class="sub">${esc(r.flowLabel)} · ${esc(r.stage ?? 'hoàn tất')}</span>
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
  const packet = live && run.status !== 'stopped'
    ? `<circle r="4" class="packet ${live.wait ? 'wait' : ''}"><animateMotion dur="${live.wait ? '2.6s' : '1.1s'}" repeatCount="indefinite" path="${live.d}"/></circle>`
    : '';
  $('#wires').innerHTML = paths.join('') + packet;
  $('#wires').setAttribute('width', host.scrollWidth);
  $('#wires').setAttribute('height', host.scrollHeight);
}

function meter(label, used, limit, fmt) {
  const ratio = limit ? Math.min(used / limit, 1) : 0;
  const c = 2 * Math.PI * 20;
  const cls = ratio >= 1 ? 'over' : ratio > 0.75 ? 'hot' : '';
  return `<div class="meter"><svg width="52" height="52" viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="20"/><circle class="val ${cls}" cx="26" cy="26" r="20" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - ratio)}"/></svg>
    <div><b>${fmt(used)}</b><small>${label} / ${fmt(limit)}</small></div></div>`;
}

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

async function renderArtifact(run) {
  const pane = $('#doc');
  if (!artifact) return (pane.innerHTML = '<p style="color:var(--text-3)">Chưa có kết quả nào.</p>');
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
  const tabs = [...starred, ...files.filter((f) => !starred.includes(f) && !f.endsWith('.log')), ...files.filter((f) => f.endsWith('.log'))];
  if (!artifact || !files.includes(artifact)) artifact = starred.find((f) => f === 'plan.md') ?? starred.at(-1) ?? tabs[0] ?? null;

  const { lane, side } = mainLane(run.cells);
  const elapsed = run.receipts.reduce((n, r) => n + (r.ms ?? 0), 0);
  $('#apMain').innerHTML = `
    <div class="top">
      <div>
        <div class="head"><h1>${esc(run.key)}</h1><span class="state ${run.status}">${STATUS[run.status]}${run.stopReason ? ` · ${esc(run.stopReason)}` : ''}</span></div>
        <div class="meta">${esc(run.flowLabel)}. Router chọn vì: ${esc(run.routerReason)}</div>
        <div class="meta"><code>${esc(run.campaignDir ?? 'chưa có campaign')}</code></div>
      </div>
      <div class="meters">${meter('ngân sách', run.totals.usd, run.budget.usd, money)}${meter('phút máy', mins(elapsed), run.budget.minutes, (n) => `${n}′`)}</div>
    </div>
    <div class="flow"><div class="flow-inner" id="flowInner">
      <svg class="wires" id="wires"></svg>
      <div class="lane">${lane.map(nodeHtml).join('')}</div>
      ${side.length ? `<div class="lane side" id="sideLane">${side.map(nodeHtml).join('')}</div>` : ''}
    </div></div>
    <div class="panes">
      <section>
        <div class="tabs">${tabs.map((f) => `<button class="tab ${f === artifact ? 'on' : ''}" data-file="${esc(f)}">${starred.includes(f) ? '<span class="star">★</span>' : ''}${esc(TAB_LABEL(f))}</button>`).join('')}</div>
        <div id="doc"><div class="skel"></div><div class="skel" style="width:70%"></div></div>
      </section>
      <section>
        <p class="side-h">Các lượt đã chạy</p>
        <div class="timeline">${run.receipts.map((r, i) => `
          <div class="tl ${esc(r.verdict)}" style="animation-delay:${i * 30}ms">
            <div class="row1"><b>${esc(r.stage)} · vòng ${r.round}</b><span>${money(r.costUsd)}</span></div>
            <div class="row2">${esc(r.verdict)} · ${r.blocking} chặn · ${r.advisory} gợi ý · ${r.turns} lượt · ${mins(r.ms)}′</div>
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

function renderDock(run) {
  const show = run.status === 'paused' || run.status === 'attached' || run.status === 'stopped';
  $('#dock').classList.toggle('show', show);
  if (!show) return;
  const paused = run.status === 'paused';
  $('#dockStage').textContent = run.status === 'stopped' ? `run đã dừng (${run.stopReason})` : run.status === 'attached' ? `${run.stage}: chạy ${run.command} trong phiên Claude` : run.stage;
  $('#note').style.display = paused ? '' : 'none';
  $('#prevNote').textContent = run.rejectNote ? `Lần trả về trước: ${run.rejectNote}` : '';
  $('#actions').innerHTML = paused
    ? `<button class="btn ghost" data-act="abort">Huỷ run</button><button class="btn back" data-act="reject"><i class="ph-bold ph-arrow-u-up-left"></i>Trả về <kbd>R</kbd></button><button class="btn go" data-act="approve"><i class="ph-bold ph-check"></i>Duyệt <kbd>A</kbd></button>`
    : run.status === 'attached'
      ? `<button class="btn ghost" data-act="abort">Huỷ run</button><button class="btn go" data-act="approve"><i class="ph-bold ph-check"></i>Đã xong, chạy tiếp</button>`
      : run.stopReason === 'aborted' ? '' : `<button class="btn go" data-act="resume"><i class="ph-bold ph-play"></i>Chạy tiếp</button>`;
}

async function refresh() {
  const next = await (await fetch('/api/autopilot/runs')).json();
  const sig = JSON.stringify(next.runs);
  data = next;
  selectedKey ??= data.runs[0]?.key ?? null;
  if (sig === lastSig) return;
  lastSig = sig;
  renderQueue();
  if (document.activeElement?.id !== 'note') await renderMain();
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
async function startRun() {
  const input = $('#ticket').value.trim();
  if (!input) return toast('Nhập mã ticket hoặc link.', true);
  const flow = [{ id: '' }, ...data.flows][flowChoice].id || undefined;
  if (await post('run', { input, flow })) {
    $('#ticket').value = '';
    closePalette();
    selectedKey = input.match(/[A-Z][A-Z0-9]*-\d+/)?.[0] ?? selectedKey;
    setTimeout(() => { lastSig = ''; refresh(); }, 2500);
  }
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
      <label for="note">Chờ bạn ở <b id="dockStage"></b>. Duyệt để chạy tiếp, hoặc ghi chú rồi trả về.</label>
      <textarea id="note" placeholder="Ghi chú khi trả về: cần sửa gì..."></textarea>
      <div class="prev" id="prevNote"></div>
    </div>
    <div class="actions" id="actions"></div>
  </div>
</div>

<div class="veil" id="veil">
  <div class="palette" role="dialog" aria-label="Chạy ticket mới">
    <input id="ticket" placeholder="GW-123 hoặc link sheet / Jira" autocomplete="off">
    <div class="flows" id="flows"></div>
    <div class="foot"><span>↑↓ chọn luồng · Enter chạy · Esc đóng</span><span id="paletteHint"></span></div>
  </div>
</div>`;

export function mount(el) {
  el.innerHTML = `<div class="ap">${MARKUP}</div>`;
  lastSig = '';
  lastStates = {};
  $('#apQueue').addEventListener('click', (e) => {
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
    const node = e.target.closest('.node');
    if (node) {
      const file = stageFile(node.id.slice(2));
      if (!file) return toast(`Bước ${node.id.slice(2)} chưa chạy, chưa có kết quả để xem.`);
      artifact = file;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.file === file));
      renderArtifact(data.runs.find((r) => r.key === selectedKey));
      return $('.panes').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const tab = e.target.closest('.tab');
    if (!tab) return;
    artifact = tab.dataset.file;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    renderArtifact(data.runs.find((r) => r.key === selectedKey));
  });
  $('#actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) act(b.dataset.act);
  });
  $('#openPalette').addEventListener('click', openPalette);
  $('#veil').addEventListener('click', (e) => {
    if (e.target.id === 'veil') return closePalette();
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
      if (e.key === 'Enter') startRun();
      return;
    }
    if (typing || !$('#dock').classList.contains('show')) return;
    if (e.key === 'a') act('approve');
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
  return () => {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
