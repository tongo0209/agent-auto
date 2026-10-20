// View thuần cho trang /autopilot — đọc runs/ qua store của tools/lib/autopilot, không tự ghi run.json
import fs from 'node:fs';
import path from 'node:path';
import { listRuns, runDir, loadRun, planOptions } from '../tools/lib/autopilot/store.mjs';
import { runChanges } from '../tools/lib/autopilot/review.mjs';
import { loadFlow, listFlows } from '../tools/lib/autopilot/flows.mjs';
import { stageOf, allowedActions, chooseAction, checkRunPlan } from '../tools/lib/autopilot/engine.mjs';
import { stageCells, totals } from '../tools/lib/autopilot/format.mjs';
import { tokensOf } from '../tools/lib/autopilot/claude-runner.mjs';
import { isInterrupted } from '../tools/lib/autopilot/lock.mjs';
import { chatCwd, latestSession, sessionUsage } from '../tools/lib/autopilot/chat.mjs';

const STATUS_ORDER = ['paused', 'attached', 'chat', 'running', 'stopped', 'done'];
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KEY = /^[A-Z][A-Z0-9]*-[A-Za-z0-9-]+$/;

const logTokens = new Map();
function tokensFromLog(run, receipt) {
  const log = path.join(runDir(run.key, run.runId), `${receipt.stage}-r${receipt.round}.log`);
  if (!logTokens.has(log)) {
    const result = fs.existsSync(log) && fs.readFileSync(log, 'utf8').split('\n').findLast((line) => line.includes('"type":"result"'));
    logTokens.set(log, result ? tokensOf(JSON.parse(result).usage) : 0);
  }
  return logTokens.get(log);
}

// run chạy trước khi receipt có trường tokens: đọc bù từ log của stage
const withTokens = (run) => ({ ...run, receipts: run.receipts.map((r) => (r.tokens != null || !r.turns ? r : { ...r, tokens: tokensFromLog(run, r) })) });

const sessionCache = new Map();
function chatTotals(run) {
  const session = latestSession(chatCwd(run));
  if (!session) return { tokens: 0, minutes: 0 };
  const { mtimeMs } = fs.statSync(session.file);
  if (sessionCache.get(session.file)?.mtimeMs !== mtimeMs) sessionCache.set(session.file, { mtimeMs, usage: sessionUsage(session.file) });
  const { tokens, ms } = sessionCache.get(session.file).usage;
  return { tokens, minutes: Math.round(ms / 60_000) };
}

function viewOf(saved) {
  const run = withTokens(saved);
  const flow = loadFlow(run.flow);
  const options = run.stage === 'approve-plan' ? planOptions(run) : [];
  return {
    ...run,
    plan: run.plan ?? { disabled: [], breakpoints: [] },
    gateSkipped: run.gateSkipped ?? [],
    choice: run.choice ?? null,
    options,
    actions: allowedActions(run, flow, { options, interrupted: isInterrupted(run) }),
    interrupted: isInterrupted(run),
    awaitingReview: run.status === 'done' && !run.reviewedAt && Object.keys(run.worktrees ?? {}).length > 0,
    flowLabel: flow.label,
    cells: stageCells(run, flow).map((c) => {
      const stage = stageOf(flow, c.id);
      return { ...c, next: stage.next ?? null, back: stage.loop?.back ?? null, side: stage.returnTo === 'caller' };
    }),
    totals: run.mode === 'chat' ? { ...totals(run), ...chatTotals(run) } : totals(run),
    show: stageOf(flow, run.stage)?.show ?? [],
    command: stageOf(flow, run.stage)?.command ?? null,
  };
}

export async function listView() {
  const runs = listRuns()
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.runId.localeCompare(a.runId))
    .map(viewOf);
  return { runs, flows: listFlows().map((id) => ({ id, label: loadFlow(id).label })) };
}

export function listArtifacts(key, runId) {
  if (!SAFE_SEGMENT.test(key) || !SAFE_SEGMENT.test(runId)) return [];
  const dir = runDir(key, runId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && d.name !== 'run.json' && !d.name.startsWith('.')).map((d) => d.name).sort();
}

export function artifactFile(key, runId, name) {
  if (![key, runId, name].every((s) => SAFE_SEGMENT.test(s))) return null;
  const file = path.join(runDir(key, runId), name);
  return fs.existsSync(file) ? file : null;
}

const runOf = (key, runId) => (SAFE_SEGMENT.test(key ?? '') && SAFE_SEGMENT.test(runId ?? '') ? loadRun(key, runId) : null);

export function changesOf(key, runId) {
  const run = runOf(key, runId);
  return run ? runChanges(run) : null;
}

export function worktreeOf({ key, runId, dir }) {
  if (!Object.values(runOf(key, runId)?.worktrees ?? {}).includes(dir)) throw new Error('không phải worktree của run');
  return dir;
}

const STAGE = /^[a-z][a-z-]*$/;
const listFlag = (name, ids) => (ids?.length ? [name, ids.join(',')] : []);

