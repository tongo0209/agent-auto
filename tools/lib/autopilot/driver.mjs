import fs from 'node:fs';
import path from 'node:path';
import { nextAction, applyEvent, roundOf, finalApproval, stageOf, membersOf, positionOf, withGateSkipped } from './engine.mjs';
import { parseVerdict } from './verdict.mjs';
import { missingEvidence } from './evidence.mjs';
import { renderPrompt } from './prompts.mjs';
import { promptOfRun } from './flows.mjs';
import { dataRoot, runDir, saveRun, loadRun, writeArtifact, pauseFile, childFile } from './store.mjs';
import { release, claimCampaign, holdRepo, releaseRepos, waitLock } from './lock.mjs';
import { runClaude as realRunClaude, guardCode } from './claude-runner.mjs';
import { runGates as realRunGates } from './gates.mjs';
import { notify as realNotify } from './notify.mjs';
import { repoState as realRepoState, toWorktree, labWritesOn } from './worktree.mjs';
import { runChanges } from './review.mjs';

const UI_FILE = /\.(twig|html|scss|css)$/;
const CLI = 'node ~/VNG/agent-auto/tools/autopilot.mjs';
// Trần agent chạy cùng lúc trong 1 task (luật user), tính cả lane section lẫn agent kiểm
const MAX_AGENTS = 5;
const SECTION_ROUNDS = 3;
const SECTION_PORT = 8830;
const PASSING = ['pass', 'skip'];

const readIfExists = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

// plan ghi sections.json khi chia được landing thành các section sửa file riêng
const sectionsOf = (run) => JSON.parse(readIfExists(path.join(runDir(run.key, run.runId), 'sections.json')) || '{}').sections ?? [];

function hasDisjointSections(run) {
  const sections = sectionsOf(run);
  const files = sections.flatMap((s) => s.files ?? []);
  return sections.length >= 2 && sections.every((s) => s.files?.length) && new Set(files).size === files.length;
}

export const WHEN = {
  touchesUi: (run) => (run.files ?? []).some((f) => UI_FILE.test(f)),
  touchesPm: (run) => (run.files ?? []).some((f) => UI_FILE.test(f) && readIfExists(path.join(toWorktree(run.worktrees, run.repo), f)).includes('pm__')),
  hasHandoff: (run) => Boolean(run.handoffDir),
  hasDesign: (run) => WHEN.touchesUi(run) && hasDesignImage(path.join(dataRoot(), 'designs', run.key)),
  multiSection: hasDisjointSections,
  singleSection: (run) => !hasDisjointSections(run),
};

function hasDesignImage(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir, { recursive: true }).some((f) => /\.(png|jpe?g)$/i.test(f));
}

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
    sections: sectionsOf(run).map((s) => `- ${s.id}: ${(s.files ?? []).join(', ')}`).join('\n'),
  };
}

const iso = (ms) => new Date(ms).toISOString();
const timing = (started, ended) => ({ startedAt: iso(started), endedAt: iso(ended), durationMs: ended - started });

// Lượt pause cắt ngang nhiều nhánh song song thì cutSession là mảng, mỗi nhánh 1 phiên
const cutOf = (run, stageId) => [run.cutSession ?? []].flat().find((c) => c.stage === stageId) ?? null;

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

const readLogs = (files) => files.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8'));

function evidencePrompt(marker, missing) {
  return `AUTOPILOT_RUN: ${marker}\nVerdict pass của bước này chưa có bằng chứng đã NHÌN:\n- ${missing.join('\n- ')}\nMở từng ảnh ghép bằng Read, soát lại checklist trên từng ảnh, rồi trả lại khối autopilot-verdict với evidence = đường dẫn tuyệt đối các ảnh đã mở.`;
}

