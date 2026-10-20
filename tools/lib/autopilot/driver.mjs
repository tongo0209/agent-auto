import fs from 'node:fs';
import path from 'node:path';
import { nextAction, applyEvent, roundOf, finalApproval } from './engine.mjs';
import { parseVerdict } from './verdict.mjs';
import { renderPrompt } from './prompts.mjs';
import { PROMPTS_DIR } from './flows.mjs';
import { runDir, saveRun, loadRun, writeArtifact, pauseFile, childFile } from './store.mjs';
import { acquire, release, holdCampaign, heldCampaigns } from './lock.mjs';
import { runClaude as realRunClaude, guardCode } from './claude-runner.mjs';
import { runGates as realRunGates } from './gates.mjs';
import { notify as realNotify } from './notify.mjs';
import { addWorktree as realAddWorktree, toWorktree, isInWorktree, labWritesOn, branchOf } from './worktree.mjs';
import { runChanges } from './review.mjs';

const UI_FILE = /\.(twig|html|scss|css)$/;
const CLI = 'node ~/VNG/agent-auto/tools/autopilot.mjs';

const readIfExists = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

export const WHEN = {
  touchesUi: (run) => (run.files ?? []).some((f) => UI_FILE.test(f)),
  touchesPm: (run) => (run.files ?? []).some((f) => UI_FILE.test(f) && readIfExists(path.join(toWorktree(run.worktrees, run.repo), f)).includes('pm__')),
  hasHandoff: (run) => Boolean(run.handoffDir),
};

