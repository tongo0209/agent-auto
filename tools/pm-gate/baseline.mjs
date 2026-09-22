// Tách lỗi mới khỏi lỗi có sẵn ở bản git (D5): chỉ lỗi mới được chặn, lỗi cũ là nợ.
import { spawnSync } from 'node:child_process';
import { dirname, relative, sep } from 'node:path';
import { realpathSync } from 'node:fs';

const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

export function baselineText(file, ref) {
  const real = realpathSync(file);
  const top = git(dirname(real), 'rev-parse', '--show-toplevel');
  if (top.status !== 0) return null;
  const shown = git(top.stdout.trim(), 'show', `${ref}:${relative(top.stdout.trim(), real).split(sep).join('/')}`);
  return shown.status === 0 ? shown.stdout : null;
}

export function splitNew(current, base) {
  const key = (f) => `${f.code}|${f.token}|${f.msg}`;
  const old = new Set(base.map(key));
  return { fresh: current.filter((f) => !old.has(key(f))), preexisting: current.filter((f) => old.has(key(f))) };
}