async function runClaudeStage(run, stage, deps, vars = {}) {
  const started = deps.now();
  const round = roundOf(run, stage.id);
  const template = promptOfRun(run, stage.prompt);
  const marker = `${run.key}/${run.runId}`;
  const cut = cutOf(run, stage.id);
  const opts = {
    stageId: stage.id, round, model: stage.model, toolset: stage.toolset, marker,
    prompt: cut ? continuePrompt(marker, 'theo lệnh người dùng', run.resumeNote) : renderPrompt(template, { ...stageVars(run, stage, deps.input), ...vars }, marker),
    resumeSessionId: cut ? cut.sessionId : stage.resume ? run.sessions[stage.resume] : null,
    cwd: run.repo ? toWorktree(run.worktrees, run.repo) : deps.agentRoot,
    writable: writableOf(run),
    logFile: path.join(runDir(run.key, run.runId), `${stage.id}-r${round}${cut ? '-tiep' : ''}.log`),
    childFile: childFile(run.key, run.runId, stage.id),
    timeoutMs: stage.timeoutMinutes ? stage.timeoutMinutes * 60_000 : undefined,
  };

  let res = await deps.runClaude(opts);
  if (stopRequested(run)) return { type: 'halt', reason: 'paused', cutSession: { stage: stage.id, sessionId: res.sessionId ?? cut?.sessionId ?? null } };
  if (!res.ok) res = await deps.runClaude(retryOpts(opts, res, marker));
  let v = parseVerdict(res.result);

  const logs = [opts.logFile, retryOpts(opts, res, marker).logFile];
  const unproven = () => (stage.requireEvidence && v.verdict === 'pass' ? missingEvidence(v.evidence, readLogs(logs)) : []);
  let missing = res.ok ? unproven() : [];
  if (missing.length) {
    const ask = { ...opts, logFile: opts.logFile.replace(/\.log$/, '-bangchung.log'), resumeSessionId: res.sessionId, prompt: evidencePrompt(marker, missing) };
    logs.push(ask.logFile);
    res = await deps.runClaude(ask);
    v = parseVerdict(res.result);
    missing = unproven();
  }
  const times = timing(started, deps.now());
  writeArtifact(run, `${stage.id}-r${round}.json`, { ...v, ...(missing.length && { missingEvidence: missing }), ...times });
  const receipt = { ...receiptOf(stage, v, res), ...times };

  const guard = v.malformed ? guardCode(`${res.result}\n${res.error ?? ''}`) : null;
  if (guard) return { type: 'halt', reason: `guard:${guard}`, receipt };
  if (!res.ok) return { type: 'halt', reason: `runner:${stage.id}`, receipt };
  if (missing.length) return { type: 'halt', reason: `evidence:${stage.id}`, receipt };

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
    repo, campaignDir: toWorktree(run.worktrees, dir), scopes: [dir, ...rest].map((d) => toWorktree(run.worktrees, d)),
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
  const times = timing(started, deps.now());
  writeArtifact(run, `${stage.id}-r${round}.json`, { ...result, ...times });
  const commits = parts.flatMap((p) => p.results.filter((r) => r.commit).map((r) => ({ repo: p.repo, sha: r.commit })));
  if (commits.length) run.commits = [...(run.commits ?? []), ...commits];
  const commitResults = result.results.filter((r) => r.check === 'commit');
  if (commitResults.length) run.pullPending = commitResults.some((r) => r.pullPending);
  // mọi repo đã commit, chỉ còn chờ pull (mất mạng/VPN) → nhả repo để task khác chạy; retry sẽ giữ lại
  if (run.pullPending && parts.length === targets.length && commitResults.every((r) => r.status === 'pass' || (r.pullPending && !r.midMerge))) releaseRepos(run);
  const failed = result.results.filter((r) => r.status === 'fail');
  const receipt = {
    stage: stage.id, verdict: result.pass ? 'pass' : 'revise', turns: 0, costUsd: 0, ms: times.durationMs,
    blocking: failed.reduce((n, r) => n + r.blocking.length, 0), advisory: 0, ...times,
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

// Nhánh song song của cùng run dùng chung lock run đó đang giữ: lock chặn run khác, không chặn nhánh anh em
const heldHere = new Map();

async function withStageLock(run, stage, fn) {
  const name = stageLockOf(stage);
  if (!name) return fn();
  const owner = { key: run.key, runId: run.runId };
  const slot = `${name}:${owner.key}/${owner.runId}`;
  const held = heldHere.get(slot) ?? { users: 0, ready: waitLock(name, owner, { isAborted: () => isAbortedOnDisk(run) }) };
  heldHere.set(slot, held);
  held.users++;
  try {
    if (!(await held.ready)) return { type: 'halt', reason: 'aborted' };
    return await fn();
  } finally {
    held.users--;
    if (!held.users) {
      heldHere.delete(slot);
      release(name, owner);
    }
  }
}

async function runStage(run, stage, flow, deps, vars) {
  if (stage.when && !WHEN[stage.when](run)) return { type: 'skip' };
  try {
    if (stage.kind === 'parallel') return await runParallelStage(run, stage, flow, deps);
    if (stage.kind === 'sections') return await runSectionsStage(run, stage, flow, deps);
    return await withStageLock(run, stage, () => (stage.kind === 'claude' ? runClaudeStage(run, stage, deps, vars) : runGateStage(run, stage, deps)));
  } catch (e) {
    return { type: 'halt', reason: `crash:${stage.id}: ${e.message}` };
  }
}

function userSkip(run, stage) {
  if (!(run.plan?.disabled ?? []).includes(stage.id) || (stage.when && !WHEN[stage.when](run))) return null;
  return { stage: stage.id, verdict: 'skipped-by-user', note: run.plan.skipReason ?? 'tắt từ đầu', blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 0 };
}

// Semaphore: chỗ trống được trao thẳng cho người chờ kế tiếp, không ai chen ngang vượt trần
function limit(max) {
  let live = 0;
  const queue = [];
  return async (fn) => {
    if (live < max) live++;
    else await new Promise((resolve) => queue.push(resolve));
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next();
      else live--;
    }
  };
}

// dist/ chung của campaign: build ghi độc quyền và gom mọi section đang chờ vào 1 lượt; lượt kiểm ui chỉ đọc nên chạy chung với nhau
function distQueue(runBuild) {
  let readers = 0;
  let wakeBuild = null;
  let current = null;
  let next = null;
  const exclusive = async () => {
    while (readers) await new Promise((resolve) => (wakeBuild = resolve));
    return runBuild();
  };
  const build = () => {
    if (next) return next;
    const queued = (current ?? Promise.resolve()).then(() => {
      next = null;
      current = queued;
      return exclusive();
    }).finally(() => {
      if (current === queued) current = null;
    });
    next = queued;
    return queued;
  };
  const read = async (fn) => {
    while (current || next) await Promise.allSettled([current, next]);
    readers++;
    try {
      return await fn();
    } finally {
      readers--;
      if (!readers) wakeBuild?.();
    }
  };
  return { build, read };
}

// run.json trong lúc nhóm chạy mang danh sách stage đang chạy để status/board hiện nhiều ● cùng lúc
function activeBoard(run) {
  const active = new Set();
  const show = () => {
    if (!isAbortedOnDisk(run)) saveRun(withPlanOnDisk({ ...run, active: [...active] }));
  };
  return {
    start: (id) => { active.add(id); show(); },
    end: (id) => { active.delete(id); show(); },
  };
}

// Receipt thành viên ghi ngay khi xong (không đợi cả nhóm) để vòng sau của cùng stage có round mới
function record(run, receipt, now) {
  const stored = { ...receipt, round: roundOf(run, receipt.stage), at: iso(now) };
  run.receipts = [...run.receipts, stored];
  return stored;
}

// instance: lane của 1 section — id riêng (stage@section) nên artifact, log, phiên, tiến trình không đè nhau
async function runMember(run, flow, id, deps, board, instance = null) {
  const base = stageOf(flow, id);
  const stage = instance ? { ...base, id: `${id}@${instance.id}`, ...(instance.resume && { resume: instance.resume }) } : base;
  if (stopRequested(run)) return { stage: stage.id, type: 'halt', reason: isAbortedOnDisk(run) ? 'aborted' : 'paused' };
  const skipped = userSkip(run, base);
  if (skipped) {
    run.gateSkipped = withGateSkipped(run, base, skipped.note, deps.now()).gateSkipped;
    return { stage: stage.id, type: 'skip', receipt: record(run, { ...skipped, stage: stage.id }, deps.now()) };
  }
  board.start(stage.id);
  const work = () => runStage(run, stage, flow, deps, instance?.vars);
  const event = await (stage.kind === 'claude' ? deps.slots(work) : work());
  board.end(stage.id);
  if (event.sessionId && base.keepSession) run.sessions = { ...run.sessions, [stage.id]: event.sessionId };
  return { ...event, stage: stage.id, ...(event.receipt && { receipt: record(run, event.receipt, deps.now()) }) };
}

function stagesRan(run, events) {
  const seen = new Map(events.filter((e) => e.receipt).map(({ receipt: r }) => [`${r.stage}-r${r.round}`, r]));
  return [...seen.values()].map((r) => ({ stage: r.stage, verdict: r.verdict, file: path.join(runDir(run.key, run.runId), `${r.stage}-r${r.round}.json`), receipt: r }));
}

const worstOf = (events) => (events.some((e) => e.type === 'halt') ? 'halt' : ['fail', 'revise'].find((t) => events.some((e) => e.type === t)) ?? 'pass');

// Join: nhóm chỉ pass khi mọi nhánh pass; file gom kết quả mọi nhánh là feedbackFile của fix
function joinEvent(run, stage, events, started, deps) {
  const times = timing(started, deps.now());
  const ran = stagesRan(run, events);
  const verdict = worstOf(events);
  writeArtifact(run, `${stage.id}-r${roundOf(run, stage.id)}.json`, { verdict, stages: ran.map(({ receipt, ...s }) => s), ...times });
  const halts = events.filter((e) => e.type === 'halt');
  const cut = events.filter((e) => e.cutSession).map((e) => e.cutSession);
  if (halts.length) return { type: 'halt', reason: halts.some((e) => e.reason === 'paused') ? 'paused' : halts[0].reason, ...(cut.length && { cutSession: cut }) };
  const sum = (field) => ran.reduce((n, s) => n + (s.receipt[field] ?? 0), 0);
  const receipt = { stage: stage.id, verdict, blocking: sum('blocking'), advisory: sum('advisory'), turns: 0, costUsd: 0, ms: 0, ...times, wallMs: times.durationMs, branchMs: sum('durationMs') };
  return { type: verdict, receipt };
}

// Nhánh là dãy bước chạy lần lượt (bước lỗi thì dừng nhánh đó), bước là mảng thì các stage trong đó chạy đồng thời
async function runParallelStage(run, stage, flow, deps) {
  const started = deps.now();
  const board = activeBoard(run);
  const runBranch = async (steps) => {
    const events = [];
    for (const step of steps) {
      const done = await Promise.all([step].flat().map((id) => runMember(run, flow, id, deps, board)));
      events.push(...done);
      if (done.some((e) => !PASSING.includes(e.type))) break;
    }
    return events;
  };
  const events = (await Promise.all(stage.branches.map(runBranch))).flat();
  return joinEvent(run, stage, events, started, deps);
}

// Mỗi section 1 lane claude; lane nào xong là kiểm section đó ngay (review ∥ build → ui khoanh #section),
// lỗi thì nối lại phiên lane đó sửa — section khác không chờ, không chạy lại. Section đã pass ghi vào run để pause/retry không làm lại
async function runSectionsStage(run, stage, flow, deps) {
  const started = deps.now();
  const board = activeBoard(run);
  const agents = { ...deps, slots: limit(stage.maxAgents ?? MAX_AGENTS) };
  const dist = distQueue(() => runMember(run, flow, stage.build, agents, board));
  const passedBefore = run.sectionsPassed ?? [];

  const runSection = async (section, index) => {
    const vars = { section: section.id, sectionFiles: section.files.join('\n'), servePort: String(SECTION_PORT + index) };
    const as = (id, more = {}) => runMember(run, flow, id, agents, board, { id: section.id, vars: { ...vars, ...more.vars }, resume: more.resume });
    const events = [await as(stage.lane)];
    for (let round = 1; PASSING.includes(events.at(-1).type); round++) {
      const checks = await Promise.all([as(stage.review), dist.build().then((built) => (built.type === 'pass' ? dist.read(() => as(stage.ui)) : built))]);
      events.push(...checks);
      if (checks.every((e) => PASSING.includes(e.type))) {
        run.sectionsPassed = [...(run.sectionsPassed ?? []), section.id];
        break;
      }
      if (checks.some((e) => e.type === 'halt')) break;
      if (round > (stage.rounds ?? SECTION_ROUNDS)) {
        events.push({ type: 'halt', reason: `loop-exhausted:${stage.id}@${section.id}` });
        break;
      }
      const feedbackFile = writeArtifact(run, `section-check@${section.id}-r${round}.json`, { verdict: worstOf(checks), stages: stagesRan(run, checks).map(({ receipt, ...s }) => s) });
      events.push(await as(stage.fix, { vars: { feedbackFile }, resume: `${stage.lane}@${section.id}` }));
    }
    return events;
  };

  const sections = sectionsOf(run).map((section, index) => ({ section, index })).filter(({ section }) => !passedBefore.includes(section.id));
  const events = (await Promise.all(sections.map(({ section, index }) => runSection(section, index)))).flat();
  const event = joinEvent(run, stage, events, started, deps);
  if (event.type !== 'halt') delete run.sectionsPassed;
  return event;
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
    agentRoot: path.resolve(import.meta.dirname, '../../..'), slots: limit(MAX_AGENTS), ...overrides,
  };
  let run = { ...startRun, stage: positionOf(flow, startRun.stage) };
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
    if (!['claude', 'gate', 'parallel', 'sections'].includes(action.type)) {
      // run đã dừng chờ user — yêu cầu pause đến muộn coi như đã đáp, không để treo sang lần drive sau
      fs.rmSync(pauseFile(run.key, run.runId), { force: true });
      saveRun(run);
      announce(run, action.stage, deps);
      return run;
    }
    // stage không áp cho run này đi qua luôn — pause/điểm dừng rơi vào stage thật kế tiếp
    if (action.stage.when && !WHEN[action.stage.when](run)) {
      run = applyEvent(run, flow, { type: 'skip' }, deps.now());
      continue;
    }
    if (fs.existsSync(pauseFile(run.key, run.runId))) {
      fs.rmSync(pauseFile(run.key, run.runId));
      run = applyEvent(run, flow, { type: 'halt', reason: 'paused' }, deps.now());
      continue;
    }
    const stage = action.stage;
    const skipped = userSkip(run, stage);
    if (skipped) {
      run = applyEvent(run, flow, { type: 'skip', by: 'user', reason: skipped.note, receipt: skipped }, deps.now());
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
    const event = await runStage(run, stage, flow, deps);
    if (isAbortedOnDisk(run)) return { ...run, status: 'stopped', stopReason: 'aborted' };
    if (event.cutSession || event.reason === 'paused') fs.rmSync(pauseFile(run.key, run.runId), { force: true });
    const { cutSession, resumeNote, ...rest } = run;
    // Note của user chỉ dành cho stage claude đầu tiên chạy sau khi quay lại (nhóm song song: mọi nhánh cùng đọc)
    if (stage.kind !== 'gate' && event.receipt) rest.rejectNote = null;
    run = applyEvent(event.cutSession ? { ...rest, cutSession: event.cutSession } : rest, flow, event, deps.now());
    run = withPlanOnDisk(run);
    if (PASSING.includes(event.type) && run.status === 'running' && [stage.id, ...membersOf(stage)].some((id) => (run.plan?.breakpoints ?? []).includes(id))) {
      run = applyEvent(run, flow, { type: 'halt', reason: `breakpoint:${stage.id}` }, deps.now());
    }
    saveRun(run);
  }
}
