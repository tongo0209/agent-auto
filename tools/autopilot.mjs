#!/usr/bin/env node
// autopilot — chạy ticket qua luồng khai báo trong flows/, mỗi stage một `claude -p`. Spec: docs/superpowers/specs/2026-10-20-autopilot-design.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRun, applyEvent, resumeRun, reopenRun, finalApproval, stageOf, roundOf } from './lib/autopilot/engine.mjs';
import { drive, isolate, runGateStage, WHEN } from './lib/autopilot/driver.mjs';
import { runGates } from './lib/autopilot/gates.mjs';
import { briefOf, briefFile, chatLaunch, followupBriefOf, attachBriefOf, attachFile, attachLaunch } from './lib/autopilot/chat.mjs';
import { runChanges } from './lib/autopilot/review.mjs';
import { loadFlow, listFlows, validateFlow, PROMPTS_DIR } from './lib/autopilot/flows.mjs';
import { gatherSignals } from './lib/autopilot/signals.mjs';
import { route, loadRules } from './lib/autopilot/router.mjs';
import { newRunId, loadRun, listRuns, saveRun, runsDir, runDir, pauseFile, childFile, writeArtifact } from './lib/autopilot/store.mjs';
import { addWorktree, removeWorktree, branchOf } from './lib/autopilot/worktree.mjs';
import { acquire, release, holdCampaign, releaseCampaign, heldCampaigns, isInterrupted } from './lib/autopilot/lock.mjs';
import { formatStatus } from './lib/autopilot/format.mjs';

const AGENT_ROOT = path.resolve(import.meta.dirname, '..');
// worktree lab không có state.json/config.json (dữ liệu ngoài git) nên đọc của repo chính
const MAIN_ROOT = path.join(os.homedir(), 'VNG', 'agent-auto');
const DATA_ROOT = process.env.AUTOPILOT_DATA_ROOT || (fs.existsSync(path.join(AGENT_ROOT, 'state.json')) ? AGENT_ROOT : MAIN_ROOT);
const USAGE = `Dùng:
  autopilot run <KEY|link> [--flow id] [--campaign dir] [--budget-usd n] [--bg]
  autopilot open <KEY|link> [--flow id] [--campaign dir]   (run chat: worktree + brief.md, in JSON để mở tab claude)
  autopilot open <KEY> --attach                             (tab claude cho run bất kỳ: run chat nối phiên mới nhất, run khác phiên mới với attach.md)
  autopilot mark <KEY> <bước> <doing|pass|fail|ask> [--note "…"]
  autopilot gates <KEY> [check…]   (mặc định mọi cổng của luồng trừ commit)
  autopilot open <KEY> --followup [--note "…"]             (run đã xong: mở tab chat sửa tiếp trên chính worktree đó)
  autopilot done <KEY>             (run chat xong, giữ worktree + nhánh để review)
  autopilot reviewed <KEY>         (run đã xong: đánh dấu đã review code)
  autopilot status [KEY]
  autopilot approve <KEY> [--note "…"]
  autopilot reject <KEY> --note "…"   (run đã xong: trả về sửa, chạy lại fix → cổng → commit chồng lên nhánh)
  autopilot pause <KEY>    (dừng ngay bước claude đang chạy; resume nối tiếp đúng phiên)
  autopilot resume <KEY> [--note "…"] [--budget-usd n] [--budget-minutes n]   (--note: nhắn vào bước bị dừng giữa chừng)
  autopilot abort <KEY>
  autopilot route <KEY|link> | route --validate`;

const STOP_DECISIONS = ['ask', 'manual'];

