#!/usr/bin/env node
/* sp-coverage.mjs — LƯỚI CHẶN: so kho design local với manifest NGUỒN.
 *
 * Usage:
 *   node sp-coverage.mjs <manifest.json> <thư mục design> [--json] [--todo]
 *   node sp-coverage.mjs ~/Downloads/sp-manifest-GW-556.json ~/VNG/agent-auto/designs/GW-556
 *
 * Exit code:  0 = ĐỦ (mọi file nguồn có bản local đúng byte)   1 = THIẾU/LỆCH   2 = lỗi dùng sai
 *
 * VÌ SAO: "tổng byte khớp listing" chỉ chứng minh tập ĐÃ CHỌN tải về nguyên vẹn — nó KHÔNG
 * chứng minh đã tải đủ. Verify phải tuyệt đối theo cây nguồn, nếu không sẽ PASS trong khi
 * thiếu 48/56 file (ca GW-556 3/8/2026).
 *
 * Khớp theo TÊN + SIZE, quét đệ quy thư mục local nên không ép cấu trúc lưu trữ
 * (tương thích ngược với các ticket đã lưu kiểu cũ: ảnh ở gốc, PSD trong _raw/).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const [, , manPath, designDir, ...flags] = process.argv;
if (!manPath || !designDir) {
  console.error("Usage: sp-coverage.mjs <manifest.json> <designDir> [--json] [--todo]");
  process.exit(2);
}
const asJson = flags.includes("--json");
const todoOnly = flags.includes("--todo");

const man = JSON.parse(readFileSync(manPath, "utf8"));

// --- index file local: tên (NFC) -> [size,...]  (đệ quy, bỏ file ẩn) ---
const local = new Map();
function scan(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else {
      const k = e.name.normalize("NFC");
      if (!local.has(k)) local.set(k, []);
      local.get(k).push({ path: p, size: statSync(p).size });
    }
  }
}
scan(designDir);

// --- đối chiếu ---
const ok = [], missing = [], mismatch = [];
for (const f of man.files) {
  const name = basename(f.rel).normalize("NFC");
  const cands = local.get(name) || [];
  const exact = cands.find(c => c.size === f.length);
  if (exact) ok.push({ ...f, at: exact.path });
  else if (cands.length) mismatch.push({ ...f, localSize: cands[0].size, at: cands[0].path });
  else missing.push(f);
}

const sum = a => a.reduce((s, f) => s + f.length, 0);
const mb = b => (b / 1048576).toFixed(1) + " MB";
const pass = missing.length === 0 && mismatch.length === 0;

if (todoOnly) {                     // danh sách rel path cần tải, mỗi dòng 1 cái
  for (const f of [...missing, ...mismatch]) console.log(f.rel);
  process.exit(pass ? 0 : 1);
}
if (asJson) {
  console.log(JSON.stringify({ pass, key: man.key, source: { count: man.count, bytes: man.totalBytes },
    have: { count: ok.length, bytes: sum(ok) }, missing, mismatch }, null, 2));
  process.exit(pass ? 0 : 1);
}

console.log(`\n📦 ${man.key} — coverage design so với NGUỒN`);
console.log(`   nguồn : ${man.count} file / ${mb(man.totalBytes)}   (quét ${man.scannedAt})`);
console.log(`   local : ${ok.length} file / ${mb(sum(ok))}   → ${((sum(ok) / man.totalBytes) * 100).toFixed(1)}% byte, ${((ok.length / man.count) * 100).toFixed(0)}% file`);
console.log(`   kho   : ${designDir}`);

if (mismatch.length) {
  console.log(`\n⚠ LỆCH BYTE (${mismatch.length}) — tải lại, có thể là bản mới hoặc tải cắt:`);
  for (const f of mismatch) console.log(`   ${f.rel}  nguồn ${f.length} ≠ local ${f.localSize}`);
}
if (missing.length) {
  const byDir = new Map();
  for (const f of missing) {
    const d = f.rel.includes("/") ? f.rel.slice(0, f.rel.lastIndexOf("/")) : ".";
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }
  console.log(`\n❌ THIẾU ${missing.length} file / ${mb(sum(missing))}:`);
  for (const [d, fs] of [...byDir].sort()) console.log(`   ${d.padEnd(16)} ${String(fs.length).padStart(3)} file  ${mb(sum(fs)).padStart(10)}`);
}
console.log(pass ? `\n✅ ĐỦ — ${ok.length}/${man.count} file khớp byte\n` : `\n✗ CHƯA ĐỦ — còn ${missing.length + mismatch.length}/${man.count} file\n`);
process.exit(pass ? 0 : 1);
