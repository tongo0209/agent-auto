const fs = require('fs');
const path = require('path');
const { dir } = require('./paths');
const { listFiles, todayStr } = require('./fsutil');
const { parseNeedYou, toBoardStrings, countStrayBullets } = require('./needyou');

/**
 * Bóc các bullet của một section "## <name>" trong board markdown.
 *
 * CHỈ còn dùng cho `Log` (mỗi dòng log là 1 dòng thật). Mục "Cần bạn" đi qua
 * `lib/needyou.js` vì nó tràn nhiều dòng — hàm này lọc `startsWith('-')` nên chỉ
 * thấy dòng đầu, làm 4/5 mục board 12/8 đứt giữa câu.
 */
function section(text, name) {
  const m = text.match(new RegExp('## ' + name + '\\n([\\s\\S]*?)(\\n## |$)'));
  if (!m) return [];
  return m[1]
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .map((l) => l.replace(/^-\s*(\[.\]\s*)?/, '').trim());
}

function boardPath(date) {
  return path.join(dir.boards, date + '.md');
}

/**
 * Parse checklist markdown → [{text, done}] — tách riêng khỏi `section()` ở trên để dùng
 * chung cho cả board "Cần bạn" (qua readBoard) và `tasks/<KEY>/handoff.md` (route handoff.js).
 * `section()` cũ chỉ trả text (không phân biệt done) nên không tái dùng được thẳng — hàm này
 * KHÔNG đụng vào `section()`/`readBoard` hiện có, chỉ thêm mới.
 */
function parseChecklist(md) {
  return String(md || '')
    .split('\n')
    .filter((l) => /^- \[[ x]\] /.test(l))
    .map((l) => ({ done: l.startsWith('- [x]'), text: l.slice(6).replace(/~~/g, '').trim() }));
}

function listBoardDates() {
  return listFiles(dir.boards, '.md')
    .map((f) => f.replace('.md', ''))
    .sort()
    .reverse();
}

/**
 * Đọc board của ngày chỉ định; không truyền date → board hôm nay,
 * không có board hôm nay → board mới nhất (để console luôn có gì để hiện).
 */
function readBoard(date) {
  let target = date || todayStr();
  if (!fs.existsSync(boardPath(target))) {
    if (date) return { boardDate: null, needYou: [], log: [] };
    const all = listBoardDates();
    if (!all.length) return { boardDate: null, needYou: [], log: [] };
    target = all[0];
  }
  const text = fs.readFileSync(boardPath(target), 'utf8');
  return { boardDate: target, needYou: toBoardStrings(parseNeedYou(text)), log: section(text, 'Log') };
}

function readBoardRaw(date) {
  const p = boardPath(date);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/**
 * Mục "Cần bạn" của MỌI board — nguyên liệu cho `lib/debt.js::buildDebt`.
 * Sắp tăng dần theo ngày để sổ nợ đọc theo thứ tự thời gian tự nhiên.
 */
/**
 * Cache theo DẤU VÂN mtime của thư mục boards, không theo TTL.
 *
 * Bản đầu dùng TTL 30s trong `routes/debt.js` và đo được lỗi thật: tick xong gọi lại
 * `/api/debt` vẫn trả `cached=true` với mục vừa đóng còn nguyên ⇒ UI hiện lại việc vừa tick,
 * bấm lần hai thì 409. TTL không thể đúng ở đây vì chính console là bên ghi board. Dấu vân
 * (tên + mtimeMs từng file) đổi ngay khi `writeAtomic` rename, nên không cần ai nhớ gọi xoá
 * cache — và `/api/alerts` (vốn không cache, poll cùng nhịp) cũng được lợi luôn.
 */
let needYouCache = { sig: null, value: null };

function boardsSignature() {
  return listBoardDates()
    .map((date) => {
      try {
        return date + ':' + fs.statSync(boardPath(date)).mtimeMs;
      } catch {
        return date + ':?';
      }
    })
    .join('|');
}

function readAllNeedYou() {
  const sig = boardsSignature();
  if (needYouCache.sig === sig) return needYouCache.value;
  const value = listBoardDates()
    .slice()
    .reverse()
    .map((date) => {
      const md = readBoardRaw(date) || '';
      return { date, items: parseNeedYou(md), stray: countStrayBullets(md) };
    });
  needYouCache = { sig, value };
  return value;
}

module.exports = { readBoard, readBoardRaw, listBoardDates, parseChecklist, readAllNeedYou };
