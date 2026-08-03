const fs = require('fs');
const path = require('path');
const { file, dir } = require('./paths');
const { readJSON } = require('./fsutil');
const { activityForIssue } = require('./activity');

/**
 * Gom MỌI thứ của MỘT ticket vào 1 response.
 *
 * Vì sao gom: thông tin 1 ticket đang rải 4 chỗ (modal brief, Finder cho `designs/<KEY>`,
 * badge gate chỉ có số đếm, modal commit) — mở panel mà phải gọi 5 API thì panel nào cũng
 * nhấp nháy từng phần.
 */

const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** Chỉ nhận key dạng GW-123 / ADHOC-1 — dùng làm tên folder nên phải sạch */
function safeKey(raw) {
  const key = String(raw || '').trim();
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(key) ? key.toUpperCase() : null;
}

/**
 * Ảnh design dùng được của ticket: CHỈ cấp 1 của `designs/<KEY>/`.
 * Không đệ quy vào `_raw/` — trong đó là zip/PSD gốc (GW-654 riêng nó 3.3GB), không phải
 * ảnh để xem nhanh.
 */
function designImages(key) {
  const root = path.join(dir.designs, key);
  if (!isDir(root)) return [];
  // Không cần khởi tạo `[]`: nhánh catch return ngay, nên tới dòng dùng `names` bên dưới
  // chắc chắn đã được gán trong try — gán trước đó chỉ là useless-assignment.
  let names;
  try {
    names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
  return names
    .filter((n) => IMG_EXT.includes(path.extname(n).toLowerCase()) && !n.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, 'vi'))
    .map((name) => {
      let size = 0;
      try {
        size = fs.statSync(path.join(root, name)).size;
      } catch {
        // File có thể đã bị xoá giữa lúc readdir và lúc stat — giữ size mặc định 0, không chặn danh sách
      }
      return { name, size, url: `/api/design/${key}/${encodeURIComponent(name)}` };
    });
}

/** Đường dẫn ảnh design sau khi đã chặn mọi mưu ra ngoài folder của chính ticket */
function designImagePath(rawKey, rawName) {
  const key = safeKey(rawKey);
  if (!key) return null;
  const root = path.join(dir.designs, key);
  const abs = path.resolve(root, String(rawName || ''));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (!IMG_EXT.includes(path.extname(abs).toLowerCase())) return null;
  return isFile(abs) ? abs : null;
}

/** `dist/` thật của ticket (suy từ state.paths, entry cdn-source) — nguồn cho preview + gate */
function distDirFor(key, state, repos) {
  const issue = (state.issues || {})[key];
  const paths = Array.isArray(issue?.paths) ? issue.paths : [];
  for (const p of paths) {
    const repoRoot = (repos || {})[p.repo];
    if (!repoRoot) continue;
    const candidate = path.join(repoRoot, p.path, 'dist');
    if (isDir(candidate)) return { dist: candidate, repo: p.repo, sub: p.path };
  }
  return null;
}

/** Gate lần cuối (findings ĐẦY ĐỦ, không chỉ số đếm như badge ở bảng) */
function gateFor(key) {
  const p = path.join(dir.gates, key + '.json');
  return isFile(p) ? readJSON(p, null) : null;
}

async function ticketDetail(rawKey) {
  const key = safeKey(rawKey);
  if (!key) return { error: 'key không hợp lệ' };

  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const issue = (state.issues || {})[key];
  if (!issue) return { error: 'không có ticket ' + key + ' trong state.json' };

  const taskDir = path.join(dir.tasks, key);
  const dist = distDirFor(key, state, config.repos || {});

  return {
    key,
    issue,
    site: config.siteUrl || null,
    images: designImages(key),
    gate: gateFor(key),
    activity: await activityForIssue(key, issue, config.repos || {}, config.gitAuthor || ''),
    files: {
      brief: isFile(path.join(taskDir, 'brief.md')),
      questions: isFile(path.join(taskDir, 'questions-for-pm.md')),
      designDir: isDir(path.join(dir.designs, key)),
      taskDir: isDir(taskDir),
    },
    dist: dist ? { repo: dist.repo, sub: dist.sub, previewUrl: `/preview/${key}/` } : null,
  };
}

module.exports = { ticketDetail, designImagePath, distDirFor, safeKey };
