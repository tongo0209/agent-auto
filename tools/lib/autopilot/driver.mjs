import fs from 'node:fs';
import path from 'node:path';
import { nextAction, applyEvent, roundOf, finalApproval } from './engine.mjs';
import { parseVerdict } from './verdict.mjs';
import { renderPrompt } from './prompts.mjs';
import { PROMPTS_DIR } from './flows.mjs';
import { dataRoot, runDir, saveRun, loadRun, writeArtifact, pauseFile, childFile } from './store.mjs';
import { release, claimCampaign, holdRepo, releaseRepos, waitLock } from './lock.mjs';
import { runClaude as realRunClaude, guardCode } from './claude-runner.mjs';
import { runGates as realRunGates } from './gates.mjs';
import { notify as realNotify } from './notify.mjs';
import { repoState as realRepoState, toWorktree, labWritesOn } from './worktree.mjs';
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

// Stage ghi code trong repo của run + báo cáo vào thư mục run; phần còn lại của agent-auto-lab chỉ đọc
export const writableOf = (run) => [...Object.keys(run.workBranch ?? {}), runDir(run.key, run.runId), path.join(dataRoot(), 'designs', run.key)];

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
    jiraUpdate: run.jiraUpdate ? JSON.stringify(run.jiraUpdate, null, 2) : '',
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

function continuePrompt(marker, why, note) {
  const said = note ? `\nNgười dùng nhắn khi dừng: ${note}\n` : '';
  return `AUTOPILOT_RUN: ${marker}\nBước này bị dừng giữa chừng ${why}. Làm tiếp từ chỗ dở (kiểm lại file đang sửa dở trong repo), rồi trả verdict như yêu cầu ban đầu.${said}`;
}

// Lượt bị cắt (hết giờ, sập) đã có phiên thì resume phiên đó — mở phiên mới là mất sạch context đã đọc
function retryOpts(opts, failed, marker) {
  const logFile = opts.logFile.replace(/\.log$/, '-lai.log');
  if (!failed.sessionId) return { ...opts, logFile };
  return { ...opts, logFile, resumeSessionId: failed.sessionId, prompt: continuePrompt(marker, `vì ${failed.error ?? 'runner lỗi'}`) };
}

async function runClaudeStage(run, stage, deps) {
  const round = roundOf(run, stage.id);
  const template = fs.readFileSync(path.join(PROMPTS_DIR, stage.prompt), 'utf8');
  const marker = `${run.key}/${run.runId}`;
  const cut = run.cutSession?.stage === stage.id ? run.cutSession : null;
  const opts = {
    stageId: stage.id, round, model: stage.model, toolset: stage.toolset, marker,
    prompt: cut ? continuePrompt(marker, 'theo lệnh người dùng', run.resumeNote) : renderPrompt(template, stageVars(run, stage, deps.input), marker),
    resumeSessionId: cut ? cut.sessionId : stage.resume ? run.sessions[stage.resume] : null,
    cwd: run.repo ? toWorktree(run.worktrees, run.repo) : deps.agentRoot,
    writable: writableOf(run),
    logFile: path.join(runDir(run.key, run.runId), `${stage.id}-r${round}${cut ? '-tiep' : ''}.log`),
    childFile: childFile(run.key, run.runId),
    timeoutMs: stage.timeoutMinutes ? stage.timeoutMinutes * 60_000 : undefined,
  };

  let res = await deps.runClaude(opts);
  if (stopRequested(run)) return { type: 'halt', reason: 'paused', cutSession: { stage: stage.id, sessionId: res.sessionId ?? cut?.sessionId ?? null } };
  if (!res.ok) res = await deps.runClaude(retryOpts(opts, res, marker));
  const v = parseVerdict(res.result);
  writeArtifact(run, `${stage.id}-r${round}.json`, v);
  const receipt = receiptOf(stage, v, res);

  const guard = v.malformed ? guardCode(`${res.result}\n${res.error ?? ''}`) : null;
  if (guard) return { type: 'halt', reason: `guard:${guard}`, receipt };
  if (!res.ok) return { type: 'halt', reason: `runner:${stage.id}`, receipt };

  if (v.campaignDir && !run.campaignDir) {
    const held = claimCampaign(v.campaignDir, run);
    if (!held.ok) return { type: 'halt', reason: `campaign-held:${held.holder.key}/${held.holder.runId}`, receipt };
    run.campaignDir = v.campaignDir;
    run.campaignDirs = [v.campaignDir];
    run.repo = deps.repoOf(v.campaignDir);
    run.repos = [...new Set([...(run.repos ?? []), run.repo].filter(Boolean))];
  }
  run.files = [...new Set([...(run.files ?? []), ...v.files])];
  return { type: v.verdict, receipt, sessionId: res.sessionId };
}

