import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const labWritesOn = () => process.env.AUTOPILOT_LAB_WRITES === '1';

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.slice(2).join(' ')}: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout.trim();
}

// node_modules không vào git nên worktree mới không có — mượn của repo thật từ campaign lên tới gốc repo
function linkNodeModules(top, dir, campaignDir) {
  for (let real = campaignDir; real.startsWith(top); real = path.dirname(real)) {
    const source = path.join(real, 'node_modules');
    const link = path.join(dir, path.relative(top, real), 'node_modules');
    if (fs.existsSync(source) && fs.existsSync(path.dirname(link)) && !fs.existsSync(link)) fs.symlinkSync(source, link);
    if (real === top) break;
  }
}

// status --porcelain -z: rename/copy kèm thêm 1 token đường dẫn cũ, không có mã trạng thái
export function statusEntries(stdout) {
  const tokens = stdout.split('\0').filter(Boolean);
  const entries = [];
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i].slice(0, 2);
    entries.push({ code, path: tokens[i].slice(3) });
    if (/[RC]/.test(code)) entries.push({ code, path: tokens[++i] });
  }
  return entries;
}

// Hash nội dung để cổng commit biết run có sửa tiếp file dở từ trước không; file không còn trên đĩa là null
export function fileHashes(top, paths) {
  const present = paths.filter((p) => fs.existsSync(path.join(top, p)));
  const hashes = spawnSync('git', ['-C', top, 'hash-object', '--stdin-paths'], { input: present.join('\n'), encoding: 'utf8' }).stdout.trim().split('\n');
  return Object.fromEntries(paths.map((p) => [p, present.includes(p) ? hashes[present.indexOf(p)] : null]));
}

// Repo gốc mà run làm thẳng trên đó: giữ đường dẫn như người gọi đưa khi nó chính là gốc repo
export function repoState(dir) {
  const real = git(['-C', dir, 'rev-parse', '--show-toplevel']);
  const top = fs.realpathSync(dir) === real ? dir : real;
  const status = spawnSync('git', ['-C', top, 'status', '--porcelain', '-z', '-uall'], { encoding: 'utf8' }).stdout;
  const dirty = statusEntries(status).map((e) => e.path);
  return {
    top,
    branch: git(['-C', top, 'rev-parse', '--abbrev-ref', 'HEAD']),
    head: git(['-C', top, 'rev-parse', 'HEAD']),
    dirty,
    dirtyHashes: fileHashes(top, dirty),
  };
}

export const branchOf = (run) => `autopilot/${run.key}-${run.runId}`;

export function addWorktree({ repo, parentDir, branch, linkDirs = [] }) {
  const top = git(['-C', repo, 'rev-parse', '--show-toplevel']);
  const dir = path.join(parentDir, path.basename(top));
  if (!fs.existsSync(dir)) git(['-C', top, 'worktree', 'add', '-q', dir, '-b', branch]);
  for (const campaignDir of linkDirs.filter((d) => d && fs.existsSync(d)).map((d) => fs.realpathSync(d))) {
    if (campaignDir.startsWith(top)) linkNodeModules(top, dir, campaignDir);
  }
  return { top, dir, base: git(['-C', dir, 'rev-parse', 'HEAD']) };
}

export function removeWorktree({ top, dir, branch }) {
  if (fs.existsSync(dir)) git(['-C', top, 'worktree', 'remove', '--force', dir]);
  spawnSync('git', ['-C', top, 'branch', '-D', branch]);
}

export function toWorktree(worktrees, realPath) {
  if (!realPath) return realPath;
  const top = Object.keys(worktrees ?? {}).find((t) => realPath === t || realPath.startsWith(`${t}${path.sep}`));
  return top ? path.join(worktrees[top], path.relative(top, realPath)) : realPath;
}

export const isInWorktree = (worktrees, p) => Object.values(worktrees ?? {}).some((wt) => p === wt || p?.startsWith(`${wt}${path.sep}`));
