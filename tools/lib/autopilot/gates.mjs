import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { statusEntries } from './worktree.mjs';
import { dataRoot } from './store.mjs';

const AGENT_ROOT = path.resolve(import.meta.dirname, '../../..');
const BUILD_SCRIPTS = ['build-optimize', 'build-pro', 'build-dev', 'build'];
const BLOCKING_TAIL = 30;
const COMMIT_TYPE = { 'landing-new': 'feat', 'landing-clone': 'feat', 'gameplay-change': 'feat', feature: 'feat', 'landing-fix': 'fix', buglist: 'fix' };
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const FRESH_LANDING_FLOWS = new Set(['landing-new', 'landing-clone']);

const defaultExec = (cmd, args, { cwd, env } = {}) => {
  const r = spawnSync(cmd, args, { cwd, env: env && { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? r.error?.message ?? '' };
};

const isCdnSource = (repo) => path.basename(repo) === 'cdn-source';
const tool = (name) => path.join(AGENT_ROOT, 'tools', name);
// pm-gate đọc khoá gameplay ở file dự án — phải là bản thật, không phải projects/ rỗng của lab
const pmGateEnv = () => ({ PM_PROJECTS_DIR: path.join(dataRoot(), 'projects') });

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

// Campaign bên vportal2view/new-mainsite là 1 file twig chứ không phải thư mục có package.json
const isTemplateFile = (p) => !fs.statSync(p).isDirectory();

function hasPmHook(dir) {
  if (isTemplateFile(dir)) return fs.readFileSync(dir, 'utf8').includes('pm__');
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() ? hasPmHook(full) : /\.(html|twig)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('pm__')) return true;
  }
  return false;
}

const htmlIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => path.join(dir, f)) : []);
const handoffHtml = (dir) => htmlIn(path.join(dir, 'mainsite'));
const deliverableHtml = (dir) => (handoffHtml(dir).length ? handoffHtml(dir) : htmlIn(path.join(dir, 'dist')));

// Mỗi check trả lệnh cần chạy, hoặc {skip} / {error} khi không áp dụng được
const CHECKS = {
  build: ({ campaignDir, repo }) => {
    if (isTemplateFile(campaignDir)) return { skip: 'file template (twig) — không build ở local' };
    const found = findBuildScript(campaignDir, repo);
    return found ? { cmd: 'npm', args: ['run', found.script], cwd: found.dir } : { error: 'không có script build' };
  },
  'pm-gate': ({ campaignDir }) => {
    if (!hasPmHook(campaignDir)) return { skip: 'không có pm__' };
    return { cmd: 'node', args: [tool('pm-gate.mjs'), ...(isTemplateFile(campaignDir) ? [] : ['--page']), campaignDir], env: pmGateEnv() };
  },
  'fe-gate': ({ campaignDir, key }) => {
    const dist = path.join(campaignDir, 'dist');
    if (!fs.existsSync(dist)) return { skip: 'chưa có dist/' };
    const design = path.join(dataRoot(), 'designs', key);
    return { cmd: 'node', args: [tool('fe-gate.mjs'), dist, ...(fs.existsSync(design) ? ['--design', design] : [])] };
  },
  'landing-parity': ({ campaignDir, repo }) =>
    isCdnSource(repo) ? { cmd: 'node', args: [tool('landing-parity.mjs'), campaignDir] } : { skip: 'không phải cdn-source' },
  'layout-gate': ({ campaignDir }) => ({ cmd: 'node', args: [tool('layout-gate.mjs'), campaignDir] }),
  // pm-gate-handoff nhận campaignDir = folder gt-promotion của ticket
  'pm-gate-handoff': ({ campaignDir }) => {
    const files = handoffHtml(campaignDir);
    return files.length ? { cmd: 'node', args: [tool('pm-gate.mjs'), ...files, '--baseline', 'none'], env: pmGateEnv() } : { skip: 'chưa có mainsite/*.html' };
  },
  // tool tự đọc loại từ file dự án (gameplay mới → popup chung + ref); landing cũ chỉ chặn lỗi so với HEAD lúc trước run
  'check-promotion': ({ campaignDir, flowId }) => {
    const files = deliverableHtml(campaignDir).filter((f) => fs.readFileSync(f, 'utf8').includes('id="popup'));
    if (!files.length) return { skip: 'chưa có mainsite/ hay dist/ *.html có popup' };
    const baseline = FRESH_LANDING_FLOWS.has(flowId) ? [] : ['--baseline', 'HEAD'];
    return { cmd: 'node', args: [tool('check-promotion.mjs'), ...files, ...baseline], env: pmGateEnv() };
  },
};


export function commitMessage(flowId, planTitle) {
  const title = planTitle.trim().replace(/^\(\w+\):\s*/, '').replace(/\.+$/, '').toLowerCase();
  return `(${COMMIT_TYPE[flowId] ?? 'fix'}): ${title}\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>`;
}

const UNMERGED = /^(U.|.U|AA|DD)$/;
const MERGE_STOP = 'repo đang merge dở — xử lý tay (git status) rồi resume; autopilot không tự merge --abort';