function planTitle(run) {
  const plan = path.join(runDir(run.key, run.runId), 'plan.md');
  const heading = fs.existsSync(plan) ? fs.readFileSync(plan, 'utf8').match(/^# (.+)$/m)?.[1] : null;
  return heading ?? `${run.key} autopilot ${run.flow}`;
}

function feedbackFile(run) {
  const caller = run.callerOfFix;
  if (!caller) return '';
  const file = path.join(runDir(run.key, run.runId), `${caller}-r${roundOf(run, caller) - 1}.json`);
  return fs.existsSync(file) ? file : '';
}

const campaignsOf = (run) => (run.campaignDirs?.length ? run.campaignDirs : [run.campaignDir].filter(Boolean));

export function stageVars(run, stage, input) {
  const wt = (p) => toWorktree(run.worktrees, p) ?? '';
  return {
    KEY: run.key,
    flow: run.flow,
    input: input ?? run.key,
    runDir: runDir(run.key, run.runId),
    repo: wt(run.repo),
    campaignDir: wt(run.campaignDir),
    handoffDir: wt(run.handoffDir),
    campaignDirs: campaignsOf(run).map(wt).join('\n'),
    cloneSource: wt(run.cloneSource),
    sheetUrl: run.sheetUrl ?? '',
    sheetKind: run.sheetKind ?? '',
    round: String(roundOf(run, stage.id)),
    rejectNote: run.rejectNote ?? '',
    callerOfFix: run.callerOfFix ?? '',
    feedbackFile: feedbackFile(run),
    choice: run.choice ? `${run.choice.id} · ${run.choice.title}${run.choice.note ? `\n${run.choice.note}` : ''}` : '',
  };
}

const receiptOf = (stage, v, res) => ({
  stage: stage.id, verdict: v.verdict, blocking: v.blocking.length, advisory: v.advisory.length,
  turns: res.turns, costUsd: res.costUsd, tokens: res.tokens ?? 0, ms: res.ms,
});

const isAbortedOnDisk = (run) => {
  const onDisk = loadRun(run.key, run.runId);
  return !onDisk || onDisk.stopReason === 'aborted';
};
const stopRequested = (run) => fs.existsSync(pauseFile(run.key, run.runId)) || isAbortedOnDisk(run);

function continuePrompt(run, marker) {
  const note = run.resumeNote ? `\nNgười dùng nhắn khi dừng: ${run.resumeNote}\n` : '';
  return `AUTOPILOT_RUN: ${marker}\nBước này bị dừng giữa chừng theo lệnh người dùng. Làm tiếp từ chỗ dở (kiểm lại file đang sửa dở trong worktree), rồi trả verdict như yêu cầu ban đầu.${note}`;
}

async function runClaudeStage(run, stage, deps) {
  const round = roundOf(run, stage.id);
  const template = fs.readFileSync(path.join(PROMPTS_DIR, stage.prompt), 'utf8');
  const marker = `${run.key}/${run.runId}`;
  const cut = run.cutSession?.stage === stage.id ? run.cutSession : null;
  const opts = {
    stageId: stage.id, round, model: stage.model, toolset: stage.toolset, marker,
    prompt: cut ? continuePrompt(run, marker) : renderPrompt(template, stageVars(run, stage, deps.input), marker),
    resumeSessionId: cut ? cut.sessionId : stage.resume ? run.sessions[stage.resume] : null,
    cwd: run.repo ? toWorktree(run.worktrees, run.repo) : deps.agentRoot,
    logFile: path.join(runDir(run.key, run.runId), `${stage.id}-r${round}${cut ? '-tiep' : ''}.log`),
    childFile: childFile(run.key, run.runId),
  };

  let res = await deps.runClaude(opts);
  if (stopRequested(run)) return { type: 'halt', reason: 'paused', cutSession: { stage: stage.id, sessionId: res.sessionId ?? cut?.sessionId ?? null } };
  if (!res.ok) res = await deps.runClaude(opts);
  const v = parseVerdict(res.result);
  writeArtifact(run, `${stage.id}-r${round}.json`, v);
  const receipt = receiptOf(stage, v, res);

  const guard = v.malformed ? guardCode(`${res.result}\n${res.error ?? ''}`) : null;
  if (guard) return { type: 'halt', reason: `guard:${guard}`, receipt };
  if (!res.ok) return { type: 'halt', reason: `runner:${stage.id}`, receipt };

  if (v.campaignDir && !run.campaignDir) {
    const holder = heldCampaigns()[v.campaignDir];
    if (holder && holder.key !== run.key) return { type: 'halt', reason: `campaign-held:${holder.key}/${holder.runId}`, receipt };
    holdCampaign(v.campaignDir, { key: run.key, runId: run.runId });
    run.campaignDir = v.campaignDir;
    run.campaignDirs = [v.campaignDir];
    run.repo = deps.repoOf(v.campaignDir);
    run.repos = [...new Set([...(run.repos ?? []), run.repo].filter(Boolean))];
  }
  run.files = [...new Set([...(run.files ?? []), ...v.files])];
  return { type: v.verdict, receipt, sessionId: res.sessionId };
}

const repoFor = (run, dir) => (run.repos ?? []).find((r) => dir.startsWith(`${r}${path.sep}`)) ?? run.repo;

function gateTargets(run, stage) {
  if (stage.scope === 'handoff') return [run.handoffDir];
  if (stage.checks.includes('commit')) return [...campaignsOf(run), run.handoffDir].filter(Boolean);
  return run.campaignDir ? campaignsOf(run) : [null];
}

async function gatesOn(run, stage, deps, dir) {
  const repo = toWorktree(run.worktrees, dir ? repoFor(run, dir) : run.repo);
  return deps.runGates(stage.checks, {
    repo, campaignDir: toWorktree(run.worktrees, dir), isolated: isInWorktree(run.worktrees, repo),
    key: run.key, flowId: run.flow, files: run.files ?? [], planTitle: planTitle(run),
  });
}

export async function runGateStage(run, stage, deps) {
  const round = roundOf(run, stage.id);
  const started = deps.now();
  const parts = [];
  for (const dir of gateTargets(run, stage)) {
    parts.push(await gatesOn(run, stage, deps, dir));
    if (parts.at(-1).error) break;
  }
  const result = { pass: parts.every((p) => p.pass), error: parts.find((p) => p.error)?.error ?? null, results: parts.flatMap((p) => p.results) };
  writeArtifact(run, `${stage.id}-r${round}.json`, result);
  const failed = result.results.filter((r) => r.status === 'fail');
  const receipt = {
    stage: stage.id, verdict: result.pass ? 'pass' : 'revise', turns: 0, costUsd: 0, ms: deps.now() - started,
    blocking: failed.reduce((n, r) => n + r.blocking.length, 0), advisory: 0,
  };
  if (result.error) return { type: 'halt', reason: `gate-error:${result.error}`, receipt };
  return { type: result.pass ? 'pass' : 'revise', receipt };
}

export const commandFor = (stage, run) => (typeof stage.command === 'string' ? stage.command : stage.command[run.sheetKind ?? 'google']);

function announce(run, stage, deps) {
  const title = `Autopilot ${run.key}`;
  if (run.status === 'paused') deps.notify(title, `chờ bạn ở ${stage.id} — duyệt: ${CLI} approve ${run.key} · trả về: ${CLI} reject ${run.key} --note "…"`);
  if (run.status === 'attached') deps.notify(title, `chạy trong phiên Claude: ${commandFor(stage, run)} — xong thì: ${CLI} approve ${run.key}`);
  if (run.status === 'stopped') deps.notify(title, `dừng: ${run.stopReason} — xem: ${CLI} status ${run.key}`);
  if (run.status === 'done') deps.notify(title, `xong, chờ review · ${changedSummary(run)} — push vẫn chờ bạn`);
}

function changedSummary(run) {
  const touched = runChanges(run).filter((c) => c.files.length);
  if (!touched.length) return 'không có file nào đổi';
  const fileCount = touched.reduce((n, c) => n + c.files.length, 0);
  return `${fileCount} file ở ${touched.map((c) => c.name).join(', ')}`;
}

async function withStageLock(run, stage, fn) {
  if (!stage.lock) return fn();
  const owner = { key: run.key, runId: run.runId };
  const got = acquire(stage.lock, owner);
  if (!got.ok) return { type: 'halt', reason: `lock:${stage.lock} đang bị ${got.holder.key} giữ` };
  try {
    return await fn();
  } finally {
    release(stage.lock, owner);
  }
}

async function runStage(run, stage, deps) {
  if (stage.when && !WHEN[stage.when](run)) return { type: 'skip' };
  try {
    return await withStageLock(run, stage, () => (stage.kind === 'claude' ? runClaudeStage(run, stage, deps) : runGateStage(run, stage, deps)));
  } catch (e) {
    return { type: 'halt', reason: `crash:${stage.id}: ${e.message}` };
  }
}

// Stage sửa code chỉ được chạy trong worktree riêng: tạo không được thì dừng, không lùi về repo thật
export function isolate(run, deps) {
  const pending = (run.repos ?? [run.repo]).filter((r) => r && !isInWorktree(run.worktrees, toWorktree(run.worktrees, r)));
  if (!pending.length) return run;
  const worktrees = { ...run.worktrees };
  const bases = { ...run.bases };
  for (const repo of pending) {
    const { top, dir, base } = deps.addWorktree({ repo, parentDir: path.join(runDir(run.key, run.runId), 'wt'), branch: branchOf(run), linkDirs: campaignsOf(run) });
    worktrees[top] = dir;
    bases[top] = base;
  }
  return { ...run, worktrees, bases };
}

// break ghi run.json không qua lock; plan trên đĩa thắng bản trong bộ nhớ để lần saveRun sau không xoá nó
const withPlanOnDisk = (run) => ({ ...run, plan: loadRun(run.key, run.runId)?.plan ?? run.plan });

export async function drive(startRun, flow, overrides = {}) {
  const deps = {
    now: Date.now, runClaude: realRunClaude, runGates: realRunGates, notify: realNotify, repoOf: () => null, addWorktree: realAddWorktree,
    agentRoot: path.resolve(import.meta.dirname, '../../..'), ...overrides,
  };
  let run = { ...startRun };
  for (;;) {
    run = withPlanOnDisk(run);
    const action = nextAction(run, flow);
    if (action.type === 'attached' && action.stage.realWrite && !labWritesOn()) {
      run = applyEvent(run, flow, { type: 'skip' }, deps.now());
      continue;
    }
    // Run trả về sau review: user xem lại ở "Chờ review" sau commit, không dừng duyệt kết quả lần nữa
    if (run.reopenedAt && action.stage === finalApproval(flow)) {
      run = applyEvent(run, flow, { type: 'approve' }, deps.now());
      continue;
    }
    if (!['claude', 'gate'].includes(action.type)) {
      saveRun(run);
      announce(run, action.stage, deps);
      return run;
    }
    if (fs.existsSync(pauseFile(run.key, run.runId))) {
      fs.rmSync(pauseFile(run.key, run.runId));
      run = applyEvent(run, flow, { type: 'halt', reason: 'paused' }, deps.now());
      continue;
    }
    const stage = action.stage;
    if ((run.plan?.disabled ?? []).includes(stage.id)) {
      const reason = run.plan.skipReason ?? 'tắt từ đầu';
      const receipt = { stage: stage.id, verdict: 'skipped-by-user', note: reason, blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 0 };
      run = applyEvent(run, flow, { type: 'skip', by: 'user', reason, receipt }, deps.now());
      saveRun(run);
      continue;
    }
    try {
      run = isolate(run, deps);
    } catch (e) {
      run = applyEvent(run, flow, { type: 'halt', reason: `worktree: ${e.message}` }, deps.now());
      continue;
    }
    saveRun(run);
    const event = await runStage(run, stage, deps);
    if (isAbortedOnDisk(run)) return { ...run, status: 'stopped', stopReason: 'aborted' };
    if (event.cutSession) fs.rmSync(pauseFile(run.key, run.runId), { force: true });
    const { cutSession, resumeNote, ...rest } = run;
    run = applyEvent(event.cutSession ? { ...rest, cutSession: event.cutSession } : rest, flow, event, deps.now());
    run = withPlanOnDisk(run);
    if (['pass', 'skip'].includes(event.type) && run.status === 'running' && (run.plan?.breakpoints ?? []).includes(stage.id)) {
      run = applyEvent(run, flow, { type: 'halt', reason: `breakpoint:${stage.id}` }, deps.now());
    }
    saveRun(run);
  }
}
