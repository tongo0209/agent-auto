const fs = require('fs');
const path = require('path');
const { run, isRepo } = require('./git');

/**
 * Phần I/O của việc kiểm tra bàn giao: chạy git + liệt kê file trong `<promoFolder>/mainsite/`.
 * Luật quyết định "đã bàn giao chưa" nằm ở `lib/deliver.js` (thuần, test được) — file này chỉ
 * đi lấy nguyên liệu.
 */

const SUB = 'mainsite';

/** Fetch best-effort: máy không vào được gitlab nội bộ (chưa VPN) thì vẫn soi được origin/<branch> cũ */
async function fetchQuiet(repoPath, branch) {
  const out = await run(repoPath, ['fetch', '--quiet', 'origin', branch]);
  return out !== null;
}

/**
 * @returns {Promise<{ok:boolean, error?:string, branch?:string, fetched?:boolean,
 *                    files?:string[], remoteLog?:string, dirty?:string, folder?:string}>}
 */
async function scanPromo(repoPath, promoFolder) {
  if (!isRepo(repoPath)) return { ok: false, error: 'chưa cấu hình repo gt-promotion-template trong config.json' };

  const rel = path.posix.join(promoFolder, SUB);
  const abs = path.join(repoPath, promoFolder, SUB);

  let files;
  try {
    files = fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => d.name);
  } catch {
    // Folder chưa tồn tại = chưa chép gì. Không phải lỗi hệ thống, để evaluateDelivery kết luận.
    files = [];
  }

  const head = await run(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = (head || 'develop').trim() || 'develop';
  const fetched = await fetchQuiet(repoPath, branch);

  // %cI = ISO 8601 có timezone; subject để nguyên (có thể chứa dấu | — deliver.js tách 2 lần đầu)
  const remoteLog = await run(repoPath, [
    'log',
    '-1',
    '--format=%h|%cI|%s',
    `origin/${branch}`,
    '--',
    rel,
  ]);

  const dirty = await run(repoPath, ['status', '--porcelain', '--', rel]);

  return {
    ok: true,
    branch,
    fetched,
    folder: rel,
    files,
    remoteLog: (remoteLog || '').trim(),
    dirty: (dirty || '').trim(),
  };
}

/** Link web GitLab tới folder đã bàn giao — dựng từ remote thật, không hardcode host */
async function webUrl(repoPath, branch, relFolder) {
  const remote = await run(repoPath, ['remote', 'get-url', 'origin']);
  const raw = (remote || '').trim();
  if (!raw) return null;

  // git@host:group/repo.git  |  https://host/group/repo.git
  const m = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/) || raw.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  return `https://${m[1]}/${m[2]}/-/tree/${branch}/${relFolder}`;
}

module.exports = { scanPromo, webUrl, SUB };
