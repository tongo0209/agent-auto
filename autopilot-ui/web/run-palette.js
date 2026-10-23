import { html, render, useState, useEffect, useRef } from './vendor/htm-preact-3.1.1.js';
import { api, toast } from './lib.js';
import { openTerminal } from './terminal.js';
import { phaseOf, RUNNABLE_PHASES, keysWithOpenRun } from './views/_kit.js';

const ROUTER_FLOW = { id: '', label: 'Router tự chọn luồng' };
const MAX_SUGGESTIONS = 5;
const AUTO_SKIP_HINT = 'tự bỏ nếu không đụng UI/pm';
const TICKET_KEY = /[A-Z][A-Z0-9]*-\d+/;

const isApproval = (s) => s.kind === 'pause' || s.kind === 'attached';
const toggled = (set, id) => {
  const next = new Set(set);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
};

// bug-radar sinh key tạm (source adhoc) có sameAs trỏ về ticket thật: chỉ gợi ý ticket thật
function readyTickets(runs, issues) {
  const hasOpenRun = keysWithOpenRun(runs);
  return Object.entries(issues)
    .filter(([key, i]) => RUNNABLE_PHASES.includes(i.phase) && !hasOpenRun.has(key) && !(i.source === 'adhoc' && i.sameAs))
    .slice(0, MAX_SUGGESTIONS)
    .map(([key, i]) => ({ key, ...i }));
}

async function send(action, body, sentMessage) {
  try {
    const out = await api(`autopilot/${action}`, { method: 'POST', body });
    toast(sentMessage);
    return out;
  } catch (e) {
    toast(`Không gửi được: ${e.message}`, true);
    return null;
  }
}

