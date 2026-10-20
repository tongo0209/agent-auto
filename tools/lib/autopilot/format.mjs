const SYMBOL = { done: '✓', running: '●', waiting: '⏸', stopped: '✗', pending: '·', skipped: '↷' };
const CURRENT_STATE = { running: 'running', paused: 'waiting', attached: 'waiting', stopped: 'stopped' };
const CHAT_STATE = { doing: 'running', ask: 'waiting', pass: 'done', fail: 'stopped' };
const currentState = (run) => (run.status === 'chat' ? CHAT_STATE[run.chatState] ?? 'pending' : CURRENT_STATE[run.status]);

const minutes = (ms) => Math.round(ms / 60_000);
const usd = (n) => Math.round(n * 100) / 100;

export function stageCells(run, flow) {
  const ranLater = (i) => flow.stages.slice(i + 1).some((s) => s.id === run.stage || run.receipts.some((r) => r.stage === s.id));
  return flow.stages.map((s, i) => {
    const receipts = run.receipts.filter((r) => r.stage === s.id);
    const last = receipts.at(-1);
    const passed = run.status === 'done' || ranLater(i);
    const skippedByUser = last?.verdict === 'skipped-by-user';
    const state = s.id === run.stage ? currentState(run) : skippedByUser ? 'skipped' : receipts.length || (passed && s.kind === 'pause') ? 'done' : passed ? 'skipped' : 'pending';
    return {
      id: s.id, kind: s.kind, state, rounds: receipts.length,
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
  const section = planMd.match(/^## Phương án[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  return [...section.matchAll(/^### ([A-C]) · (.+)\n([\s\S]*?)(?=^#{1,3} |(?![\s\S]))/gm)]
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

const receiptLine = (r) =>
  `  ${r.stage} · r${r.round} · ${r.verdict} · ${r.blocking} blocking · ${r.advisory} advisory · ${r.turns} turns · ${minutes(r.ms)} phút · $${usd(r.costUsd)}`;

export function formatStatus(run, flow) {
  const t = totals(run);
  const status = run.status === 'stopped' ? `stopped (${run.stopReason})` : run.status;
  return [
    `${run.key} · ${run.flow} · ${status} · run ${run.runId}`,
    `Luồng: ${run.routerReason ?? '—'}`,
    stageCells(run, flow).map((c) => `${SYMBOL[c.state]} ${c.id}`).join(' → '),
    ...run.receipts.map(receiptLine),
    `Tổng: ${t.runs} lượt claude · ${t.minutes} phút · $${t.usd}`,
  ].join('\n');
}
