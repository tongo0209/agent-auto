import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const labWritesOn = () => process.env.AUTOPILOT_LAB_WRITES === '1';

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.slice(2).join(' ')}: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout.trim();
}

export function addWorktree({ repo, parentDir, branch }) {
  const top = git(['-C', repo, 'rev-parse', '--show-toplevel']);
  const dir = path.join(parentDir, path.basename(top));
  if (!fs.existsSync(dir)) git(['-C', top, 'worktree', 'add', '-q', dir, '-b', branch]);
  return { top, dir };
}

export function toWorktree(worktrees, realPath) {
  if (!realPath) return realPath;
  const top = Object.keys(worktrees ?? {}).find((t) => realPath === t || realPath.startsWith(`${t}${path.sep}`));
  return top ? path.join(worktrees[top], path.relative(top, realPath)) : realPath;
}

export const isInWorktree = (worktrees, p) => Object.values(worktrees ?? {}).some((wt) => p === wt || p?.startsWith(`${wt}${path.sep}`));