function RunPalette({ input }) {
  const [shown, setShown] = useState(false);
  const [ticket, setTicket] = useState(input ?? '');
  const [flows, setFlows] = useState([ROUTER_FLOW]);
  const [flowChoice, setFlowChoice] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const previewSeq = useRef(0);
  const ticketRef = useRef();
  const reasonRef = useRef();
  const onKeyRef = useRef();

  const reasonNeeded = Boolean(preview?.stages.some((s) => preview.off.has(s.id) && s.gateLike));
  const allClaudeOff = Boolean(preview?.stages.filter((s) => s.kind === 'claude').every((s) => preview.off.has(s.id)));
  const canRun = Boolean(preview?.flow) && !busy && (!reasonNeeded || preview.skipReason.trim() !== '');

  useEffect(() => {
    setShown(true);
    if (input) loadPreview(input);
    Promise.all([api('autopilot/runs'), api('state')])
      .then(([runs, { state }]) => {
        setFlows([ROUTER_FLOW, ...runs.flows]);
        setSuggestions(readyTickets(runs.runs, state.issues));
      })
      .catch((e) => toast(`Không tải được luồng và gợi ý: ${e.message}`, true));
    const onKey = (e) => onKeyRef.current(e);
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  useEffect(() => {
    if (shown && !preview) ticketRef.current.focus();
  }, [shown, !preview]);
  useEffect(() => {
    if (reasonNeeded && !preview.skipReason) reasonRef.current.focus();
  }, [reasonNeeded]);

  function close() {
    previewSeq.current++;
    setShown(false);
  }
  function backToInput() {
    previewSeq.current++;
    setBusy(false);
    setPreview(null);
  }
  function goToRun(key) {
    close();
    location.hash = key ? `#/autopilot/${encodeURIComponent(key)}` : '#/autopilot';
  }

  async function loadPreview(text, flow) {
    const seq = ++previewSeq.current;
    setBusy(true);
    let loaded;
    try {
      loaded = await api(`autopilot/preview?${new URLSearchParams({ input: text, ...(flow && { flow }) })}`);
    } catch (e) {
      toast(`Không xem trước được: ${e.message}`, true);
    }
    if (seq !== previewSeq.current) return;
    setBusy(false);
    if (loaded) setPreview({ input: text, ...loaded, off: new Set(), stops: new Set(), skipReason: '' });
  }
  async function startRun(mode, text = ticket.trim()) {
    if (!text) return toast('Nhập mã ticket hoặc link.', true);
    const flow = flows[flowChoice].id || undefined;
    if (mode !== 'chat') return loadPreview(text, flow);
    const out = await send('open', { input: text, flow }, 'Đã tạo worktree, mở tab Claude.');
    if (!out) return;
    openTerminal(out.command, out.key, `ap-${out.key}-${out.runId}`);
    goToRun(out.key);
  }
  async function runPreview() {
    const { input: text, flow, off, stops, skipReason } = preview;
    setBusy(true);
    const out = await send('run', { input: text, flow, skip: [...off], skipReason, breaks: [...stops] }, 'Đã gửi. Autopilot chạy nền, trang tự cập nhật.');
    if (out) return goToRun(text.match(TICKET_KEY)?.[0]);
    setBusy(false);
  }
  function pickSuggestion(key) {
    setTicket(key);
    startRun('auto', key);
  }

  // Bắt ở capture của window để phím không lọt xuống màn bên dưới khi bảng đang mở
  onKeyRef.current = (e) => {
    if (!shown) return;
    e.stopPropagation();
    const onControl = ['BUTTON', 'SELECT'].includes(document.activeElement.tagName);
    if (e.key === 'Escape') return close();
    if (preview) {
      if (e.key === 'Enter' && !onControl && canRun) runPreview();
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: flows.length - 1 }[e.key];
    if (step) {
      e.preventDefault();
      setFlowChoice((flowChoice + step) % flows.length);
    }
    if (e.key === 'Enter' && !onControl) startRun('auto');
  };

  const stageCell = (s) => {
    const off = preview.off.has(s.id);
    const stop = preview.stops.has(s.id);
    return html`<div key=${s.id} class="pv-cell ${s.kind} ${off ? 'off' : ''} ${s.predicted === 'skip' ? 'auto-skip' : ''}">
      <b>${s.id}</b><small>${s.gateLike ? 'cổng' : s.kind}</small>
      ${s.predicted === 'skip' && !off && html`<small class="pv-auto">${AUTO_SKIP_HINT}</small>`}
      ${isApproval(s)
        ? html`<small class="pv-lock">mốc duyệt</small>`
        : html`<span class="pv-ctl">
            <button class="pv-sw ${off ? '' : 'on'}" role="switch" aria-checked=${!off} aria-label="Bật/tắt ${s.id}" onClick=${() => setPreview({ ...preview, off: toggled(preview.off, s.id) })}></button>
            <button class="pv-pin ${stop ? 'on' : ''}" aria-pressed=${stop} title="Dừng sau bước này" onClick=${() => setPreview({ ...preview, stops: toggled(preview.stops, s.id) })}><i class="ph-bold ph-map-pin"></i></button>
          </span>`}
    </div>`;
  };

  return html`<div class="veil ${shown ? 'show' : ''}" onClick=${(e) => e.target === e.currentTarget && close()}>
    <div class="palette ${preview ? 'previewing' : ''}" role="dialog" aria-label="Chạy ticket mới">
      ${preview
        ? html`<div class="preview">
            <div class="pv-head">
              <button class="btn ghost" onClick=${backToInput} aria-label="Quay lại"><i class="ph ph-arrow-left"></i></button><b>${preview.input}</b>
              <select aria-label="Luồng" onChange=${(e) => loadPreview(preview.input, e.target.value || undefined)}>
                ${(preview.flow ? preview.flows : [{ id: '', label: '— chọn luồng —' }, ...preview.flows]).map((f) => html`<option value=${f.id} selected=${f.id === (preview.flow ?? '')}>${f.label}</option>`)}
              </select>
            </div>
            <p class="pv-reason">${preview.reason}</p>
            <div class="pv-stages">${preview.stages.length ? preview.stages.map(stageCell) : html`<p class="pv-empty">Chọn luồng để xem các bước.</p>`}</div>
            ${preview.stages.length > 0 && allClaudeOff && html`<p class="pv-warn">Đã tắt hết các bước claude — run chỉ còn cổng và mốc duyệt, không có gì được viết.</p>`}
            ${reasonNeeded && html`<input ref=${reasonRef} class="pv-why" placeholder="Lý do tắt cổng (bắt buộc)" autocomplete="off" value=${preview.skipReason} onInput=${(e) => setPreview({ ...preview, skipReason: e.target.value })} />`}
            <div class="pv-foot"><span>Enter chạy · Esc đóng · 📍 dừng sau bước</span><button class="btn go" disabled=${!canRun} onClick=${runPreview}>Chạy <kbd>↵</kbd></button></div>
          </div>`
        : html`
            <input ref=${ticketRef} class="rp-ticket" placeholder="GW-123 hoặc link sheet / Jira" autocomplete="off" value=${ticket} onInput=${(e) => setTicket(e.target.value)} />
            ${!ticket.trim() && suggestions.length > 0 && html`<div class="rp-suggest">
              <small>Sẵn sàng chạy</small>
              ${suggestions.map((s) => html`<button key=${s.key} class="rp-sug" onClick=${() => pickSuggestion(s.key)}>
                <b>${s.key}</b><span>${s.summary}</span><small>${[s.game, phaseOf(s.phase).label].filter(Boolean).join(' · ')}</small>
              </button>`)}
            </div>`}
            <div class="flows">${flows.map((f, i) => html`<button class="flowopt ${i === flowChoice ? 'on' : ''}" onClick=${() => { setFlowChoice(i); ticketRef.current.focus(); }}><span>${f.label}</span><small>${f.id || 'auto'}</small></button>`)}</div>
            <div class="foot"><span>↑↓ chọn luồng · Esc đóng</span><span class="modes">
              <button class="btn ghost" title="Xem các bước, chỉnh rồi chạy bằng claude -p tới mốc cần bạn" onClick=${() => startRun('auto')}>Xem trước & chạy <kbd>↵</kbd></button>
              <button class="btn go" title="Tạo worktree rồi mở một tab Claude để làm cùng bạn" onClick=${() => startRun('chat')}>Mở tab chat</button>
            </span></div>`}
    </div>
  </div>`;
}

let host = null;
let opens = 0;

export function openRunPalette({ input } = {}) {
  host ??= document.body.appendChild(document.createElement('div'));
  render(html`<${RunPalette} key=${++opens} input=${input} />`, host);
}

window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k' || document.activeElement.closest('.xterm')) return;
  e.preventDefault();
  openRunPalette();
});
