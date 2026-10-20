const FINISHED = ['done', 'stopped'];
const STATUS_BY_KIND = { pause: 'paused', attached: 'attached' };

export function createRun({ key, runId, flow, routerReason, repo, campaignDir, handoffDir = null, cloneSource = null, repos = [repo], now }) {
  return {
    key, runId, flow: flow.id, routerReason, repo, campaignDir, handoffDir, cloneSource,
    repos: [...new Set(repos.filter(Boolean))],
    worktrees: {},
    status: 'running',
    stage: flow.stages[0].id,
    callerOfFix: null,
    rejectNote: null,
    loops: {},
    sessions: {},
    blockedBy: [],
    stopReason: null,
    budget: { ...flow.budget },
    startedAt: now,
    receipts: [],
  };
}

export const stageOf = (flow, id) => flow.stages.find((s) => s.id === id);

export const roundOf = (run, stageId) => run.receipts.filter((r) => r.stage === stageId).length + 1;

export function nextAction(run, flow) {
  if (FINISHED.includes(run.status)) return { type: run.status, stage: null };
  const stage = stageOf(flow, run.stage);
  return { type: stage.kind, stage };
}

const stop = (run, stopReason) => ({ ...run, status: 'stopped', stopReason });

function moveTo(run, flow, id) {
  if (id == null) return { ...run, status: 'done', stage: null };
  return { ...run, stage: id, status: STATUS_BY_KIND[stageOf(flow, id).kind] ?? 'running' };
}

function advance(run, flow, stage) {
  if (stage.returnTo === 'caller') return moveTo({ ...run, callerOfFix: null }, flow, run.callerOfFix);
  return moveTo(run, flow, stage.next);
}

function loopBack(run, flow, stage) {
  const count = (run.loops[stage.id] ?? 0) + 1;
  if (count > stage.loop.max) return stop(run, `loop-exhausted:${stage.id}`);
  const looped = { ...run, loops: { ...run.loops, [stage.id]: count } };
  const target = stageOf(flow, stage.loop.back);
  return moveTo(target.returnTo === 'caller' ? { ...looped, callerOfFix: stage.id } : looped, flow, target.id);
}

function transition(run, flow, stage, event) {
  switch (event.type) {
    case 'pass':
    case 'skip':
    case 'approve':
      return advance(run, flow, stage);
    case 'revise':
      if (stage.onRevise) return moveTo(run, flow, stage.onRevise);
      return stage.loop ? loopBack(run, flow, stage) : advance(run, flow, stage);
    case 'fail':
      return stage.loop ? loopBack(run, flow, stage) : stop(run, `fail:${stage.id}`);
    case 'reject': {
      const noted = { ...run, rejectNote: event.note ?? null };
      if (!stage.onReject) return stop(noted, 'rejected');
      const target = stageOf(flow, stage.onReject);
      const caller = target.returnTo === 'caller' ? { callerOfFix: stage.rejectReturnTo ?? stage.id } : {};
      return moveTo({ ...noted, ...caller }, flow, target.id);
    }
    case 'halt':
      return stop(run, event.reason);
    default:
      throw new Error(`event lạ: ${event.type}`);
  }
}

// Phút = thời gian máy chạy stage, không tính lúc chờ người duyệt
function overBudget(run) {
  const usd = run.receipts.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const ms = run.receipts.reduce((sum, r) => sum + (r.ms ?? 0), 0);
  return usd > run.budget.usd || ms > run.budget.minutes * 60_000;
}

export function applyEvent(run, flow, event, now) {
  if (FINISHED.includes(run.status)) return run;
  const stage = stageOf(flow, run.stage);

  let next = run;
  if (event.receipt) {
    const receipt = { ...event.receipt, round: roundOf(run, stage.id), at: new Date(now).toISOString() };
    next = { ...next, receipts: [...next.receipts, receipt] };
  }
  if (event.sessionId && stage.keepSession) next = { ...next, sessions: { ...next.sessions, [stage.id]: event.sessionId } };

  next = transition(next, flow, stage, event);
  return next.status !== 'done' && next.status !== 'stopped' && overBudget(next) ? stop(next, 'budget') : next;
}

const BUDGET_BUMP = 1.5;

function resumedBudget(run, { budgetUsd, budgetMinutes }) {
  if (budgetUsd || budgetMinutes) return { usd: budgetUsd ?? run.budget.usd, minutes: budgetMinutes ?? run.budget.minutes };
  if (run.stopReason !== 'budget') return run.budget;
  return { usd: run.budget.usd * BUDGET_BUMP, minutes: run.budget.minutes * BUDGET_BUMP };
}

export function resumeRun(run, overrides = {}) {
  const exhausted = run.stopReason?.match(/^loop-exhausted:(.+)$/)?.[1];
  return {
    ...run,
    status: 'running',
    stopReason: null,
    loops: exhausted ? { ...run.loops, [exhausted]: 0 } : run.loops,
    budget: resumedBudget(run, overrides),
  };
}
