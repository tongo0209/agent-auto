// Thay đổi của run để review: commit run đã tạo (run cũ: nhánh autopilot so với điểm tách), chỉ đọc git
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { branchOf } from './worktree.mjs';

const MAX_DIFF_CHARS = 60_000;

const git = (top, args) => spawnSync('git', ['-C', top, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.trim();

function fileDiffs(top, base, branch) {
  const fields = git(top, ['diff', '--name-status', '-z', base, branch]).split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < fields.length; ) {
    const status = fields[i][0];
    const pathCount = status === 'R' || status === 'C' ? 2 : 1;
    files.push({ path: fields[i + pathCount], status });
    i += pathCount + 1;
  }
  const chunks = git(top, ['diff', '--no-color', '--no-ext-diff', base, branch]).split(/^(?=diff --git )/m).filter(Boolean);
  return files.map((f, i) => ({ ...f, diff: chunks[i].slice(0, MAX_DIFF_CHARS), truncated: chunks[i].length > MAX_DIFF_CHARS }));
}

// Repo gốc có commit của phiên khác chen giữa: chỉ lấy đúng commit run ghi lại, file trùng thì nối diff
function commitChanges(run, top) {
  const commits = (run.commits ?? []).filter((c) => c.repo === top).map(({ sha }) => ({ sha, subject: git(top, ['log', '-1', '--format=%s', sha]) }));
  const byPath = new Map();
  for (const file of commits.flatMap(({ sha }) => fileDiffs(top, `${sha}^`, sha))) {
    const seen = byPath.get(file.path);
    byPath.set(file.path, seen ? { ...seen, diff: `${seen.diff}\n${file.diff}`, truncated: seen.truncated || file.truncated } : file);
  }
  return { repo: top, name: path.basename(top), worktree: top, branch: run.workBranch[top], commits, files: [...byPath.values()], cherryPick: null };
}

export function runChanges(run) {
  if (!Object.keys(run.worktrees ?? {}).length) return Object.keys(run.workBranch ?? {}).map((top) => commitChanges(run, top));
  const branch = branchOf(run);
  return Object.entries(run.worktrees ?? {}).map(([top, worktree]) => {
    // run tạo trước khi lưu base: điểm tách = merge-base với HEAD hiện tại của repo gốc
    const base = run.bases?.[top] ?? git(top, ['merge-base', branch, 'HEAD']);
    const commits = git(top, ['log', '--reverse', '--format=%H%x09%s', `${base}..${branch}`]).split('\n').filter(Boolean).map((line) => {
      const [sha, subject] = line.split('\t');
      return { sha, subject };
    });
    return {
      repo: top, name: path.basename(top), worktree, branch, commits,
      files: commits.length ? fileDiffs(top, base, branch) : [],
      cherryPick: commits.length ? `git -C ${top} cherry-pick ${commits.map((c) => c.sha).join(' ')}` : null,
    };
  });
}
