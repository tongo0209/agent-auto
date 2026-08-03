#!/usr/bin/env node
/* sp-collect.mjs — nhặt file vừa tải ở ~/Downloads vào kho design theo ĐÚNG cây nguồn + verify.
 *
 * Usage:
 *   node sp-collect.mjs <manifest.json> <designDir> [--downloads ~/Downloads] [--dry]
 *
 * Nhặt theo (TÊN + SIZE) khớp manifest — không theo mốc thời gian, nên chạy lại bao nhiêu lần
 * cũng được và không đụng file lạ của user trong ~/Downloads.
 * File về kho tại  <designDir>/_src/<rel>  (bản sao trung thực cây nguồn, để đối chiếu coverage).
 * Tên tiếng Việt tải về hay ở NFD → normalize NFC khi so và khi ghi.
 *
 * Verify từng file: size khớp manifest + magic bytes khớp đuôi (bắt trang HTML login-wall
 * bị lưu thành .psd — ca đã gặp).
 *
 * Tên dạng "abc (1).psb" (browser thêm " (n)" khi REFIRE file stall — ca GW-713 3/8) được
 * strip hậu tố " (n)" trước khi so manifest; size vẫn phải khớp nên không nhặt nhầm.
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, renameSync, copyFileSync, openSync, readSync, closeSync, unlinkSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const [manPath, designDir] = args;
if (!manPath || !designDir) { console.error("Usage: sp-collect.mjs <manifest.json> <designDir> [--downloads DIR] [--dry]"); process.exit(2); }
const dry = args.includes("--dry");
const dlIdx = args.indexOf("--downloads");
const DL = dlIdx > -1 ? args[dlIdx + 1] : join(homedir(), "Downloads");

const man = JSON.parse(readFileSync(manPath, "utf8"));
const bySizeName = new Map();                       // "name|size" -> rel
for (const f of man.files) bySizeName.set(`${basename(f.rel).normalize("NFC")}|${f.length}`, f.rel);

const MAGIC = {
  psd: ["38425053"], png: ["89504e47"], jpg: ["ffd8ff"], jpeg: ["ffd8ff"],
  pdf: ["25504446"], zip: ["504b0304"], ai: ["25504446", "38425053"],
  ttf: ["00010000", "74727565"], otf: ["4f54544f"], webp: ["52494646"],
};
const head = (p, n = 4) => { const fd = openSync(p, "r"); const b = Buffer.alloc(n); readSync(fd, b, 0, n, 0); closeSync(fd); return b.toString("hex"); };
const isHtml = p => { const h = Buffer.from(head(p, 64), "hex").toString("utf8").toLowerCase(); return h.includes("<!doctype") || h.includes("<html"); };

const moved = [], bad = [], skipped = [];
for (const e of readdirSync(DL, { withFileTypes: true })) {
  if (!e.isFile() || e.name.startsWith(".") || e.name.endsWith(".crdownload") || e.name.endsWith(".part")) continue;
  const src = join(DL, e.name);
  const size = statSync(src).size;
  const nfc = e.name.normalize("NFC");
  const rel = bySizeName.get(`${nfc}|${size}`)
    ?? bySizeName.get(`${nfc.replace(/ \(\d+\)(\.[^.]+)$/, "$1")}|${size}`); // "abc (1).psb" → "abc.psb"
  if (!rel) continue;                                // không thuộc design này → không đụng

  const ext = e.name.split(".").pop().toLowerCase();
  if (isHtml(src)) { bad.push(`${e.name}: là trang HTML (login wall / hết quyền), KHÔNG phải file thật`); continue; }
  const want = MAGIC[ext];
  if (want && !want.some(m => head(src, m.length / 2).startsWith(m))) {
    bad.push(`${e.name}: magic ${head(src)} không khớp đuôi .${ext}`); continue;
  }

  const dest = join(designDir, "_src", rel);
  if (existsSync(dest) && statSync(dest).size === size) { skipped.push(rel); continue; }
  if (!dry) { mkdirSync(dirname(dest), { recursive: true }); try { renameSync(src, dest); } catch { copyFileSync(src, dest); unlinkSync(src); } }
  moved.push(rel);
}

console.log(`\n📥 nhặt từ ${DL} → ${join(designDir, "_src")}`);
for (const r of moved) console.log(`   ✓ ${r}`);
if (skipped.length) console.log(`   (bỏ qua ${skipped.length} file đã có đúng byte trong kho)`);
if (bad.length) { console.log(`\n⚠ FILE HỎNG — đã để nguyên trong Downloads, KHÔNG đưa vào kho:`); for (const b of bad) console.log(`   ✗ ${b}`); }
console.log(`\n${moved.length} file vào kho${dry ? " (dry-run)" : ""}. Chạy sp-coverage.mjs để biết đã ĐỦ chưa.\n`);
process.exit(bad.length ? 1 : 0);
