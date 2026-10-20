import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const AGENT_ROOT = path.resolve(import.meta.dirname, '../../..');
const BUILD_SCRIPTS = ['build-optimize', 'build-dev', 'build'];
const BLOCKING_TAIL = 30;
const COMMIT_TYPE = { 'landing-new': 'feat', feature: 'feat', 'landing-fix': 'fix', buglist: 'fix' };
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

const defaultExec = (cmd, args, { cwd } = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? r.error?.message ?? '' };
};

const isCdnSource = (repo) => path.basename(repo) === 'cdn-source';
const tool = (name) => path.join(AGENT_ROOT, 'tools', name);

function findBuildScript(campaignDir, repo) {
  for (let dir = campaignDir; dir.startsWith(repo); dir = path.dirname(dir)) {
    const pkg = path.join(dir, 'package.json');
    if (!fs.existsSync(pkg)) continue;
    const scripts = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts ?? {};
    const script = BUILD_SCRIPTS.find((s) => scripts[s]);
    if (script) return { dir, script };
  }
  return null;
}

function hasPmHook(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() ? hasPmHook(full) : /\.(html|twig)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('pm__')) return true;
  }
  return false;
}

// Mỗi check trả lệnh cần chạy, hoặc {skip} / {error} khi không áp dụng được
const CHECKS = {
  build: ({ campaignDir, repo }) => {
    const found = findBuildScript(campaignDir, repo);
    return found ? { cmd: 'npm', args: ['run', found.script], cwd: found.dir } : { error: 'không có script build' };
  },
  'pm-gate': ({ campaignDir }) =>
    hasPmHook(campaignDir) ? { cmd: 'node', args: [tool('pm-gate.mjs'), '--page', campaignDir] } : { skip: 'không có pm__' },
  'fe-gate': ({ campaignDir, key }) => {
    const dist = path.join(campaignDir, 'dist');
    if (!fs.existsSync(dist)) return { skip: 'chưa có dist/' };
    const design = path.join(AGENT_ROOT, 'designs', key);
    return { cmd: 'node', args: [tool('fe-gate.mjs'), dist, ...(fs.existsSync(design) ? ['--design', design] : [])] };
  },
  'landing-parity': ({ campaignDir, repo }) =>
    isCdnSource(repo) ? { cmd: 'node', args: [tool('landing-parity.mjs'), campaignDir] } : { skip: 'không phải cdn-source' },
  'layout-gate': ({ campaignDir }) => ({ cmd: 'node', args: [tool('layout-gate.mjs'), campaignDir] }),
};

function changedFiles(ctx) {
  const { stdout } = ctx.exec('git', ['status', '--porcelain', '--', ctx.campaignDir], { cwd: ctx.repo });
  const changed = new Set(stdout.split('\n').filter(Boolean).map((line) => line.slice(3).trim()));
  return ctx.files.filter((f) => changed.has(f));
}

export function commitMessage(flowId, planTitle) {
  const title = planTitle.trim().replace(/\.+$/, '').toLowerCase();
  return `(${COMMIT_TYPE[flowId] ?? 'fix'}): ${title}\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>`;
}

function runCommit(ctx) {
  const files = changedFiles(ctx);
  if (files.length === 0) return { check: 'commit', status: 'skipped', blocking: [], note: 'không có file nào vừa sửa trong campaign' };

  const steps = [
    ['add', '--', ...files],
    ['commit', '--only', ...files, '-m', commitMessage(ctx.flowId, ctx.planTitle)],
    ...(isCdnSource(ctx.repo) ? [['pull', '--no-rebase', '--no-edit', 'origin', 'master']] : []),
  ];
  for (const args of steps) {
    const r = ctx.exec('git', args, { cwd: ctx.repo });
    if (r.code !== 0) return { check: 'commit', status: 'error', blocking: tail(r), note: `git ${args[0]} lỗi` };
  }
  return { check: 'commit', status: 'pass', blocking: [], note: files.join(', ') };
}

const tail = (r) => `${r.stdout}\n${r.stderr}`.trim().split('\n').filter(Boolean).slice(-BLOCKING_TAIL);

function runCheck(name, ctx) {
  if (name === 'commit') return runCommit(ctx);
  const plan = CHECKS[name](ctx);
  if (plan.skip) return { check: name, status: 'skipped', blocking: [], note: plan.skip };
  if (plan.error) return { check: name, status: 'error', blocking: [], note: plan.error };

  const r = ctx.exec(plan.cmd, plan.args, { cwd: plan.cwd ?? ctx.repo });
  if (r.code === 0) return { check: name, status: 'pass', blocking: [], note: '' };
  if (r.code === 1) return { check: name, status: 'fail', blocking: tail(r), note: '' };
  return { check: name, status: 'error', blocking: tail(r), note: `exit ${r.code}` };
}

export const GATE_CHECKS = [...Object.keys(CHECKS), 'commit'];

export async function runGates(checks, ctx) {
  const full = { exec: defaultExec, ...ctx };
  const results = [];
  for (const name of checks) {
    const result = runCheck(name, full);
    results.push(result);
    if (result.status === 'error') return { pass: false, error: name, results };
  }
  return { pass: results.every((r) => r.status !== 'fail'), error: null, results };
}
