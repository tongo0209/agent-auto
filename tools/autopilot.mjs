#!/usr/bin/env node
// autopilot — chạy ticket qua luồng khai báo trong flows/, mỗi stage một `claude -p`. Spec: docs/superpowers/specs/2026-10-20-autopilot-design.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRun, applyEvent, resumeRun, reopenRun, finalApproval, stageOf, roundOf, isGateLike, chooseAction, checkRunPlan } from './lib/autopilot/engine.mjs';
import { drive, claimRepos, runGateStage, WHEN } from './lib/autopilot/driver.mjs';
import { runGates } from './lib/autopilot/gates.mjs';
import { briefOf, briefFile, chatLaunch, followupBriefOf, attachBriefOf, attachFile, attachLaunch } from './lib/autopilot/chat.mjs';
import { runChanges } from './lib/autopilot/review.mjs';
import { loadFlow, listFlows, validateFlow, PROMPTS_DIR } from './lib/autopilot/flows.mjs';
import { gatherSignals, readJson } from './lib/autopilot/signals.mjs';
import { fetchJiraSnapshot, jiraChangedSince } from './lib/autopilot/jira-snapshot.mjs';
import { route, loadRules } from './lib/autopilot/router.mjs';
import { newRunId, loadRun, listRuns, saveRun, runsDir, runDir, pauseFile, childFile, writeArtifact, planOptions } from './lib/autopilot/store.mjs';
import { repoState, removeWorktree, branchOf } from './lib/autopilot/worktree.mjs';
import { acquire, release, claimCampaign, releaseCampaign, heldCampaigns, isInterrupted, releaseRepos, runLock } from './lib/autopilot/lock.mjs';
import { formatStatus } from './lib/autopilot/format.mjs';

const AGENT_ROOT = path.resolve(import.meta.dirname, '..');
// worktree lab không có state.json/config.json (dữ liệu ngoài git) nên đọc của repo chính
const MAIN_ROOT = path.join(os.homedir(), 'VNG', 'agent-auto');
const DATA_ROOT = process.env.AUTOPILOT_DATA_ROOT || (fs.existsSync(path.join(AGENT_ROOT, 'state.json')) ? AGENT_ROOT : MAIN_ROOT);
const USAGE = `Dùng:
  autopilot run <KEY|link> [--key GW-123] [--flow id] [--campaign dir] [--budget-usd n] [--bg] [--skip a,b] [--skip-reason "…"] [--break c,d]
                                   (link sheet tự tra ra ticket; tra không ra/nhiều ticket thì --key gán tay, không thì mã ADHOC)
                                   (--skip tắt stage từ đầu, cổng cần --skip-reason; --break dừng sau stage đó)
  autopilot open <KEY|link> [--key GW-123] [--flow id] [--campaign dir]   (run chat: làm thẳng repo gốc + brief.md, in JSON để mở tab claude)
  autopilot open <KEY> --attach                             (tab claude cho run bất kỳ: run chat nối phiên mới nhất, run khác phiên mới với attach.md)
  autopilot mark <KEY> <bước> <doing|pass|fail|ask> [--note "…"]
  autopilot gates <KEY> [check…]   (mặc định mọi cổng của luồng trừ commit)
  autopilot open <KEY> --followup [--note "…"]             (run đã xong: mở tab chat sửa tiếp trên repo của run)
  autopilot done <KEY>             (run chat xong, nhả repo + campaign, chờ review)
  autopilot reviewed <KEY>         (run đã xong: đánh dấu đã review code)
  autopilot status [KEY]
  autopilot approve <KEY> [--note "…"]
  autopilot reject <KEY> --note "…"   (run đã xong: trả về sửa, chạy lại fix → cổng → commit chồng lên)
  autopilot pause <KEY>    (dừng ngay bước claude đang chạy; resume nối tiếp đúng phiên)
  autopilot resume <KEY> [--note "…"] [--budget-usd n] [--budget-minutes n]   (--note: nhắn vào bước bị dừng giữa chừng)
  autopilot abort <KEY>
  autopilot retry <KEY> [--note "…"]         (run dừng: chạy lại đúng stage đang dừng)
                                   (--bg chạy nền được cho run/approve/reject/resume/retry/goto/skip/pick)
  autopilot goto <KEY> <stage> --note "…"    (quay về stage đã đi qua, chạy lại từ đó)
  autopilot skip <KEY> [--reason "…"]        (run dừng: bỏ qua stage đang dừng; cổng bắt buộc --reason)
  autopilot pick <KEY> <A|B|C> [--note "…"]  (ở approve-plan: chọn phương án trong plan.md rồi chạy tiếp)
  autopilot break <KEY> <stage> [--off]      (bật/tắt điểm dừng sau stage; không chạy run)
  autopilot route <KEY|link> [--json] [--flow id] | route --validate   (--json: xem trước luồng + stage, 1 dòng JSON)`;

