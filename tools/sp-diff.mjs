#!/usr/bin/env node
/* sp-diff.mjs — SO 2 MANIFEST NGUỒN (cũ ↔ mới) để biết designer có sửa/thêm/xoá gì.
 *
 * Usage:
 *   node sp-diff.mjs <manifest-cũ.json> <manifest-mới.json> [--json] [--todo]
 *
 * Exit code:  0 = NGUỒN KHÔNG ĐỔI   1 = CÓ THAY ĐỔI   2 = lỗi dùng sai
 *
 * VÌ SAO CẦN, KHÁC GÌ sp-coverage.mjs:
 *   sp-coverage so NGUỒN ↔ LOCAL → trả lời "mình đã tải đủ chưa".
 *   sp-diff     so NGUỒN ↔ NGUỒN → trả lời "designer có up bản mới không".
 *   Hai câu khác nhau: link design change liên tục thì coverage vẫn exit 0 với manifest CŨ
 *   (đủ so với ảnh chụp cũ) trong khi nguồn đã có bản mới → phải quét lại rồi diff manifest.
 *
 * So theo `rel` (nguyên văn, KHÔNG normalize NFC/NFD — nguồn trả NFD, normalize là 404 khi tải).
 * Một file tính là ĐỔI khi lệch `length` HOẶC lệch `modified`.
 * `--todo` in danh sách rel cần tải lại (added + changed) để đổ vào TODO của sp-fetch.js.
 */
import { readFileSync } from "node:fs";

const [, , oldPath, newPath, ...flags] = process.argv;
if (!oldPath || !newPath) {
  console.error("Usage: sp-diff.mjs <manifest-cũ.json> <manifest-mới.json> [--json] [--todo]");
  process.exit(2);
}
const asJson = flags.includes("--json");
const todoOnly = flags.includes("--todo");

const load = p => {
  const m = JSON.parse(readFileSync(p, "utf8"));
  if (!Array.isArray(m.files)) throw new Error(`${p}: không có mảng files`);
  return m;
};
let A, B;
try { A = load(oldPath); B = load(newPath); }
catch (e) { // path sai / manifest hỏng = exit 2, đừng để throw thoát mã 1 giả dạng "có thay đổi"
  console.error(`sp-diff: không đọc được manifest — ${e.message}`);
  process.exit(2);
}

/* CHẶN MANIFEST HỎNG — đây là lưới an toàn quan trọng nhất của file này.
   Ca thật 11/8 17:12: tab Chrome treo, `javascript_tool` báo timeout NHƯNG script vẫn chạy tiếp
   trong trang và ghi ra manifest `count: 0` + `errors: ["... Failed to fetch"]`. Diff đọc phải
   bản đó → báo "XOÁ 72 file / 843 MB", tức là trông y như designer vừa xoá sạch cả kho design.
   Nếu cứ thế xử lý tiếp thì rất dễ ra quyết định phá hoại (dọn kho local cho "khớp nguồn").
   ⇒ Quét lỗi hoặc quét ra 0 file KHÔNG BAO GIỜ là kết luận hợp lệ: thoát mã 2 (lỗi), không phải
   1 (có thay đổi). Muốn xác nhận nguồn trống thật thì phải quét lại bằng tab mới, 0 lỗi. */
if (B.errors && B.errors.length) {
  console.error(`\n🚨 MANIFEST MỚI CÓ LỖI QUÉT (${B.errors.length}) — KHÔNG dùng để diff:`);
  for (const e of B.errors.slice(0, 5)) console.error(`   ${e}`);
  console.error(`   → tab có thể đã treo/mất session. Mở tab MỚI, quét lại rồi chạy lại.\n`);
  process.exit(2);
}
if (B.count === 0 && A.count > 0) {
  console.error(`\n🚨 MANIFEST MỚI RỖNG (0 file) trong khi bản cũ có ${A.count} file — gần như chắc chắn là`);
  console.error(`   quét hỏng chứ không phải designer xoá kho. KHÔNG diff, KHÔNG xoá gì ở local.`);
  console.error(`   → quét lại bằng tab mới; nếu vẫn 0 file và 0 lỗi thì mới hỏi designer.\n`);
  process.exit(2);
}

const idx = m => new Map(m.files.map(f => [f.rel, f]));
const a = idx(A), b = idx(B);

