const fs = require('fs');
const path = require('path');
const { run, isRepo } = require('./git');

/**
 * Chỉ tính effort trên FILE CODE VIẾT TAY.
 *
 * Đo thật trên repo này: commit khởi tạo 1 campaign = 120 file/+13.707 dòng nếu tính hết,
 * phần lớn là build output trong `dist/` và ảnh.
 *
 * ⚠ KHÔNG loại theo folder `assets/` — trong cấu trúc webpack của repo này SOURCE NẰM TRONG
 * `assets/` (`assets/frame1/frame1.js|scss|twig`). Loại `assets/` là xoá sạch code viết tay
 * (đã trả giá 1 lần: 3 commit logic hiện +0/-0). Vì vậy dùng WHITELIST đuôi file code.
 */
const CODE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|vue|svelte|scss|sass|less|css|twig|html?|json|md|ya?ml|php|py|sh)$/i;
const EXCLUDE = [/(^|\/)dist\//, /node_modules\//, /package-lock\.json$/, /\.min\.[a-z]+$/, /html-validation-report\.txt$/];

/** true = không tính vào effort (build output, ảnh, binary, lock…) */
const isNoise = (file) => EXCLUDE.some((re) => re.test('/' + file)) || !CODE_EXT.test(file);

/**
 * Đọc commit của một ticket trong MỘT path.
 * --numstat để tách được dòng source vs dòng build; --no-merges vì merge không phải việc thật.
 */
async function commitsForPath(repoName, repoPath, subPath, author) {
  if (!isRepo(repoPath)) return { commits: [], pathMissing: false };
  if (!fs.existsSync(path.join(repoPath, subPath))) return { commits: [], pathMissing: true };

  const out = await run(repoPath, [
    'log',
    '--author=' + author,
    '--no-merges',
    '--date=format:%Y-%m-%d %H:%M',
    '--pretty=@@|%h|%ad|%s',
    '--numstat',
    '--',
    subPath,
  ]);
  if (!out) return { commits: [], pathMissing: false };

  const commits = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('@@|')) {
      const [, hash, date, ...rest] = line.split('|');
      current = {
        repo: repoName,
        hash,
        date,
        subject: rest.join('|'),
        sourceAdded: 0,
        sourceRemoved: 0,
        sourceFiles: 0,
        rawFiles: 0,
      };
      commits.push(current);
      continue;
    }
    if (!current || !line.trim()) continue;
    const [added, removed, file] = line.split('\t');
    if (file === undefined) continue;
    current.rawFiles += 1;
    if (isNoise(file)) continue;
    current.sourceFiles += 1;
    current.sourceAdded += Number(added) || 0; // '-' cho file binary → 0
    current.sourceRemoved += Number(removed) || 0;
  }
  return { commits, pathMissing: false };
}

/** Gộp mọi path của một ticket thành 1 bản ghi hoạt động */
async function activityForIssue(key, issue, repos, author) {
  const paths = Array.isArray(issue.paths) ? issue.paths : [];
  if (!paths.length) return { key, linked: false, commits: 0, commitList: [] };

  const results = await Promise.all(
    paths.map((p) => commitsForPath(p.repo, repos[p.repo], p.path, author).then((r) => ({ ...r, def: p })))
  );

  const commitList = results
    .flatMap((r) => r.commits)
    .sort((a, b) => b.date.localeCompare(a.date));
  const days = new Set(commitList.map((c) => c.date.slice(0, 10)));

  return {
    key,
    linked: true,
    pathMissing: results.some((r) => r.pathMissing),
    paths,
    commits: commitList.length,
    activeDays: days.size,
    sourceAdded: commitList.reduce((s, c) => s + c.sourceAdded, 0),
    sourceRemoved: commitList.reduce((s, c) => s + c.sourceRemoved, 0),
    firstCommit: commitList.length ? commitList[commitList.length - 1].date : null,
    lastCommit: commitList[0] || null,
    commitList,
  };
}

module.exports = { activityForIssue, commitsForPath, isNoise };