const STOP_DECISIONS = ['ask', 'manual'];

function describeDecision({ flow, target, reason, questions = [] }) {
  const head = flow === 'manual' ? `manual — ${reason}` : flow === 'ask' ? `ask${target ? ` (${target})` : ''} — ${reason}` : `${flow} — ${reason}`;
  return [head, ...questions.map((q, i) => `  ${i + 1}. ${q}`)].join('\n');
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (['--bg', '--validate', '--attach', '--followup', '--json', '--off'].includes(argv[i])) opts[argv[i].slice(2)] = true;
    else if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else opts._.push(argv[i]);
  }
  return opts;
}

function die(message) {
  console.error(message);
  process.exit(1);
}

function repoOf(dir) {
  const configFile = path.join(DATA_ROOT, 'config.json');
  const repos = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')).repos ?? {} : {};
  return Object.values(repos).find((r) => dir.startsWith(r)) ?? path.dirname(dir);
}

const fakeGates = async (checks) => ({ pass: true, error: null, results: checks.map((check) => ({ check, status: 'pass', blocking: [], note: 'fake' })) });

function driveDeps(input) {
  return { repoOf, input, ...(process.env.AUTOPILOT_FAKE_GATES ? { runGates: fakeGates } : {}) };
}

// Chạy tiếp một run dưới lock riêng của nó (run khác chạy song song được); xong/dừng thì nhả campaign, xong thì nhả repo
async function continueRun(start, input) {
  const owner = { key: start.key, runId: start.runId };
  const lock = acquire(runLock(owner), owner);
  if (!lock.ok) die(`${owner.key} đang được 1 process khác chạy — chờ nó tới mốc dừng.`);
  try {
    const run = start.prepare ? start.prepare(loadRun(owner.key, owner.runId)) : start;
    const claimed = run.campaignDir ? claimCampaign(run.campaignDir, owner) : { ok: true };
    if (!claimed.ok) die(`${run.campaignDir} đang bị ${claimed.holder.key}/${claimed.holder.runId} giữ — xong/abort run đó trước.`);
    const flow = loadFlow(run.flow);
    const after = await drive(run, flow, driveDeps(input));
    if (['done', 'stopped'].includes(after.status)) releaseCampaign(owner);
    if (after.status === 'done') releaseRepos(owner);
    console.log(formatStatus(after, flow));
    return after;
  } finally {
    release(runLock(owner), owner);
  }
}