function describeDecision({ flow, target, reason, questions = [] }) {
  const head = flow === 'manual' ? `manual — ${reason}` : flow === 'ask' ? `ask${target ? ` (${target})` : ''} — ${reason}` : `${flow} — ${reason}`;
  return [head, ...questions.map((q, i) => `  ${i + 1}. ${q}`)].join('\n');
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (['--bg', '--validate', '--attach', '--followup'].includes(argv[i])) opts[argv[i].slice(2)] = true;
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

// Chạy tiếp một run dưới lock 'run'; xong/dừng thì nhả campaign
async function continueRun(run, input) {
  const owner = { key: run.key, runId: run.runId };
  const lock = acquire('run', owner);
  if (!lock.ok) die(`Đang có run khác chạy: ${lock.holder.key}/${lock.holder.runId} — chờ nó tới mốc dừng.`);
  try {
    if (run.campaignDir) holdCampaign(run.campaignDir, owner);
    const flow = loadFlow(run.flow);
    const after = await drive(run, flow, driveDeps(input));
    if (['done', 'stopped'].includes(after.status)) releaseCampaign(owner);
    console.log(formatStatus(after, flow));
    return after;
  } finally {
    release('run', owner);
  }
}

function startBackground(argv) {
  fs.mkdirSync(runsDir(), { recursive: true });
  const log = path.join(runsDir(), `bg-${newRunId(new Date())}.log`);
  const out = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [import.meta.filename, ...argv.filter((a) => a !== '--bg')], { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  console.log(`Chạy nền PID ${child.pid} · log: ${log}`);
}

function newRun(opts, input) {
  const signals = gatherSignals({ input, agentRoot: DATA_ROOT, campaign: opts.campaign });
  const decided = opts.flow ? { flow: opts.flow, reason: `chọn tay --flow ${opts.flow}` } : route(signals, loadRules());
  if (STOP_DECISIONS.includes(decided.flow)) die(describeDecision(decided));

  const holder = signals.campaignDir && heldCampaigns()[signals.campaignDir];
  if (holder) die(`${signals.campaignDir} đang bị ${holder.key}/${holder.runId} giữ — xong/abort run đó trước.`);

  const flow = loadFlow(decided.flow);
  const target = flow.usesRepo === false ? { campaignDir: null, campaignDirs: [], handoffDir: null, repos: [] } : signals;
  const repo = flow.usesRepo === false ? null : signals.repo ?? (signals.campaignDir ? repoOf(signals.campaignDir) : null);
  const now = new Date();
  const runId = newRunId(now);
  const run = createRun({
    key: signals.key ?? `ADHOC-${runId}`, runId, flow, routerReason: decided.reason,
    repo, campaignDir: target.campaignDir, campaignDirs: target.campaignDirs, handoffDir: target.handoffDir, cloneSource: signals.cloneSource, sheetUrl: signals.sheetUrl, sheetKind: signals.sheetKind, repos: [repo, ...target.repos], now: now.getTime(),
  });
  return { run, flow, reason: decided.reason };
}

async function cmdRun(opts, argv) {
  const input = opts._[1] ?? die(USAGE);
  if (opts.bg) return startBackground(argv);
  const { run, flow, reason } = newRun(opts, input);
  if (opts['budget-usd']) run.budget.usd = Number(opts['budget-usd']);
  console.log(`▶ ${run.key} → ${flow.id} (${reason})`);
  await continueRun(run, input);
}

function cmdOpen(opts) {
  const input = opts._[1] ?? die(USAGE);
  if (opts.attach) return openAttach(mustLoad(input));
  if (opts.followup) return openFollowup(mustLoadDone(input), opts.note);
  const { run: created, flow } = newRun(opts, input);
  if (created.campaignDir) holdCampaign(created.campaignDir, { key: created.key, runId: created.runId });
  const run = { ...isolate(created, { addWorktree }), mode: 'chat', status: 'chat', chatState: null };
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

function openFollowup(done, note) {
  holdAgain(done);
  const run = { ...done, mode: 'chat', status: 'chat', stage: finalApproval(loadFlow(done.flow)).onReject, chatState: null, reviewedAt: null };
  saveRun(run);
  fs.writeFileSync(briefFile(run), followupBriefOf(run, runChanges(run), note));
  console.log(JSON.stringify(chatLaunch(run)));
}

// Run xong đã nhả campaign; mở lại thì phải giữ lại, trừ khi run khác đã lấy
function holdAgain(run) {
  if (!run.campaignDir) return;
  const holder = heldCampaigns()[run.campaignDir];
  if (holder && holder.key !== run.key) die(`${run.campaignDir} đang bị ${holder.key}/${holder.runId} giữ — xong/abort run đó trước.`);
  holdCampaign(run.campaignDir, run);
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
  console.log(`${run.key} xong — worktree giữ ở ${Object.values(run.worktrees).join(', ') || '—'} để review/commit.`);
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

async function cmdDecide(opts, type) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  if (type === 'reject' && !opts.note) die('reject cần --note "…" để stage sau biết sửa gì.');
  const flow = loadFlow(run.flow);
  if (type === 'reject' && run.status === 'done') {
    holdAgain(run);
    return continueRun(reopenRun(run, flow, opts.note, Date.now()));
  }
  if (!['paused', 'attached'].includes(run.status)) die(`${run.key} đang ${run.status}, không có gì để ${type}.`);
  await continueRun(applyEvent(run, flow, { type, note: opts.note }, Date.now()));
}

async function cmdResume(opts) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  if (run.status !== 'stopped' && run.status !== 'running') die(`${run.key} đang ${run.status} — dùng approve/reject.`);
  const num = (flag) => (opts[flag] ? Number(opts[flag]) : undefined);
  const resumed = { ...resumeRun(run, { budgetUsd: num('budget-usd'), budgetMinutes: num('budget-minutes') }), resumeNote: opts.note };
  const kind = stageOf(loadFlow(run.flow), resumed.stage)?.kind;
  await continueRun(kind === 'pause' ? { ...resumed, status: 'paused' } : resumed);
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
  for (const [top, dir] of Object.entries(run.worktrees ?? {})) removeWorktree({ top, dir, branch: branchOf(run) });
  fs.rmSync(runDir(run.key, run.runId), { recursive: true, force: true });
  const keyDir = path.dirname(runDir(run.key, run.runId));
  if (!fs.readdirSync(keyDir).length) fs.rmdirSync(keyDir);
  console.log(`${run.key} đã huỷ và dọn sạch worktree, nhánh, thư mục run.`);
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

function cmdRoute(opts) {
  if (opts.validate) {
    const problems = listFlows().flatMap((id) => validateFlow(loadFlow(id), { promptsDir: PROMPTS_DIR }).map((e) => `${id}: ${e}`));
    if (problems.length) die(problems.join('\n'));
    return console.log(`${listFlows().length} luồng hợp lệ: ${listFlows().join(', ')}`);
  }
  const signals = gatherSignals({ input: opts._[1] ?? die(USAGE), agentRoot: DATA_ROOT, campaign: opts.campaign });
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
};
await (COMMANDS[opts._[0]] ?? (() => die(USAGE)))();
