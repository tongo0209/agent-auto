const fs = require('fs');
const path = require('path');
const { dir } = require('./paths');

/**
 * Backup quay vòng trước MỌI lần console ghi file của agent-auto.
 *
 * agent-auto chưa versioned (không phải git repo) → một lần ghi sai board/state là mất,
 * không revert được. Đây là lưới an toàn tối thiểu, không thay git.
 *
 * Không dùng auto-commit: luật global là không bao giờ tự `git commit`, kể cả local.
 */
const KEEP = 30;

/** Có cả millisecond: 2 lần ghi trong CÙNG một giây thì bản backup trước không bị ghi đè */
function stamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds()) +
    p(d.getMilliseconds(), 3)
  );
}

/**
 * Copy `filePath` vào `.backups/<bucket>/<tên>-<ts><đuôi>`, giữ KEEP bản mới nhất.
 * File chưa tồn tại → không làm gì (ghi lần đầu thì chẳng có gì để cứu).
 * Lỗi backup KHÔNG được chặn nghiệp vụ, nhưng phải trả về false để chỗ gọi biết.
 */
function snapshot(filePath, bucket) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const bucketDir = path.join(dir.backups, bucket);
    fs.mkdirSync(bucketDir, { recursive: true });

    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const target = path.join(bucketDir, `${base}-${stamp()}${ext}`);
    fs.copyFileSync(filePath, target);

    // Dọn bản cũ của CHÍNH file này (bucket có thể chứa nhiều file khác nhau)
    const mine = fs
      .readdirSync(bucketDir)
      .filter((f) => f.startsWith(base + '-') && f.endsWith(ext))
      .sort()
      .reverse();
    for (const old of mine.slice(KEEP)) {
      try {
        fs.unlinkSync(path.join(bucketDir, old));
      } catch {
        // Dọn bản cũ chỉ là dọn dẹp — xoá lỗi (file đang bị khoá, đã bị xoá tay...)
        // không được phép làm hỏng backup vừa ghi thành công ở trên.
      }
    }
    return target;
  } catch {
    return null;
  }
}

/** Ghi atomic: tmp cùng folder rồi rename (đổi tên trong cùng filesystem là nguyên tử) */
function writeAtomic(filePath, content) {
  const tmp = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

/** Append 1 dòng JSON (tạo folder nếu chưa có) — dùng cho *.jsonl của vòng học */
function appendJSONL(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n');
}

module.exports = { snapshot, writeAtomic, appendJSONL };