function startBackground(argv) {
  fs.mkdirSync(runsDir(), { recursive: true });
  const log = path.join(runsDir(), `bg-${newRunId(new Date())}-${process.pid}.log`);
  const out = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [import.meta.filename, ...argv.filter((a) => a !== '--bg')], { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  console.log(`Chạy nền PID ${child.pid} · log: ${log}`);
}

function signalsOf(opts, input) {
  if (opts.key && !/^[A-Z]+-\d+$/.test(opts.key)) die(`--key phải là mã Jira dạng GW-123, nhận: ${opts.key}`);
  return gatherSignals({ input, agentRoot: DATA_ROOT, campaign: opts.campaign, key: opts.key });
}

function decide(opts, signals) {
  if (!opts.flow) return route(signals, loadRules());
  if (!listFlows().includes(opts.flow)) die(`flow không có: ${opts.flow}`);
  return { flow: opts.flow, reason: `chọn tay --flow ${opts.flow}` };
}

const listOpt = (value) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function mustStage(flow, id) {
  return stageOf(flow, id) ?? die(`không có stage ${id} trong luồng ${flow.id}`);
}

function planOf(opts, flow) {
  const plan = { disabled: listOpt(opts.skip), breakpoints: listOpt(opts.break), skipReason: opts['skip-reason']?.trim() || null };
  const problem = checkRunPlan(flow, plan);
  if (problem) die(problem);
  return plan;
}

function newRun(opts, input) {
  const signals = signalsOf(opts, input);
  const decided = decide(opts, signals);
  if (STOP_DECISIONS.includes(decided.flow)) die(describeDecision(decided));

  const holder = signals.campaignDir && heldCampaigns()[signals.campaignDir];
  if (holder) die(`${signals.campaignDir} đang bị ${holder.key}/${holder.runId} giữ — xong/abort run đó trước.`);

  const flow = loadFlow(decided.flow);
  const plan = planOf(opts, flow);
  const target = flow.usesRepo === false ? { campaignDir: null, campaignDirs: [], handoffDir: null, repos: [] } : signals;
  const repo = flow.usesRepo === false ? null : signals.repo ?? (signals.campaignDir ? repoOf(signals.campaignDir) : null);
  const now = new Date();
  const runId = newRunId(now);
  const run = createRun({
    // nhiều task không có mã Jira khởi động cùng giây → pid tách key, không đè run của nhau
    key: signals.key ?? `ADHOC-${runId}-${process.pid}`, runId, flow, routerReason: decided.reason,
    repo, campaignDir: target.campaignDir, campaignDirs: target.campaignDirs, handoffDir: target.handoffDir, cloneSource: signals.cloneSource, sheetUrl: signals.sheetUrl, sheetKind: signals.sheetKind, repos: [repo, ...target.repos], ...plan, now: now.getTime(),
  });
  return { run, flow, reason: decided.reason };
}

// Không ghi state.json (chỉ /daily ghi); gọi Jira lỗi thì cảnh báo, run vẫn chạy bằng state
function snapshotJira(run) {
  if (!/^[A-Z]+-\d+$/.test(run.key)) return;
  try {
    const snapshot = fetchJiraSnapshot(run.key, readJson(path.join(DATA_ROOT, 'config.json')).cloudId);
    if (!snapshot) return;
    writeArtifact(run, 'jira.json', snapshot);
    const lastSeen = readJson(path.join(DATA_ROOT, 'state.json')).issues?.[run.key]?.lastSeenUpdated;
    if (!jiraChangedSince(snapshot, lastSeen)) return;
    console.log(`⚠ Jira đổi sau lần quét cuối (${lastSeen ?? 'chưa quét'} → ${snapshot.updated}) — ảnh chụp đã đưa vào prompt các stage`);
    run.jiraUpdate = snapshot;
  } catch (e) {
    console.log(`⚠ không đọc được Jira ${run.key} (${e.message.split('\n')[0]}) — chạy tiếp theo state.json`);
  }
}

async function cmdRun(opts, argv) {
  const input = opts._[1] ?? die(USAGE);
  const { run, flow, reason } = newRun(opts, input);
  snapshotJira(run);
  if (opts['budget-usd']) run.budget.usd = Number(opts['budget-usd']);
  console.log(`▶ ${run.key} → ${flow.id} (${reason})`);
  await continueRun(run, input);
}

function cmdOpen(opts) {
  const input = opts._[1] ?? die(USAGE);
  if (opts.attach) return openAttach(mustLoad(input));
  if (opts.followup) return openFollowup(mustLoadDone(input), opts.note);
  const { run: created, flow } = newRun(opts, input);
  const claimed = claimOrDie(created);
  const held = created.campaignDir ? claimCampaign(created.campaignDir, created) : { ok: true };
  if (!held.ok) die(`${created.campaignDir} đang bị ${held.holder.key}/${held.holder.runId} giữ — xong/abort run đó trước.`);
  const run = { ...claimed, mode: 'chat', status: 'chat', chatState: null };
  saveRun(run);
  fs.writeFileSync(briefFile(run), briefOf(run, flow, input));
  console.log(JSON.stringify(chatLaunch(run)));
}

// Chỉ ghi attach.md, không đổi trạng thái run: mở tab để xem/hỏi không được làm run lệch board
function openAttach(run) {
  if (run.mode === 'chat' && run.status === 'chat') return console.log(JSON.stringify(chatLaunch(run, { resume: true })));
  fs.writeFileSync(attachFile(run), attachBriefOf(run, loadFlow(run.flow), runChanges(run)));
  console.log(JSON.stringify(attachLaunch(run)));
}

function claimOrDie(run) {
  try {
    return claimRepos(run, { repoState });
  } catch (e) {
    return die(`${run.key}: ${e.message}`);
  }
}

function openFollowup(done, note) {
  holdAgain(done);
  const run = { ...claimOrDie(done), mode: 'chat', status: 'chat', stage: finalApproval(loadFlow(done.flow)).onReject, chatState: null, reviewedAt: null };
  saveRun(run);
  fs.writeFileSync(briefFile(run), followupBriefOf(run, runChanges(run), note));
  console.log(JSON.stringify(chatLaunch(run)));
}

// Run xong đã nhả campaign; mở lại thì phải giữ lại, trừ khi run khác đã lấy
function holdAgain(run) {
  if (!run.campaignDir) return;
  const held = claimCampaign(run.campaignDir, run);
  if (!held.ok) die(`${run.campaignDir} đang bị ${held.holder.key}/${held.holder.runId} giữ — xong/abort run đó trước.`);
}

const MARKS = ['doing', 'pass', 'fail', 'ask'];

// Chỉ pass/fail là kết quả của một lượt nên mới thành receipt; doing/ask chỉ đổi trạng thái trên board
function cmdMark(opts) {
  const [, key, stage, state] = opts._;
  const run = mustLoadChat(key ?? die(USAGE));
  const flow = loadFlow(run.flow);
  if (!stageOf(flow, stage)) die(`Bước lạ: ${stage} — luồng ${flow.id} có: ${flow.stages.map((s) => s.id).join(', ')}`);
  if (!MARKS.includes(state)) die(`Trạng thái lạ: ${state} — dùng ${MARKS.join('|')}`);
  const note = opts.note ?? null;
  const receipt = { stage, verdict: state, note, round: roundOf(run, stage), at: new Date().toISOString(), blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 0 };
  const receipts = ['pass', 'fail'].includes(state) ? [...run.receipts, receipt] : run.receipts;
  saveRun({ ...run, stage, chatState: state, chatNote: note, receipts });
  console.log(`${run.key} · ${stage} → ${state}`);
}

const sameChecks = (a, b) => a.checks.join() === b.checks.join();

function gateStagesFor(run, flow, wanted) {
  const flowChecks = new Set(flow.stages.flatMap((s) => s.checks ?? []));
  const unknown = wanted.filter((c) => !flowChecks.has(c));
  if (unknown.length) die(`check lạ với luồng ${flow.id}: ${unknown.join(', ')} — có: ${[...flowChecks].join(', ')}`);
  const pick = (checks) => (wanted.length ? checks.filter((c) => wanted.includes(c)) : checks.filter((c) => c !== 'commit'));
  return flow.stages
    .filter((s) => s.kind === 'gate' && (!s.when || WHEN[s.when](run)))
    .map((s) => ({ ...s, checks: pick(s.checks) }))
    .filter((s, i, all) => s.checks.length && all.findIndex((o) => sameChecks(o, s)) === i);
}

async function cmdGates(opts) {
  let run = mustLoadChat(opts._[1] ?? die(USAGE));
  const stages = gateStagesFor(run, loadFlow(run.flow), opts._.slice(2));
  if (!stages.length) die('Không có cổng nào áp dụng cho run này.');
  const deps = { now: Date.now, runGates, ...driveDeps() };
  let allPass = true;
  for (const stage of stages) {
    const event = await runGateStage(run, stage, deps);
    const receipt = { ...event.receipt, round: roundOf(run, stage.id), at: new Date().toISOString() };
    run = { ...run, receipts: [...run.receipts, receipt] };
    allPass &&= event.type === 'pass';
    const result = JSON.parse(fs.readFileSync(path.join(runDir(run.key, run.runId), `${stage.id}-r${receipt.round}.json`), 'utf8'));
    console.log(`${stage.id}: ${event.type === 'pass' ? 'ĐẠT' : event.type === 'halt' ? `LỖI (${event.reason})` : 'CHƯA ĐẠT'} · ${stage.id}-r${receipt.round}.json`);
    for (const r of result.results) console.log(`  ${r.check} ${r.status}${r.note ? ` · ${r.note}` : ''}${r.blocking.map((b) => `\n    ${b}`).join('')}`);
  }
  saveRun(run);
  if (!allPass) process.exit(1);
}

function cmdDone(opts) {
  const run = mustLoadChat(opts._[1] ?? die(USAGE));
  saveRun({ ...run, status: 'done', stage: null, chatState: null });
  releaseCampaign(run);
  releaseRepos(run);
  const commits = (run.commits ?? []).map((c) => c.sha.slice(0, 9)).join(', ');
  console.log(`${run.key} xong — ${commits ? `commit ${commits}` : 'chưa commit gì'}; review rồi tự push khi muốn.`);
}

function mustLoad(key) {
  return loadRun(key) ?? die(`Chưa có run nào cho ${key}`);
}

function mustLoadDone(key) {
  const run = mustLoad(key);
  if (run.status !== 'done') die(`${key} chưa xong (${run.status}) — chỉ review/sửa tiếp run đã xong.`);
  return run;
}

function cmdReviewed(opts) {
  const run = mustLoadDone(opts._[1] ?? die(USAGE));
  saveRun({ ...run, reviewedAt: Date.now() });
  console.log(`${run.key} đã review.`);
}

function mustLoadChat(key) {
  const run = mustLoad(key);
  if (run.mode !== 'chat' || run.status !== 'chat') die(`${key} không phải run chat đang mở (${run.mode ?? 'auto'} · ${run.status}).`);
  return run;
}

// Lấy lock trước rồi mới đọc lại run.json và kiểm trạng thái: 2 lệnh song song không cùng chạy từ trạng thái cũ.
// Dưới lock 'run', run nào còn ghi running trên đĩa đều là run bị ngắt (driver của nó phải đang giữ lock này)
function continueLatest(key, prepare) {
  const { key: runKey, runId } = mustLoad(key);
  return continueRun({ key: runKey, runId, prepare });
}

function cmdDecide(opts, type) {
  if (type === 'reject' && !opts.note) die('reject cần --note "…" để stage sau biết sửa gì.');
  return continueLatest(opts._[1] ?? die(USAGE), (run) => {
    const flow = loadFlow(run.flow);
    if (type === 'reject' && run.status === 'done') {
      holdAgain(run);
      return reopenRun(run, flow, opts.note, Date.now());
    }
    if (!['paused', 'attached'].includes(run.status)) die(`${run.key} đang ${run.status}, không có gì để ${type}.`);
    const skipped = run.gateSkipped ?? [];
    if (type === 'approve' && skipped.length) console.log(`⚠ Đã bỏ ${skipped.length} cổng: ${skipped.map((g) => `${g.stage} (${g.reason})`).join(', ')}`);
    return applyEvent(run, flow, { type, note: opts.note }, Date.now());
  });
}

function cmdResume(opts) {
  return continueLatest(opts._[1] ?? die(USAGE), (run) => {
    if (run.status !== 'stopped' && run.status !== 'running') die(`${run.key} đang ${run.status} — dùng approve/reject.`);
    const num = (flag) => (opts[flag] ? Number(opts[flag]) : undefined);
    const resumed = { ...resumeRun(run, { budgetUsd: num('budget-usd'), budgetMinutes: num('budget-minutes') }), resumeNote: opts.note };
    const kind = stageOf(loadFlow(run.flow), resumed.stage)?.kind;
    return kind === 'pause' ? { ...resumed, status: 'paused' } : resumed;
  });
}

function mustChoose(run, flow, action, interrupted) {
  try {
    return chooseAction(run, flow, action, { options: planOptions(run), now: Date.now(), interrupted });
  } catch (e) {
    die(e.message);
  }
}

// Lệnh lựa chọn trên pipeline: engine kiểm hợp lệ, CLI chỉ dịch cờ sang action
function cmdChoose(opts, type) {
  const key = opts._[1] ?? die(USAGE);
  const flow = loadFlow(mustLoad(key).flow);
  const action = {
    type,
    note: opts.note,
    ...(type === 'goto' && { stage: mustStage(flow, opts._[2] ?? die(USAGE)).id }),
    ...(type === 'skip' && { reason: opts.reason }),
    ...(type === 'pick' && { option: opts._[2] ?? die(USAGE) }),
  };
  if (type === 'goto' && !opts.note?.trim()) die('goto cần --note "…" để stage đó biết làm lại gì.');
  return continueLatest(key, (run) => {
    const next = mustChoose(run, flow, action, run.status === 'running');
    return stageOf(flow, next.stage)?.kind === 'pause' ? { ...next, status: 'paused' } : next;
  });
}

function cmdBreak(opts) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  if (run.status === 'done') die(`${run.key} đã xong, không đặt điểm dừng được.`);
  const flow = loadFlow(run.flow);
  const stage = mustStage(flow, opts._[2] ?? die(USAGE)).id;
  const isOn = (run.plan?.breakpoints ?? []).includes(stage);
  const wantOn = !opts.off;
  if (isOn === wantOn) return console.log(formatStatus(run, flow));
  const { breakpoints } = mustChoose(run, flow, { type: 'break', stage }, isInterrupted(run)).plan;
  // Driver có thể vừa ghi run.json: đọc bản mới nhất, chỉ thay breakpoints
  const latest = loadRun(run.key, run.runId);
  const next = { ...latest, plan: { disabled: [], ...latest.plan, breakpoints } };
  saveRun(next);
  console.log(formatStatus(next, flow));
}

