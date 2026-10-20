#!/usr/bin/env node
// autopilot — chạy ticket qua luồng khai báo trong flows/, mỗi stage một `claude -p`. Spec: docs/superpowers/specs/2026-10-20-autopilot-design.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRun, applyEvent, resumeRun, stageOf } from './lib/autopilot/engine.mjs';
import { drive } from './lib/autopilot/driver.mjs';
import { loadFlow, listFlows, validateFlow, PROMPTS_DIR } from './lib/autopilot/flows.mjs';
import { gatherSignals } from './lib/autopilot/signals.mjs';
import { route, loadRules } from './lib/autopilot/router.mjs';
import { newRunId, loadRun, listRuns, saveRun, runsDir, pauseFile } from './lib/autopilot/store.mjs';
import { acquire, release, holdCampaign, releaseCampaign, heldCampaigns, isInterrupted } from './lib/autopilot/lock.mjs';
import { formatStatus } from './lib/autopilot/format.mjs';

const AGENT_ROOT = path.resolve(import.meta.dirname, '..');
// worktree lab không có state.json/config.json (dữ liệu ngoài git) nên đọc của repo chính
const MAIN_ROOT = path.join(os.homedir(), 'VNG', 'agent-auto');
const DATA_ROOT = process.env.AUTOPILOT_DATA_ROOT || (fs.existsSync(path.join(AGENT_ROOT, 'state.json')) ? AGENT_ROOT : MAIN_ROOT);
const USAGE = `Dùng:
  autopilot run <KEY|link> [--flow id] [--campaign dir] [--budget-usd n] [--bg]
  autopilot status [KEY]
  autopilot approve <KEY> [--note "…"]
  autopilot reject <KEY> --note "…"
  autopilot pause <KEY>    (chạy xong bước hiện tại rồi dừng; resume để chạy tiếp)
  autopilot resume <KEY> [--budget-usd n] [--budget-minutes n]   (dừng vì budget mà không truyền → tự nới 1.5×)
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
    if (argv[i] === '--bg' || argv[i] === '--validate') opts[argv[i].slice(2)] = true;
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

async function cmdRun(opts, argv) {
  const input = opts._[1] ?? die(USAGE);
  if (opts.bg) return startBackground(argv);

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
    repo, campaignDir: target.campaignDir, campaignDirs: target.campaignDirs, handoffDir: target.handoffDir, cloneSource: signals.cloneSource, sheetKind: signals.sheetKind, repos: [repo, ...target.repos], now: now.getTime(),
  });
  if (opts['budget-usd']) run.budget.usd = Number(opts['budget-usd']);
  console.log(`▶ ${run.key} → ${flow.id} (${decided.reason})`);
  await continueRun(run, input);
}

function mustLoad(key) {
  return loadRun(key) ?? die(`Chưa có run nào cho ${key}`);
}

async function cmdDecide(opts, type) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  if (!['paused', 'attached'].includes(run.status)) die(`${run.key} đang ${run.status}, không có gì để ${type}.`);
  if (type === 'reject' && !opts.note) die('reject cần --note "…" để stage sau biết sửa gì.');
  const flow = loadFlow(run.flow);
  await continueRun(applyEvent(run, flow, { type, note: opts.note }, Date.now()));
}

async function cmdResume(opts) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  if (run.status !== 'stopped' && run.status !== 'running') die(`${run.key} đang ${run.status} — dùng approve/reject.`);
  const num = (flag) => (opts[flag] ? Number(opts[flag]) : undefined);
  const resumed = resumeRun(run, { budgetUsd: num('budget-usd'), budgetMinutes: num('budget-minutes') });
  const kind = stageOf(loadFlow(run.flow), resumed.stage)?.kind;
  await continueRun(kind === 'pause' ? { ...resumed, status: 'paused' } : resumed);
}

function cmdPause(opts) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  if (run.status !== 'running') die(`${run.key} đang ${run.status}, không có gì để tạm dừng.`);
  if (isInterrupted(run)) die(`${run.key} đã bị ngắt (không còn process chạy) — dùng resume để chạy tiếp.`);
  fs.writeFileSync(pauseFile(run.key, run.runId), '');
  console.log(`${run.key} sẽ dừng sau bước ${run.stage} đang chạy.`);
}

function cmdAbort(opts) {
  const run = mustLoad(opts._[1] ?? die(USAGE));
  saveRun({ ...run, status: 'stopped', stopReason: 'aborted' });
  releaseCampaign(run);
  console.log(`${run.key} đã dừng (aborted).`);
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
  status: () => cmdStatus(opts),
  approve: () => cmdDecide(opts, 'approve'),
  reject: () => cmdDecide(opts, 'reject'),
  pause: () => cmdPause(opts),
  resume: () => cmdResume(opts),
  abort: () => cmdAbort(opts),
  route: () => cmdRoute(opts),
};
await (COMMANDS[opts._[0]] ?? (() => die(USAGE)))();
