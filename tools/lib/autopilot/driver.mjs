import fs from 'node:fs';
import path from 'node:path';
import { nextAction, applyEvent, roundOf } from './engine.mjs';
import { parseVerdict } from './verdict.mjs';
import { renderPrompt } from './prompts.mjs';
import { PROMPTS_DIR } from './flows.mjs';
import { runDir, saveRun, loadRun, writeArtifact } from './store.mjs';
import { acquire, release, holdCampaign, heldCampaigns } from './lock.mjs';
import { runClaude as realRunClaude, guardCode } from './claude-runner.mjs';
import { runGates as realRunGates } from './gates.mjs';
import { notify as realNotify } from './notify.mjs';
import { addWorktree as realAddWorktree, toWorktree, isInWorktree, labWritesOn } from './worktree.mjs';

const UI_FILE = /\.(twig|html|scss|css)$/;
const CLI = 'node ~/VNG/agent-auto/tools/autopilot.mjs';

const readIfExists = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

const WHEN = {
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

function stageVars(run, stage, input) {
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
    sheetKind: run.sheetKind ?? '',
    round: String(roundOf(run, stage.id)),
    rejectNote: run.rejectNote ?? '',
    callerOfFix: run.callerOfFix ?? '',
    feedbackFile: feedbackFile(run),
  };
}

const receiptOf = (stage, v, res) => ({
  stage: stage.id, verdict: v.verdict, blocking: v.blocking.length, advisory: v.advisory.length,
  turns: res.turns, costUsd: res.costUsd, ms: res.ms,
});

async function runClaudeStage(run, stage, deps) {
  const round = roundOf(run, stage.id);
  const template = fs.readFileSync(path.join(PROMPTS_DIR, stage.prompt), 'utf8');
  const marker = `${run.key}/${run.runId}`;
  const opts = {
    stageId: stage.id, round, model: stage.model, toolset: stage.toolset, marker,
    prompt: renderPrompt(template, stageVars(run, stage, deps.input), marker),
    resumeSessionId: stage.resume ? run.sessions[stage.resume] : null,
    cwd: run.repo ? toWorktree(run.worktrees, run.repo) : deps.agentRoot,
    logFile: path.join(runDir(run.key, run.runId), `${stage.id}-r${round}.log`),
  };

  let res = await deps.runClaude(opts);
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

async function runGateStage(run, stage, deps) {
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

const commandFor = (stage, run) => (typeof stage.command === 'string' ? stage.command : stage.command[run.sheetKind ?? 'google']);

function announce(run, stage, deps) {
  const title = `Autopilot ${run.key}`;
  if (run.status === 'paused') deps.notify(title, `chờ bạn ở ${stage.id} — duyệt: ${CLI} approve ${run.key} · trả về: ${CLI} reject ${run.key} --note "…"`);
  if (run.status === 'attached') deps.notify(title, `chạy trong phiên Claude: ${commandFor(stage, run)} — xong thì: ${CLI} approve ${run.key}`);
  if (run.status === 'stopped') deps.notify(title, `dừng: ${run.stopReason} — xem: ${CLI} status ${run.key}`);
  if (run.status === 'done') deps.notify(title, 'xong — đã commit, push vẫn chờ bạn');
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
function isolate(run, deps) {
  const pending = (run.repos ?? [run.repo]).filter((r) => r && !isInWorktree(run.worktrees, toWorktree(run.worktrees, r)));
  if (!pending.length) return run;
  const worktrees = { ...run.worktrees };
  for (const repo of pending) {
    const { top, dir } = deps.addWorktree({ repo, parentDir: path.join(runDir(run.key, run.runId), 'wt'), branch: `autopilot/${run.key}-${run.runId}`, linkDirs: campaignsOf(run) });
    worktrees[top] = dir;
  }
  return { ...run, worktrees };
}

export async function drive(startRun, flow, overrides = {}) {
  const deps = {
    now: Date.now, runClaude: realRunClaude, runGates: realRunGates, notify: realNotify, repoOf: () => null, addWorktree: realAddWorktree,
    agentRoot: path.resolve(import.meta.dirname, '../../..'), ...overrides,
  };
  let run = { ...startRun };
  for (;;) {
    const action = nextAction(run, flow);
    if (action.type === 'attached' && action.stage.realWrite && !labWritesOn()) {
      run = applyEvent(run, flow, { type: 'skip' }, deps.now());
      continue;
    }
    if (!['claude', 'gate'].includes(action.type)) {
      saveRun(run);
      announce(run, action.stage, deps);
      return run;
    }
    const stage = action.stage;
    try {
      run = isolate(run, deps);
    } catch (e) {
      run = applyEvent(run, flow, { type: 'halt', reason: `worktree: ${e.message}` }, deps.now());
      continue;
    }
    const event = await runStage(run, stage, deps);
    const onDisk = loadRun(run.key, run.runId);
    if (onDisk?.stopReason === 'aborted') return onDisk;
    run = applyEvent(run, flow, event, deps.now());
    saveRun(run);
  }
}