const repoFor = (run, dir) => (run.repos ?? []).find((r) => dir.startsWith(`${r}${path.sep}`)) ?? run.repo;

// Mỗi phần tử là nhóm thư mục chạy chung 1 lượt gate; cổng commit gom theo repo để 1 commit/repo phủ mọi campaign
function gateTargets(run, stage) {
  if (stage.scope === 'handoff') return [[run.handoffDir]];
  if (stage.checks.includes('commit')) return Object.values(Object.groupBy([...campaignsOf(run), run.handoffDir].filter(Boolean), (dir) => repoFor(run, dir)));
  return (run.campaignDir ? campaignsOf(run) : [null]).map((dir) => [dir]);
}

async function gatesOn(run, stage, deps, [dir, ...rest]) {
  const real = dir ? repoFor(run, dir) : run.repo;
  const repo = toWorktree(run.worktrees, real);
  const result = await deps.runGates(stage.checks, {
    repo, campaignDir: toWorktree(run.worktrees, dir), scopes: [dir, ...rest].map((d) => toWorktree(run.worktrees, d)), dirty: run.dirtyAtStart?.[real] ?? [],
    key: run.key, flowId: run.flow, files: run.files ?? [], planTitle: planTitle(run), aborted: () => isAbortedOnDisk(run),
  });
  return { ...result, repo };
}

