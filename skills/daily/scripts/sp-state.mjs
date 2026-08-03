#!/usr/bin/env node
/* sp-state.mjs — ghi kết quả coverage vào state.json (không để agent tự gõ tay, gõ tay là chỗ
 * "đã tải 8/56" lọt thành `đã-giao-đã-tải`).
 *
 * Usage:
 *   node sp-state.mjs <KEY> <manifest.json> <designDir> <state.json> [--deferred "lý do"]
 *
 * Tự chọn status: coverage đủ → `đã-giao-đã-tải`; thiếu → `đã-giao-tải-một-phần` (KHÔNG làm tròn lên).
 * Luôn backup state.json trước khi ghi.
 */
import { readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";

const [, , KEY, manPath, designDir, statePath, ...rest] = process.argv;
if (!KEY || !manPath || !designDir || !statePath) {
  console.error('Usage: sp-state.mjs <KEY> <manifest.json> <designDir> <state.json> [--deferred "lý do"]');
  process.exit(2);
}
const dIdx = rest.indexOf("--deferred");
const deferredNote = dIdx > -1 ? rest[dIdx + 1] : null;

const man = JSON.parse(readFileSync(manPath, "utf8"));
const local = new Map();
(function scan(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else {
      const k = e.name.normalize("NFC");
      if (!local.has(k)) local.set(k, []);
      local.get(k).push(statSync(p).size);
    }
  }
})(designDir);

const have = man.files.filter(f => (local.get(basename(f.rel).normalize("NFC")) || []).includes(f.length));
const missing = man.files.filter(f => !(local.get(basename(f.rel).normalize("NFC")) || []).includes(f.length));
const full = missing.length === 0;

const state = JSON.parse(readFileSync(statePath, "utf8"));
if (!state.issues?.[KEY]) { console.error(`state.issues["${KEY}"] không tồn tại`); process.exit(2); }

const bakDir = existsSync(join(dirname(statePath), ".backups/state")) ? join(dirname(statePath), ".backups/state") : dirname(statePath);
copyFileSync(statePath, join(bakDir, `state-pre-sp-${KEY}-${man.scannedAt.replace(/[:.]/g, "")}.json`));

const d = state.issues[KEY].design ?? (state.issues[KEY].design = {});
d.status = full ? "đã-giao-đã-tải" : "đã-giao-tải-một-phần";
d.manifest = join(designDir, "sp-manifest.json");     // ảnh chụp CÂY NGUỒN, không phải tập đã tải
d.sourcePath = man.root;
d.coverage = {
  at: new Date().toISOString(),
  sourceFiles: man.count, sourceBytes: man.totalBytes,
  localFiles: have.length, localBytes: have.reduce((s, f) => s + f.length, 0),
  missingFiles: missing.length, missingBytes: missing.reduce((s, f) => s + f.length, 0),
};
if (missing.length) d.missing = missing.map(f => f.rel);
else delete d.missing;
if (deferredNote) d.deferred = deferredNote; else delete d.deferred;
delete d.notDownloaded;            // trường mô tả mơ hồ kiểu cũ — coverage thay thế
delete d.notDownloadedNote;
if (full) d.downloadedAt = new Date().toISOString();

writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log(`${KEY}: ${d.status} — ${have.length}/${man.count} file (${(d.coverage.localBytes / 1048576).toFixed(1)}/${(man.totalBytes / 1048576).toFixed(1)} MB)`);
if (missing.length) console.log(`   còn thiếu ${missing.length} file — đã ghi state.issues.${KEY}.design.missing`);