// R-GIT-5: chỉ add đúng file run đã sửa trong campaign (bỏ file dở có sẵn lúc bắt đầu), cdn-source pull ngay sau commit.
// Merge dở / pull lỗi / không file nào commit được đều dừng chờ user, không bao giờ qua im lặng
function runCommit(ctx) {
  const git = (args) => ctx.exec('git', args, { cwd: ctx.repo });
  // -uall: liệt kê từng file trong thư mục chưa track
  const status = () => statusEntries(git(['status', '--porcelain', '-z', '-uall']).stdout);
  const stop = (note, blocking = [], extra = {}) => ({ check: 'commit', status: 'error', blocking, note, ...extra });
  const mergeHead = () => {
    const r = git(['rev-parse', '--git-path', 'MERGE_HEAD']);
    return r.code === 0 && fs.existsSync(path.resolve(ctx.repo, r.stdout.trim()));
  };
  const merging = () => mergeHead() || status().some((e) => UNMERGED.test(e.code));
  if (merging()) return stop(MERGE_STOP);
  // stage trước (ui-check) hay build-dev; dist được track nên phải là bản production lúc commit
  for (const scope of ctx.scopes ?? [ctx.campaignDir]) {
    const dir = path.resolve(ctx.repo, scope);
    const found = fs.existsSync(dir) && !isTemplateFile(dir) && findBuildScript(dir, ctx.repo);
    if (!found) continue;
    const r = ctx.exec('npm', ['run', found.script], { cwd: found.dir });
    if (r.code !== 0) return stop(`build ${found.script} lỗi — dist phải là bản production trước khi commit`, tail(r));
  }
  // build production mất vài phút, user có thể đã huỷ run trong lúc đó
  if (ctx.aborted?.()) return stop('run đã bị huỷ trong lúc build — không commit');

  const entries = status();
  const changed = new Set(entries.map((e) => e.path));
  const dirtyAtStart = new Set(ctx.dirty ?? []);
  const scopes = (ctx.scopes ?? [ctx.campaignDir]).map((d) => path.relative(ctx.repo, path.resolve(ctx.repo, d)));
  const inScope = (f) => scopes.some((s) => s === '' || f === s || f.startsWith(`${s}/`));
  // campaign đã bị run khoá: mọi file đổi trong đó (trừ file dở từ trước) là của run, kể cả file agent quên khai
  const files = [...changed].filter((f) => inScope(f) && !dirtyAtStart.has(f));
  const left = ctx.files.filter((f) => changed.has(f) && !files.includes(f)).map((f) => `${f} (${dirtyAtStart.has(f) ? 'dở từ trước khi run bắt đầu' : 'ngoài campaign'})`);
  const deleted = entries.filter((e) => e.code.includes('D') && files.includes(e.path)).map((e) => e.path);
  if (deleted.length) return stop('run làm mất file đã track (thường do build-dev ghi đè dist) — build lại bản production hoặc git restore, rồi resume', deleted);
  if (left.some((f) => f.endsWith('(ngoài campaign)'))) return stop('run sửa file ngoài campaign — commit tay (git add -- <file> && git commit --only) rồi retry để cổng commit nốt file campaign, hoặc goto fix để hoàn tác', left);
  if (!files.length && left.length) return stop('run có sửa file nhưng không file nào commit tự động được — commit tay hoặc skip cổng commit', left);

  let commit = null;
  if (files.length) {
    for (const args of [['add', '--', ...files], ['commit', '--only', ...files, '-m', commitMessage(ctx.flowId, ctx.planTitle)]]) {
      const r = git(args);
      if (r.code !== 0) return stop(`git ${args[0]} lỗi`, tail(r));
    }
    commit = git(['rev-parse', 'HEAD']).stdout.trim();
  }
  const cdn = isCdnSource(ctx.repo);
  if (cdn) {
    const done = commit ? `commit ${commit.slice(0, 9)} đã có, ` : '';
    const staged = status().filter((e) => !' ?'.includes(e.code[0])).map((e) => e.path);
    if (staged.length) return stop(`${done}chưa pull: index có file phiên khác đã stage, pull sẽ bị từ chối — xử lý tay rồi resume`, staged, { commit, pullPending: true });
    const r = git(['pull', '--no-rebase', '--no-edit', 'origin', 'master']);
    if (r.code !== 0) {
      const midMerge = merging();
      return stop(`${done}pull lỗi${midMerge ? ` — ${MERGE_STOP}` : ''}`, tail(r), { commit, pullPending: true, midMerge });
    }
  }
  const dropped = left.length ? ` · bỏ: ${left.join(', ')}` : '';
  if (!commit) return { check: 'commit', status: cdn ? 'pass' : 'skipped', blocking: [], note: `không có file nào vừa sửa trong campaign${cdn ? ' · đã pull origin master' : ''}` };
  return { check: 'commit', status: 'pass', blocking: [], note: `${files.join(', ')}${dropped}`, commit };
}

const tail = (r) => `${r.stdout}\n${r.stderr}`.trim().split('\n').filter(Boolean).slice(-BLOCKING_TAIL);

function runCheck(name, ctx) {
  if (name === 'commit') return runCommit(ctx);
  const plan = CHECKS[name](ctx);
  if (plan.skip) return { check: name, status: 'skipped', blocking: [], note: plan.skip };
  if (plan.error) return { check: name, status: 'error', blocking: [], note: plan.error };

  const r = ctx.exec(plan.cmd, plan.args, { cwd: plan.cwd ?? ctx.repo, env: plan.env });
  if (r.code === 0) return { check: name, status: 'pass', blocking: [], note: '' };
  if (r.code === 1) return { check: name, status: 'fail', blocking: tail(r), note: '' };
  return { check: name, status: 'error', blocking: tail(r), note: `exit ${r.code}` };
}

export const GATE_CHECKS = [...Object.keys(CHECKS), 'commit'];

export async function runGates(checks, ctx) {
  const full = { exec: defaultExec, ...ctx };
  const results = [];
  for (const name of checks) {
    const result = full.campaignDir ? runCheck(name, full) : { check: name, status: 'error', blocking: [], note: 'run chưa có campaignDir' };
    results.push(result);
    if (result.status === 'error') return { pass: false, error: name, results };
  }
  return { pass: results.every((r) => r.status !== 'fail'), error: null, results };
}
