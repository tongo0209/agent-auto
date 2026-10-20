const FINISHED = ['done', 'stopped'];
const STATUS_BY_KIND = { pause: 'paused', attached: 'attached' };

export function createRun({ key, runId, flow, routerReason, repo, campaignDir, handoffDir = null, cloneSource = null, sheetUrl = null, sheetKind = null, campaignDirs = [campaignDir], repos = [repo], disabled = [], breakpoints = [], skipReason = null, now }) {
  return {
    key, runId, flow: flow.id, routerReason, repo, campaignDir, handoffDir, cloneSource, sheetUrl, sheetKind,
    campaignDirs: campaignDirs.filter(Boolean),
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
    plan: { disabled, breakpoints, skipReason },
    choice: null,
    gateSkipped: [],
  };
}

export const isGateLike = (stage) => stage.kind === 'gate' || stage.id === 'ui-check';

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
  return usd > (run.budget.usd ?? Infinity) || ms > (run.budget.minutes ?? Infinity) * 60_000;
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

  if (event.type === 'skip' && event.by === 'user' && isGateLike(stage)) {
    next = { ...next, gateSkipped: [...(next.gateSkipped ?? []), { stage: stage.id, reason: event.reason, at: new Date(now).toISOString() }] };
  }

  next = transition(next, flow, stage, event);
  return next.status !== 'done' && next.status !== 'stopped' && overBudget(next) ? stop(next, 'budget') : next;
}

// Mặc định không giới hạn: run tạo trước khi bỏ trần vẫn mang budget cũ, chạy tiếp thì xoá
function resumedBudget({ budgetUsd, budgetMinutes }) {
  return { ...(budgetUsd && { usd: budgetUsd }), ...(budgetMinutes && { minutes: budgetMinutes }) };
}

export function resumeRun(run, overrides = {}) {
  const exhausted = run.stopReason?.match(/^loop-exhausted:(.+)$/)?.[1];
  return {
    ...run,
    status: 'running',
    stopReason: null,
    loops: exhausted ? { ...run.loops, [exhausted]: 0 } : run.loops,
    budget: resumedBudget(overrides),
  };
}

export const finalApproval = (flow) => flow.stages.find((s) => s.onReject && stageOf(flow, s.next)?.checks?.includes('commit'));

// Trả về sau review = trả về ở mốc duyệt kết quả; vòng lặp đếm lại vì đây là lượt sửa mới
export function reopenRun(run, flow, note, now) {
  const reopened = { ...run, status: 'running', loops: {}, reviewedAt: null, reopenedAt: now };
  return transition(reopened, flow, finalApproval(flow), { type: 'reject', note });
}

const RUNNABLE_KINDS = ['claude', 'gate'];
const hasReceipt = (run, id) => run.receipts.some((r) => r.stage === id);
const planOf = (run) => run.plan ?? { disabled: [], breakpoints: [] };

export function allowedActions(run, flow, { options = [] } = {}) {
  if (run.status === 'done' || run.status === 'aborted') return [];
  const actions = [];
  const stage = stageOf(flow, run.stage);
  const breakable = flow.stages.filter((s) => RUNNABLE_KINDS.includes(s.kind) && !hasReceipt(run, s.id)).map((s) => s.id);
  if (run.status === 'running') return [{ type: 'break', stages: breakable }];

  const retryable = run.status === 'stopped' && RUNNABLE_KINDS.includes(stage.kind);
  if (retryable) actions.push({ type: 'retry' });
  if (run.status === 'paused' || run.status === 'stopped') {
    const passed = flow.stages.filter((s) => s.id !== run.stage && hasReceipt(run, s.id)).map((s) => s.id);
    if (passed.length) actions.push({ type: 'goto', stages: passed });
  }
  if (retryable) actions.push({ type: 'skip', needsReason: isGateLike(stage) });
  if (run.status === 'paused' && run.stage === 'approve-plan' && options.length >= 2) {
    actions.push({ type: 'pick', options: options.map((o) => o.id) });
  }
  actions.push({ type: 'break', stages: breakable });
  return actions;
}

const forgetFrom = (run, flow, startId) => {
  const dropped = flow.stages.slice(flow.stages.findIndex((s) => s.id === startId)).map((s) => s.id);
  const loops = { ...run.loops };
  const sessions = { ...run.sessions };
  for (const id of dropped) { delete loops[id]; delete sessions[id]; }
  return { ...run, loops, sessions };
};

export function chooseAction(run, flow, action, { options = [], now } = {}) {
  const allowed = allowedActions(run, flow, { options }).find((a) => a.type === action.type);
  if (!allowed) {
    throw new Error(run.status === 'running' ? `run đang chạy, chỉ đặt được điểm dừng (không làm được "${action.type}")` : `không làm được "${action.type}" ở trạng thái ${run.status}, stage ${run.stage}`);
  }
  const { cutSession, resumeNote, ...withoutCut } = run;
  const resumed = { ...(['retry', 'goto'].includes(action.type) ? withoutCut : run), status: 'running', stopReason: null };

  switch (action.type) {
    case 'retry': {
      const { [run.stage]: _dropped, ...sessions } = run.sessions;
      return { ...resumed, loops: { ...run.loops, [run.stage]: 0 }, sessions, rejectNote: action.note ?? null };
    }
    case 'goto': {
      if (!allowed.stages.includes(action.stage)) throw new Error(`stage "${action.stage}" chưa đi qua, không quay lại được`);
      const rewound = { ...forgetFrom(resumed, flow, action.stage), stage: action.stage, rejectNote: action.note ?? null };
      const planIndex = flow.stages.findIndex((s) => s.id === 'plan');
      return flow.stages.findIndex((s) => s.id === action.stage) <= planIndex ? { ...rewound, choice: null } : rewound;
    }
    case 'skip': {
      if (allowed.needsReason && !action.reason?.trim()) throw new Error(`bỏ qua stage "${run.stage}" cần lý do`);
      const receipt = { stage: run.stage, verdict: 'skipped-by-user', note: action.reason ?? '', blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 0 };
      return applyEvent(resumed, flow, { type: 'skip', by: 'user', reason: action.reason, receipt }, now);
    }
    case 'pick': {
      const option = options.find((o) => o.id === action.option);
      if (!allowed.options.includes(action.option)) throw new Error(`phương án "${action.option}" không có trong danh sách`);
      const chosen = { ...run, choice: { id: option.id, title: option.title, note: action.note ?? null } };
      return applyEvent(chosen, flow, { type: 'approve' }, now);
    }
    case 'break': {
      if (!allowed.stages.includes(action.stage) && !planOf(run).breakpoints.includes(action.stage)) throw new Error(`stage "${action.stage}" đã chạy xong, không đặt điểm dừng được`);
      const plan = planOf(run);
      const toggled = plan.breakpoints.includes(action.stage) ? plan.breakpoints.filter((id) => id !== action.stage) : [...plan.breakpoints, action.stage];
      return { ...run, plan: { ...plan, breakpoints: toggled } };
    }
  }
}