function cmdPause(opts) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  if (run.status !== 'running') die(`${run.key} đang ${run.status}, không có gì để tạm dừng.`);
  if (isInterrupted(run)) die(`${run.key} đã bị ngắt (không còn process chạy) — dùng resume để chạy tiếp.`);
  fs.writeFileSync(pauseFile(run.key, run.runId), '');
  console.log(killStage(run) ? `${run.key} đã dừng ngay giữa bước ${run.stage}; resume để nối tiếp.` : `${run.key} sẽ dừng sau bước ${run.stage} đang chạy.`);
}

// Tắt cả nhóm tiến trình claude của stage đang chạy (runner spawn detached nên PID = mã nhóm)
function killStage(run) {
  const file = childFile(run.key, run.runId);
  if (!fs.existsSync(file)) return false;
  const { pid } = JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try { process.kill(pid, 'SIGTERM'); } catch { return false; }
  }
  return true;
}

function cmdAbort(opts) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  saveRun({ ...run, status: 'stopped', stopReason: 'aborted' });
  killStage(run);
  releaseCampaign(run);
  releaseRepos(run);
  for (const [top, dir] of Object.entries(run.worktrees ?? {})) removeWorktree({ top, dir, branch: branchOf(run) });
  fs.rmSync(runDir(run.key, run.runId), { recursive: true, force: true });
  const keyDir = path.dirname(runDir(run.key, run.runId));
  if (!fs.readdirSync(keyDir).length) fs.rmdirSync(keyDir);
  console.log(`${run.key} đã huỷ: tắt tiến trình, xoá thư mục run — repo không bị reset/checkout/clean.`);
  for (const top of Object.keys(run.workBranch ?? {})) {
    const before = new Set(run.dirtyAtStart?.[top] ?? []);
    const left = repoState(top).dirty.filter((f) => !before.has(f));
    if (left.length) console.log(`File đổi từ lúc run bắt đầu mà chưa commit ở ${top} (tự xử lý, có thể lẫn của phiên khác):\n${left.map((f) => `  ${f}`).join('\n')}`);
  }
}

