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

// Chép thêm 1 khối đang sai = lỗi mới dù cùng mã/token/câu: so cả số phần tử dính lỗi.
export function splitNew(current, base) {
  const key = (f) => `${f.code}|${f.token}|${f.msg}`;
  const oldCount = new Map(base.map((f) => [key(f), f.lines.length]));
  const isOld = (f) => oldCount.has(key(f)) && f.lines.length <= oldCount.get(key(f));
  return { fresh: current.filter((f) => !isOld(f)), preexisting: current.filter(isOld) };
}
