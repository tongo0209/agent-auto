const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { isRepo, run } = require('./git');

/**
 * Diff đang chờ review, gom theo TICKET (không theo repo).
 *
 * Vì sao cần: 2 ticket đã `xong-có-verify` từ 31/7 vẫn nằm chờ vì muốn review phải mở
 * terminal khác, cd, git diff, tự soạn commit message. Panel này bỏ 3 bước đầu; bước cuối
 * (commit) vẫn do user bấm Enter — console KHÔNG tự commit.
 */
const TIMEOUT = 20000;

/** Như git.run nhưng KHÔNG coi exit≠0 là lỗi (git diff --no-index trả 1 khi có khác biệt) */
function runRaw(repoPath, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', repoPath, ...args], { timeout: TIMEOUT, maxBuffer: 2e7 }, (err, stdout) =>
      resolve(stdout || (err && err.stdout) || '')
    );
  });
}

/**
 * Kiểm tra repo + path do client gửi lên.
 * Chỉ chấp nhận repo có TÊN khai trong config.repos, và path nằm trong repo đó —
 * console không được thành lỗ hổng đọc file tuỳ ý trên máy.
 */
function resolveSafe(repos, repoName, subPath) {
  const repoPath = (repos || {})[repoName];
  if (!repoPath) return { error: 'repo không có trong config.repos: ' + repoName };
  const abs = path.resolve(repoPath, subPath || '.');
  if (abs !== repoPath && !abs.startsWith(repoPath + path.sep)) return { error: 'path ra ngoài repo: ' + subPath };
  return { repoPath, abs };
}

const CODE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|scss|sass|less|css|twig|html?|json|md|ya?ml|php|py|sh|txt)$/i;

function countLines(abs) {
  try {
    if (!CODE_EXT.test(abs) || fs.statSync(abs).size > 2e6) return null;
    return fs.readFileSync(abs, 'utf8').split('\n').length;
  } catch {
    return null;
  }
}

/** Bóc `git status --porcelain` → file + trạng thái đọc được bằng tiếng Việt */
function parseStatus(out) {
  const files = [];
  for (const line of (out || '').split('\n')) {
    if (line.length < 4) continue;
    const xy = line.slice(0, 2);
    let file = line.slice(3);
    if (file.includes(' -> ')) file = file.split(' -> ')[1]; // rename
    file = file.replace(/^"|"$/g, '');
    const untracked = xy === '??';
    files.push({
      file,
      xy,
      untracked,
      staged: !untracked && xy[0] !== ' ' && xy[0] !== '?',
      label: untracked ? 'mới' : xy.includes('D') ? 'xoá' : xy.includes('A') ? 'thêm' : 'sửa',
    });
  }
  return files;
}

/** numstat của cả staged + unstaged (git diff HEAD) → map file → {added, deleted} */
function parseNumstat(out) {
  const map = {};
  for (const line of (out || '').split('\n')) {
    const [a, d, f] = line.split('\t');
    if (!f) continue;
    map[f] = { added: Number(a) || 0, deleted: Number(d) || 0 };
  }
  return map;
}

/** Một (repo, subpath) → danh sách file đang đổi */
async function reviewForPath(repos, repoName, subPath) {
  const safe = resolveSafe(repos, repoName, subPath);
  if (safe.error) return { repo: repoName, path: subPath, error: safe.error, files: [] };
  const { repoPath, abs } = safe;

  if (!isRepo(repoPath)) return { repo: repoName, path: subPath, error: 'không phải git repo', files: [] };
  if (!fs.existsSync(abs)) return { repo: repoName, path: subPath, missing: true, files: [] };

  const [statusOut, numstatOut, branchOut, unpushedOut] = await Promise.all([
    run(repoPath, ['status', '--porcelain', '--', subPath]),
    run(repoPath, ['diff', 'HEAD', '--numstat', '--', subPath]),
    run(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
    // Việc còn lại thường KHÔNG phải "sửa tiếp" mà là "đã commit, chưa push" — panel phải
    // thấy được cả hai, không thì mở ra trống trơn trong khi vẫn còn việc phải làm.
    run(repoPath, ['log', '@{u}..HEAD', '--date=format:%Y-%m-%d %H:%M', '--pretty=%h|%ad|%s', '--', subPath]),
  ]);

  const nums = parseNumstat(numstatOut);
  const files = parseStatus(statusOut).map((f) => {
    const n = nums[f.file];
    if (n) return { ...f, added: n.added, deleted: n.deleted };
    // File chưa track: numstat không có → đếm dòng để vẫn thấy được khối lượng
    const lines = f.untracked ? countLines(path.join(repoPath, f.file)) : null;
    return { ...f, added: lines === null ? null : lines, deleted: 0 };
  });

  const unpushed = (unpushedOut || '')
    .split('\n')
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [hash, date, ...rest] = l.split('|');
      return { hash, date, subject: rest.join('|') };
    });

  return {
    repo: repoName,
    path: subPath,
    branch: (branchOut || '').trim(),
    files,
    unpushed,
    added: files.reduce((s, f) => s + (f.added || 0), 0),
    deleted: files.reduce((s, f) => s + (f.deleted || 0), 0),
  };
}

/** Gom theo ticket: 1 ticket có thể có nhiều (repo, path) */
async function reviewForIssues(state, repos) {
  const out = [];
  for (const [key, issue] of Object.entries(state.issues || {})) {
    const paths = Array.isArray(issue.paths) ? issue.paths : [];
    if (!paths.length) continue;
    const parts = await Promise.all(paths.map((p) => reviewForPath(repos, p.repo, p.path)));
    const dirty = parts.reduce((s, p) => s + p.files.length, 0);
    const unpushed = parts.reduce((s, p) => s + (p.unpushed ? p.unpushed.length : 0), 0);
    out.push({
      key,
      summary: issue.summary || '',
      phase: issue.phase,
      dirty,
      unpushed,
      parts,
    });
  }
  // Ticket có việc lên trước: sửa chưa commit trước, rồi commit chưa push
  return out.sort((a, b) => b.dirty - a.dirty || b.unpushed - a.unpushed);
}

/** Diff của 1 file — file chưa track thì so với /dev/null để vẫn xem được nội dung */
async function diffFile(repos, repoName, filePath) {
  const safe = resolveSafe(repos, repoName, filePath);
  if (safe.error) return { error: safe.error };
  const { repoPath, abs } = safe;
  if (!isRepo(repoPath)) return { error: 'không phải git repo' };

  const tracked = await run(repoPath, ['ls-files', '--error-unmatch', '--', filePath]);
  const text = tracked
    ? await runRaw(repoPath, ['diff', 'HEAD', '--', filePath])
    : await runRaw(repoPath, ['diff', '--no-index', '--', '/dev/null', abs]);

  return { text: text || '(không có thay đổi nào git thấy được)' };
}

module.exports = { reviewForIssues, diffFile, resolveSafe };