function cmdStatus(opts) {
  if (opts._[1]) {
    const run = mustLoad(opts._[1]);
    return console.log(formatStatus(run, loadFlow(run.flow)));
  }
  const runs = listRuns();
  if (!runs.length) return console.log('Chưa có run nào.');
  for (const run of runs) console.log(`${run.key} · ${run.flow} · ${run.status}${run.stopReason ? ` (${run.stopReason})` : ''} · ${run.stage ?? '—'}`);
  const held = Object.entries(heldCampaigns());
  if (held.length) console.log(`\nCampaign đang bị giữ:\n${held.map(([dir, o]) => `  ${o.key} → ${dir}`).join('\n')}`);
}

// when phụ thuộc file sẽ sửa thì chưa biết trước; chỉ hasHandoff đoán được từ tín hiệu
const PREDICT = { hasHandoff: (signals) => (signals.handoffDir ? 'run' : 'skip') };

function preview(signals, decided) {
  const flows = listFlows().map((id) => ({ id, label: loadFlow(id).label }));
  if (STOP_DECISIONS.includes(decided.flow)) return { flow: null, label: null, reason: decided.reason, flows, stages: [] };
  const flow = loadFlow(decided.flow);
  const stages = flow.stages.map((s) => ({
    id: s.id, kind: s.kind, gateLike: isGateLike(s), when: s.when ?? null,
    predicted: !s.when ? 'run' : PREDICT[s.when]?.(signals) ?? 'unknown',
  }));
  return { flow: flow.id, label: flow.label, reason: decided.reason, flows, stages };
}