const added = [], removed = [], changed = [], same = [];
for (const [rel, f] of b) {
  const old = a.get(rel);
  if (!old) added.push(f);
  else if (old.length !== f.length || old.modified !== f.modified)
    changed.push({ ...f, oldLength: old.length, oldModified: old.modified });
  else same.push(f);
}
for (const [rel, f] of a) if (!b.has(rel)) removed.push(f);

// Cảnh báo cấu trúc: cùng ticket mà ROOT/SITE khác nhau = designer đổi tên/di chuyển folder,
// hoặc mình quét sai chỗ. Đừng im lặng — im lặng ở đây là mất cả bản design mới.
const rootChanged = A.root !== B.root || A.site !== B.site;

/* FILE 0 BYTE = ĐANG UP DỞ, KHÔNG PHẢI FILE THẬT.
   Gặp thật 11/8 08:28: PSD/6_Wish.psd hiện `Length: 0`, TimeLastModified cách lúc quét 28 giây
   — SharePoint tạo entry trước rồi mới đẩy nội dung. Nguy hiểm ở chỗ sp-coverage so theo
   (tên + size): tải về 1 file rỗng thì 0 == 0 ⇒ coverage PASS trong khi kho có file RỖNG.
   ⇒ Tách hẳn ra khỏi danh sách tải, báo riêng, và KHÔNG cho pass (còn việc phải quay lại). */
const uploading = [...added, ...changed].filter(f => f.length === 0);
const changedSet = [...added, ...changed].filter(f => f.length > 0);
const pass = changedSet.length === 0 && removed.length === 0 && !rootChanged && uploading.length === 0;

if (todoOnly) {
  for (const f of changedSet) console.log(f.rel);
  process.exit(pass ? 0 : 1);
}
if (asJson) {
  console.log(JSON.stringify({
    pass, key: B.key, uploading,
    scannedAt: { old: A.scannedAt, new: B.scannedAt },
    rootChanged, root: { old: A.root, new: B.root },
    counts: { old: A.count, new: B.count, added: added.length, removed: removed.length, changed: changed.length, same: same.length },
    bytes: { old: A.totalBytes, new: B.totalBytes },
    added, removed, changed,
  }, null, 2));
  process.exit(pass ? 0 : 1);
}

const mb = x => (x / 1048576).toFixed(1) + " MB";
const sum = arr => arr.reduce((s, f) => s + f.length, 0);
console.log(`\n🔍 ${B.key} — diff NGUỒN ↔ NGUỒN`);
console.log(`   cũ  : ${A.count} file / ${mb(A.totalBytes)}   (quét ${A.scannedAt})`);
console.log(`   mới : ${B.count} file / ${mb(B.totalBytes)}   (quét ${B.scannedAt})`);
if (rootChanged) {
  console.log(`\n🚨 ROOT/SITE ĐỔI — designer đổi tên hoặc di chuyển folder:`);
  console.log(`   cũ  : ${A.site}${A.root}`);
  console.log(`   mới : ${B.site}${B.root}`);
}
if (added.length) {
  console.log(`\n➕ THÊM ${added.length} file / ${mb(sum(added))}:`);
  for (const f of added) console.log(`   ${f.rel}  ${mb(f.length)}  (${f.modified})`);
}
if (changed.length) {
  console.log(`\n♻️  SỬA ${changed.length} file / ${mb(sum(changed))}:`);
  for (const f of changed)
    console.log(`   ${f.rel}  ${f.oldLength}→${f.length} byte  ${f.oldModified}→${f.modified}`);
}
if (removed.length) {
  console.log(`\n➖ XOÁ ${removed.length} file / ${mb(sum(removed))}:`);
  for (const f of removed) console.log(`   ${f.rel}`);
}
if (uploading.length) {
  console.log(`\n⏳ ĐANG UP DỞ ${uploading.length} file (0 byte trên nguồn) — CHƯA tải, quét lại sau:`);
  for (const f of uploading) console.log(`   ${f.rel}  (mốc ${f.modified})`);
}
console.log(pass
  ? `\n✅ NGUỒN KHÔNG ĐỔI — ${same.length}/${B.count} file y nguyên\n`
  : `\n⚠ CÓ THAY ĐỔI — cần tải lại ${changedSet.length} file / ${mb(sum(changedSet))}\n`);
process.exit(pass ? 0 : 1);