function stageList(ids = []) {
  if (!ids.every((id) => STAGE.test(id))) throw new Error('stage không hợp lệ');
  return ids;
}

export function checkInput(input) {
  if (!input || input.startsWith('-')) throw new Error('input không hợp lệ');
}

export function actionArgs(action, { key, note, input, flow, attach, stage, option, reason, off, skip, skipReason, breaks } = {}) {
  if (action === 'run' || (action === 'open' && !attach)) {
    checkInput(input);
    if (flow && !listFlows().includes(flow)) throw new Error('flow không có');
    const plan = action === 'run'
      ? [...listFlag('--skip', stageList(skip)), ...(skipReason?.trim() ? ['--skip-reason', skipReason.trim()] : []), ...listFlag('--break', stageList(breaks))]
      : [];
    return [action, input, ...(flow ? ['--flow', flow] : []), ...plan];
  }
  if (!['approve', 'reject', 'pause', 'resume', 'abort', 'reviewed', 'open', 'retry', 'goto', 'skip', 'pick', 'break'].includes(action)) throw new Error(`action lạ: ${action}`);
  if (!KEY.test(key ?? '')) throw new Error('key không hợp lệ');
  const noteArgs = note?.trim() ? ['--note', note.trim()] : [];
  if (action === 'open') return ['open', key, '--attach'];
  if (action === 'reject' && !noteArgs.length) throw new Error('reject cần note');
  if (action === 'goto' || action === 'break') {
    if (!STAGE.test(stage ?? '')) throw new Error('stage không hợp lệ');
    if (action === 'goto' && !noteArgs.length) throw new Error('goto cần note');
    return action === 'goto' ? ['goto', key, stage, ...noteArgs] : ['break', key, stage, ...(off ? ['--off'] : [])];
  }
  if (action === 'pick') {
    if (!/^[ABC]$/.test(option ?? '')) throw new Error('option không hợp lệ');
    return ['pick', key, option, ...noteArgs];
  }
  if (action === 'skip') return ['skip', key, ...(reason?.trim() ? ['--reason', reason.trim()] : [])];
  return [action, key, ...noteArgs];
}

// CLI chạy tách nền nên lỗi sau spawn UI không thấy: soát trước, ném ⇒ server trả 400
export function checkAction(action, body = {}) {
  if (action === 'run') {
    const error = body.flow && checkRunPlan(loadFlow(body.flow), { disabled: body.skip, breakpoints: body.breaks, skipReason: body.skipReason });
    if (error) throw new Error(error);
    return;
  }
  if (!['retry', 'goto', 'skip', 'pick', 'break'].includes(action)) return;
  const run = loadRun(body.key);
  if (!run) throw new Error(`không có run ${body.key}`);
  const { stage, option, note, reason, off } = body;
  const breakUnchanged = action === 'break' && run.status !== 'done' && (run.plan?.breakpoints ?? []).includes(stage) === !off;
  if (breakUnchanged) return;
  chooseAction(run, loadFlow(run.flow), { type: action, stage, option, note, reason }, { options: planOptions(run), now: Date.now(), interrupted: isInterrupted(run) });
}

const TAIL_BYTES = 256 * 1024;
const MAX_LINES = 300;
const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function toolLabel({ name, input = {} }) {
  const arg = input.file_path ?? input.command ?? input.pattern ?? input.skill ?? input.description ?? '';
  return clip(`${name} ${arg}`.trim());
}

function eventLines(event) {
  if (event.type === 'system') return event.subtype === 'init' ? [{ kind: 'init', text: `phiên ${event.model ?? ''}`.trim() }] : [];
  if (event.type === 'result') return [{ kind: 'done', text: `xong · ${event.num_turns ?? 0} lượt · $${(event.total_cost_usd ?? 0).toFixed(2)}` }];
  return (event.message?.content ?? []).flatMap((part) => {
    if (part.type === 'text' && part.text.trim()) return [{ kind: 'text', text: clip(part.text.trim(), 600) }];
    if (part.type === 'tool_use') return [{ kind: 'tool', text: toolLabel(part) }];
    if (part.type === 'tool_result') {
      const body = Array.isArray(part.content) ? part.content.map((c) => c.text ?? '').join(' ') : String(part.content ?? '');
      return [{ kind: 'result', text: clip(body.replace(/\s+/g, ' ').trim()) }];
    }
    return [];
  });
}

export function liveLog(key, runId, name) {
  const logs = listArtifacts(key, runId).filter((f) => f.endsWith('.log') && (!name || f === name));
  if (!logs.length) return null;
  const dir = runDir(key, runId);
  const file = logs.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0];
  const full = path.join(dir, file);
  const { size, mtimeMs } = fs.statSync(full);
  const fd = fs.openSync(full, 'r');
  const buf = Buffer.alloc(Math.min(size, TAIL_BYTES));
  fs.readSync(fd, buf, 0, buf.length, size - buf.length);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n').flatMap((raw) => {
    try {
      return eventLines(JSON.parse(raw));
    } catch {
      return [];
    }
  });
  return { file, mtimeMs, lines: lines.slice(-MAX_LINES) };
}