function cmdRoute(opts) {
  if (opts.validate) {
    const problems = listFlows().flatMap((id) => validateFlow(loadFlow(id), { promptsDir: PROMPTS_DIR }).map((e) => `${id}: ${e}`));
    if (problems.length) die(problems.join('\n'));
    return console.log(`${listFlows().length} luồng hợp lệ: ${listFlows().join(', ')}`);
  }
  const signals = signalsOf(opts, opts._[1] ?? die(USAGE));
  if (opts.json) return console.log(JSON.stringify(preview(signals, decide(opts, signals))));
  console.log(describeDecision(route(signals, loadRules())));
  console.log(JSON.stringify({ ...signals, briefText: signals.briefText.slice(0, 80) }, null, 2));
}

const argv = process.argv.slice(2);
const opts = parseArgs(argv);
const COMMANDS = {
  run: () => cmdRun(opts, argv),
  open: () => cmdOpen(opts),
  mark: () => cmdMark(opts),
  gates: () => cmdGates(opts),
  done: () => cmdDone(opts),
  reviewed: () => cmdReviewed(opts),
  status: () => cmdStatus(opts),
  approve: () => cmdDecide(opts, 'approve'),
  reject: () => cmdDecide(opts, 'reject'),
  pause: () => cmdPause(opts),
  resume: () => cmdResume(opts),
  abort: () => cmdAbort(opts),
  route: () => cmdRoute(opts),
  retry: () => cmdChoose(opts, 'retry'),
  goto: () => cmdChoose(opts, 'goto'),
  skip: () => cmdChoose(opts, 'skip'),
  pick: () => cmdChoose(opts, 'pick'),
  break: () => cmdBreak(opts),
};
const RUN_ONWARD = ['run', 'approve', 'reject', 'resume', 'retry', 'goto', 'skip', 'pick'];
if (opts.bg && RUN_ONWARD.includes(opts._[0])) startBackground(argv);
else await (COMMANDS[opts._[0]] ?? (() => die(USAGE)))();
