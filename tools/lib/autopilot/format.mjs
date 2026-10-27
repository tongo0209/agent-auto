import { groupOf } from './engine.mjs';
const SYMBOL = { done: '✓', running: '●', waiting: '⏸', stopped: '✗', pending: '·', skipped: '↷' };
const CURRENT_STATE = { running: 'running', paused: 'waiting', attached: 'waiting', stopped: 'stopped' };
const CHAT_STATE = { doing: 'running', ask: 'waiting', pass: 'done', fail: 'stopped' };
const currentState = (run) => (run.status === 'chat' ? CHAT_STATE[run.chatState] ?? 'pending' : CURRENT_STATE[run.status]);

const minutes = (ms) => Math.round(ms / 60_000);
const duration = (ms) => (ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`);
// Lane section chạy dưới id stage@section: tính về ô của stage gốc
const isOf = (stageId, id) => id === stageId || id.startsWith(`${stageId}@`);
const usd = (n) => Math.round(n * 100) / 100;

export function stageCells(run, flow) {
  const ranLater = (i) => flow.stages.slice(i + 1).some((s) => s.id === run.stage || run.receipts.some((r) => r.stage === s.id));
  return flow.stages.map((s, i) => {
    const receipts = run.receipts.filter((r) => isOf(s.id, r.stage));
    const last = receipts.at(-1);
    const passed = run.status === 'done' || ranLater(i);
    const skippedByUser = last?.verdict === 'skipped-by-user';
    const busy = run.status === 'running' && (run.active ?? []).some((id) => isOf(s.id, id));
    const state = s.id === run.stage ? currentState(run) : busy ? 'running' : skippedByUser ? 'skipped' : receipts.length || (passed && s.kind === 'pause') ? 'done' : passed ? 'skipped' : 'pending';
    return {
      id: s.id, kind: s.kind, state, rounds: receipts.length,
      group: groupOf(flow, s.id)?.id ?? null,
      branches: s.branches ?? null,
      breakpoint: (run.plan?.breakpoints ?? []).includes(s.id),
      skippedReason: skippedByUser ? last.note : null,
      max: s.loop?.max ?? null,
      verdict: last?.verdict ?? null,
      usd: usd(receipts.reduce((n, r) => n + r.costUsd, 0)),
      minutes: minutes(receipts.reduce((n, r) => n + r.ms, 0)),
    };
  });
}

export function parseOptions(planMd) {
  const section = planMd.match(/^ {0,3}## Phương án[^\n]*\n([\s\S]*?)(?=^ {0,3}## |(?![\s\S]))/m)?.[1] ?? '';
  return [...section.matchAll(/^ {0,3}### ([A-C]) · (.+)\n([\s\S]*?)(?=^ {0,3}#{1,3} |(?![\s\S]))/gm)]
    .map(([, id, title, body]) => ({ id, title: title.trim(), body: body.trim() }));
}

export function totals(run) {
  const claudeRuns = run.receipts.filter((r) => r.turns > 0);
  return {
    runs: claudeRuns.length,
    turns: run.receipts.reduce((n, r) => n + r.turns, 0),
    minutes: minutes(run.receipts.reduce((n, r) => n + r.ms, 0)),
    usd: usd(run.receipts.reduce((n, r) => n + r.costUsd, 0)),
    tokens: run.receipts.reduce((n, r) => n + (r.tokens ?? 0), 0),
  };
}

// Receipt cũ chưa có durationMs thì in phút như trước; nhóm song song in thêm tổng thời lượng các nhánh
const timeOf = (r) => (r.branchMs != null ? `${duration(r.wallMs)} (nhánh cộng ${duration(r.branchMs)})` : r.durationMs != null ? duration(r.durationMs) : `${minutes(r.ms)} phút`);
const receiptLine = (r) =>
  `  ${r.stage} · r${r.round} · ${r.verdict} · ${r.blocking} blocking · ${r.advisory} advisory · ${r.turns} turns · ${timeOf(r)} · $${usd(r.costUsd)}`;

const parallelSaved = (run) => run.receipts.filter((r) => r.branchMs != null).reduce((n, r) => n + Math.max(0, r.branchMs - r.wallMs), 0);

export function formatStatus(run, flow) {
  const t = totals(run);
  const status = run.status === 'stopped' ? `stopped (${run.stopReason})` : run.status;
  const atBreakpoint = run.status === 'stopped' && run.stopReason?.startsWith('breakpoint:');
  return [
    `${run.key} · ${run.flow} · ${status} · run ${run.runId}`,
    `Luồng: ${run.routerReason ?? '—'}`,
    stageCells(run, flow).map((c) => `${atBreakpoint && c.id === run.stage ? SYMBOL.waiting : SYMBOL[c.state]} ${c.id}`).join(' → '),
    ...run.receipts.map(receiptLine),
    `Tổng: ${t.runs} lượt claude · ${t.minutes} phút · $${t.usd}`,
    ...(run.receipts.some((r) => r.branchMs != null) ? [`Song song tiết kiệm: ${duration(parallelSaved(run))} (tổng nhánh − thời gian thật)`] : []),
  ].join('\n');
}
