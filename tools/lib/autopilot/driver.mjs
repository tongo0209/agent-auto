import fs from 'node:fs';
import path from 'node:path';
import { nextAction, applyEvent, roundOf } from './engine.mjs';
import { parseVerdict } from './verdict.mjs';
import { renderPrompt } from './prompts.mjs';
import { PROMPTS_DIR } from './flows.mjs';
import { runDir, saveRun, writeArtifact } from './store.mjs';
import { acquire, release } from './lock.mjs';
import { runClaude as realRunClaude, guardCode } from './claude-runner.mjs';
import { runGates as realRunGates } from './gates.mjs';
import { notify as realNotify } from './notify.mjs';

const UI_FILE = /\.(twig|html|scss|css)$/;
const CLI = 'node ~/VNG/agent-auto/tools/autopilot.mjs';

const WHEN = {
  touchesUi: (run) => (run.files ?? []).some((f) => UI_FILE.test(f)),
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

function stageVars(run, stage, input) {
  return {
    KEY: run.key,
    flow: run.flow,
    input: input ?? run.key,
    runDir: runDir(run.key, run.runId),
    repo: run.repo ?? '',
    campaignDir: run.campaignDir ?? '',
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
    cwd: run.repo || deps.agentRoot,
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
    run.campaignDir = v.campaignDir;
    run.repo = deps.repoOf(v.campaignDir);
  }
  run.files = [...new Set([...(run.files ?? []), ...v.files])];
  return { type: v.verdict, receipt, sessionId: res.sessionId };
}

async function runGateStage(run, stage, deps) {
  const round = roundOf(run, stage.id);
  const started = deps.now();
  const result = await deps.runGates(stage.checks, {
    repo: run.repo, campaignDir: run.campaignDir, key: run.key, flowId: run.flow, files: run.files ?? [], planTitle: planTitle(run),
  });
  writeArtifact(run, `${stage.id}-r${round}.json`, result);
  const failed = result.results.filter((r) => r.status === 'fail');
  const receipt = {
    stage: stage.id, verdict: result.pass ? 'pass' : 'revise', turns: 0, costUsd: 0, ms: deps.now() - started,
    blocking: failed.reduce((n, r) => n + r.blocking.length, 0), advisory: 0,
  };
  if (result.error) return { type: 'halt', reason: `gate-error:${result.error}`, receipt };
  return { type: result.pass ? 'pass' : 'revise', receipt };
}

function announce(run, stage, deps) {
  const title = `Autopilot ${run.key}`;
  if (run.status === 'paused') deps.notify(title, `chờ bạn ở ${stage.id} — duyệt: ${CLI} approve ${run.key} · trả về: ${CLI} reject ${run.key} --note "…"`);
  if (run.status === 'attached') deps.notify(title, `chạy trong phiên Claude: ${stage.command} — xong thì: ${CLI} approve ${run.key}`);
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

export async function drive(startRun, flow, overrides = {}) {
  const deps = {
    now: Date.now, runClaude: realRunClaude, runGates: realRunGates, notify: realNotify, repoOf: () => null,
    agentRoot: path.resolve(import.meta.dirname, '../../..'), ...overrides,
  };
  let run = { ...startRun };
  for (;;) {
    const action = nextAction(run, flow);
    if (!['claude', 'gate'].includes(action.type)) {
      saveRun(run);
      announce(run, action.stage, deps);
      return run;
    }
    const stage = action.stage;
    const skip = stage.when && !WHEN[stage.when](run);
    const event = skip
      ? { type: 'skip' }
      : await withStageLock(run, stage, () => (stage.kind === 'claude' ? runClaudeStage(run, stage, deps) : runGateStage(run, stage, deps)));
    run = applyEvent(run, flow, event, deps.now());
    saveRun(run);
  }
}