export async function runGateStage(run, stage, deps) {
  const round = roundOf(run, stage.id);
  const started = deps.now();
  const parts = [];
  const targets = gateTargets(run, stage);
  for (const dirs of targets) {
    parts.push(await gatesOn(run, stage, deps, dirs));
    if (parts.at(-1).error) break;
  }
  const result = { pass: parts.every((p) => p.pass), error: parts.find((p) => p.error)?.error ?? null, results: parts.flatMap((p) => p.results) };
  writeArtifact(run, `${stage.id}-r${round}.json`, result);
  const commits = parts.flatMap((p) => p.results.filter((r) => r.commit).map((r) => ({ repo: p.repo, sha: r.commit })));
  if (commits.length) run.commits = [...(run.commits ?? []), ...commits];
  const commitResults = result.results.filter((r) => r.check === 'commit');
  if (commitResults.length) run.pullPending = commitResults.some((r) => r.pullPending);
  // mọi repo đã commit, chỉ còn chờ pull (mất mạng/VPN) → nhả repo để task khác chạy; retry sẽ giữ lại
  if (run.pullPending && parts.length === targets.length && commitResults.every((r) => r.status === 'pass' || (r.pullPending && !r.midMerge))) releaseRepos(run);
  const failed = result.results.filter((r) => r.status === 'fail');
  const receipt = {
    stage: stage.id, verdict: result.pass ? 'pass' : 'revise', turns: 0, costUsd: 0, ms: deps.now() - started,
    blocking: failed.reduce((n, r) => n + r.blocking.length, 0), advisory: 0,
  };
  const errorNote = result.results.find((r) => r.status === 'error')?.note;
  if (result.error) return { type: 'halt', reason: `gate-error:${result.error}${errorNote ? ` — ${errorNote}` : ''}`, receipt };
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

// Tài nguyên chỉ 1 run dùng được tại 1 thời điểm: cổng commit (build + add/commit + pull trên cây chung),
// trình duyệt của browserpilot, Photoshop. Run song song chờ tới lượt, không dừng nhau
const stageLockOf = (stage) => stage.lock ?? (stage.checks?.includes('commit') ? 'commit' : stage.toolset === 'browser' ? 'browser' : null);

async function withStageLock(run, stage, fn) {
  const name = stageLockOf(stage);
  if (!name) return fn();
  const owner = { key: run.key, runId: run.runId };
  if (!(await waitLock(name, owner, { isAborted: () => isAbortedOnDisk(run) }))) return { type: 'halt', reason: 'aborted' };
  try {
    return await fn();
  } finally {
    release(name, owner);
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

// Run làm thẳng trên repo gốc: run đã có campaign chung repo với run khác, chưa có thì giữ riêng; nhánh chốt lúc bắt đầu
export function claimRepos(run, deps) {
  if (Object.keys(run.worktrees ?? {}).length) return run;
  const next = { ...run, workBranch: { ...run.workBranch }, startHead: { ...run.startHead }, dirtyAtStart: { ...run.dirtyAtStart } };
  for (const repo of (run.repos ?? [run.repo]).filter(Boolean)) {
    const { top, branch, head, dirty } = deps.repoState(repo);
    const held = holdRepo(top, run, { shared: campaignsOf(run).length > 0 });
    if (!held.ok) throw new Error(`repo đang có run ${held.holder.key} (${top})`);
    const want = next.workBranch[top];
    if (!want) {
      next.workBranch[top] = branch;
      next.startHead[top] = head;
      next.dirtyAtStart[top] = dirty;
    } else if (want !== branch) {
      throw new Error(`${top} đang ở nhánh ${branch}, run làm trên ${want} — checkout lại ${want} rồi resume`);
    }
  }
  return next;
}

// break chỉ ghi breakpoints vào run.json không qua lock; breakpoints trên đĩa thắng để lần saveRun sau không xoá nó
const withPlanOnDisk = (run) => {
  const onDisk = loadRun(run.key, run.runId)?.plan;
  return onDisk ? { ...run, plan: { ...onDisk, ...run.plan, breakpoints: onDisk.breakpoints } } : run;
};

export async function drive(startRun, flow, overrides = {}) {
  const deps = {
    now: Date.now, runClaude: realRunClaude, runGates: realRunGates, notify: realNotify, repoOf: () => null, repoState: realRepoState,
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
      // run đã dừng chờ user — yêu cầu pause đến muộn coi như đã đáp, không để treo sang lần drive sau
      fs.rmSync(pauseFile(run.key, run.runId), { force: true });
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
    if ((run.plan?.disabled ?? []).includes(stage.id) && (!stage.when || WHEN[stage.when](run))) {
      const reason = run.plan.skipReason ?? 'tắt từ đầu';
      const receipt = { stage: stage.id, verdict: 'skipped-by-user', note: reason, blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 0 };
      run = applyEvent(run, flow, { type: 'skip', by: 'user', reason, receipt }, deps.now());
      saveRun(run);
      continue;
    }
    const savedBeforeClaim = Boolean(loadRun(run.key, run.runId));
    try {
      run = claimRepos(run, deps);
    } catch (e) {
      run = applyEvent(run, flow, { type: 'halt', reason: `repo: ${e.message}` }, deps.now());
      continue;
    }
    // claimRepos chạy git status vài giây — abort rơi vào khoảng đó thì không được ghi đè run.json
    if (savedBeforeClaim && isAbortedOnDisk(run)) {
      releaseRepos(run);
      return { ...run, status: 'stopped', stopReason: 'aborted' };
    }
    saveRun(run);
    const event = await runStage(run, stage, deps);
    if (isAbortedOnDisk(run)) return { ...run, status: 'stopped', stopReason: 'aborted' };
    if (event.cutSession) fs.rmSync(pauseFile(run.key, run.runId), { force: true });
    const { cutSession, resumeNote, ...rest } = run;
    // Note của user chỉ dành cho stage claude đầu tiên chạy sau khi quay lại
    if (stage.kind === 'claude' && event.receipt) rest.rejectNote = null;
    run = applyEvent(event.cutSession ? { ...rest, cutSession: event.cutSession } : rest, flow, event, deps.now());
    run = withPlanOnDisk(run);
    if (['pass', 'skip'].includes(event.type) && run.status === 'running' && (run.plan?.breakpoints ?? []).includes(stage.id)) {
      run = applyEvent(run, flow, { type: 'halt', reason: `breakpoint:${stage.id}` }, deps.now());
    }
    saveRun(run);
  }
}
