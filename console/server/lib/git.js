const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// git log --shortstat phải diff từng commit: một tháng nặng (40+ file/commit) mất ~5s
const GIT_TIMEOUT = 25000;

function run(repoPath, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', repoPath, ...args], { timeout: GIT_TIMEOUT, maxBuffer: 8e6 }, (err, stdout) =>
      resolve(err ? null : stdout)
    );
  });
}

function isRepo(repoPath) {
  return Boolean(repoPath) && fs.existsSync(path.join(repoPath, '.git'));
}

/**
 * Commit CỦA MỘT NGƯỜI trên một repo, trong khoảng [since, until).
 *
 * - `author` nên là EMAIL: git khớp cả trường name và email, nên email bắt được mọi tên máy
 *   (user có cả `tont` và `tont-mac` cùng email) và không lỡ khớp tên người khác.
 * - `noMerges`: bỏ merge commit khỏi danh sách việc thật (ở repo này merge chiếm ~17%,
 *   toàn dạng "Merge branch 'master' of gitlab…" — không phản ánh công việc).
 * - `--shortstat` đi kèm nên output xen kẽ: dòng "hash|date|subject" rồi dòng thống kê.
 */
async function commitsByAuthor(repoName, repoPath, author, { since, until, noMerges = true }) {
  if (!isRepo(repoPath)) return [];
  const args = ['log', '--author=' + author, '--date=format:%Y-%m-%d %H:%M', '--pretty=%h|%ad|%s', '--shortstat'];
  if (noMerges) args.push('--no-merges');
  if (since) args.push('--since=' + since);
  if (until) args.push('--until=' + until);

  const out = await run(repoPath, args);
  if (!out) return [];

  const commits = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.includes('|')) {
      const [hash, date, ...rest] = line.split('|');
      current = { repo: repoName, hash, date, subject: rest.join('|'), stat: '', files: 0, added: 0, removed: 0 };
      commits.push(current);
    } else if (current && /file(s)? changed/.test(line)) {
      current.stat = line.trim();
      const f = line.match(/(\d+) file/);
      const a = line.match(/(\d+) insertion/);
      const d = line.match(/(\d+) deletion/);
      current.files = f ? +f[1] : 0;
      current.added = a ? +a[1] : 0;
      current.removed = d ? +d[1] : 0;
    }
  }
  return commits;
}

/** Đếm merge commit của người đó trong khoảng — để báo minh bạch phần đã loại khỏi danh sách */
async function countMerges(repoPath, author, { since, until }) {
  if (!isRepo(repoPath)) return 0;
  const args = ['log', '--author=' + author, '--merges', '--oneline'];
  if (since) args.push('--since=' + since);
  if (until) args.push('--until=' + until);
  const out = await run(repoPath, args);
  return out ? out.split('\n').filter(Boolean).length : 0;
}

/** Commit mới nhất đụng vào một subpath (dùng cho panel gt-promotion) */
async function lastTouch(repoPath, subPath) {
  if (!isRepo(repoPath)) return null;
  const out = await run(repoPath, ['log', '-1', '--date=format:%Y-%m-%d %H:%M', '--pretty=%h|%ad|%an|%s', '--', subPath]);
  if (!out || !out.trim()) return null;
  const [hash, date, author, ...rest] = out.trim().split('|');
  return { hash, date, author, subject: rest.join('|') };
}

module.exports = { run, isRepo, commitsByAuthor, countMerges, lastTouch };
