#!/usr/bin/env node
// Bóc ảnh nhúng từ file .xlsx (export từ Google Sheets) — dùng trong skill
// bug-fixer-lite (ẢNH-NHÚNG nấc 2). Zero-dependency: Node stdlib + `unzip` hệ thống.
//
//   node extract-xlsx-images.js <file.xlsx> <thư-mục-ra>
//
// stdout: mỗi ANCHOR 1 dòng JSON
//   {"name","row":<1-based|null>,"col":<1-based|null>,"colLetter":<"G"|null>,"path"}
// row/col lấy best-effort từ anchor trong xl/drawings. Một file ảnh dùng lại ở
// nhiều ô → NHIỀU dòng cùng `name`/`path`, khác row/col (trước đây chỉ giữ anchor
// cuối → caller không được tin row; nay đủ anchor nên tin được).
// Ảnh in-cell kiểu mới không có anchor → 1 dòng row=col=colLetter=null
// (caller tự đối chiếu nội dung ảnh).
// `col` cần cho sheet có NHIỀU cột ảnh (vd Image + Recommend cùng 1 dòng) —
// phân biệt bằng colLetter khớp `recimg_col` trong sheet-map.
// File hỏng/không mở được → lỗi sạch ra stderr, exit 1.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [xlsx, out] = process.argv.slice(2);
if (!xlsx || !out) {
  console.error('usage: node extract-xlsx-images.js <file.xlsx> <outdir>');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

function unzip(args, okCodes = [0]) {
  try {
    return execFileSync('unzip', args, { maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
  } catch (e) {
    if (okCodes.includes(e.status)) return e.stdout ? e.stdout.toString('utf8') : '';
    throw e;
  }
}

let entries;
try {
  entries = unzip(['-Z1', xlsx]).split('\n').filter(Boolean);
} catch (e) {
  console.error(`extract-xlsx-images: không mở được file (${e.message.split('\n')[0]})`);
  process.exit(1);
}

const media = entries.filter((n) => n.startsWith('xl/media/'));
if (media.length) unzip(['-o', '-j', xlsx, 'xl/media/*', '-d', out], [0, 1, 11]);

// col 0-based (như trong XML) → chữ cái cột kiểu A, B, … Z, AA, AB…
function colLetter(col0) {
  let n = col0 + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// anchor: tên file ảnh → DANH SÁCH {row, col} 1-based (ảnh dùng lại nhiều ô → nhiều anchor)
const anchors = {};
for (const dn of entries.filter((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n))) {
  const relsName = `xl/drawings/_rels/${path.basename(dn)}.rels`;
  const rid2file = {};
  if (entries.includes(relsName)) {
    const rels = unzip(['-p', xlsx, relsName]);
    for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="\.\.\/media\/([^"]+)"/g)) {
      rid2file[m[1]] = m[2];
    }
  }
  const xml = unzip(['-p', xlsx, dn]);
  for (const m of xml.matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g)) {
    const block = m[0];
    // đọc col+row TRONG <xdr:from> (block <xdr:to> cũng có col/row — không được lẫn)
    const from = block.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/);
    const rid = block.match(/r:embed="(rId\d+)"/);
    if (!from || !rid || !rid2file[rid[1]]) continue;
    const row = from[1].match(/<xdr:row>(\d+)<\/xdr:row>/);
    const col = from[1].match(/<xdr:col>(\d+)<\/xdr:col>/);
    if (!row) continue;
    const file = rid2file[rid[1]];
    (anchors[file] ||= []).push({
      row: parseInt(row[1], 10) + 1,
      col: col ? parseInt(col[1], 10) + 1 : null,
      colLetter: col ? colLetter(parseInt(col[1], 10)) : null,
    });
  }
}

for (const n of media) {
  const b = path.basename(n);
  const p = path.join(out, b);
  const list = anchors[b];
  if (!list || !list.length) {
    console.log(JSON.stringify({ name: b, row: null, col: null, colLetter: null, path: p }));
    continue;
  }
  // sắp xếp ổn định theo row rồi col — output tất định giữa các lần chạy
  list.sort((a, c) => a.row - c.row || (a.col ?? 0) - (c.col ?? 0));
  for (const a of list) {
    console.log(JSON.stringify({ name: b, row: a.row, col: a.col, colLetter: a.colLetter, path: p }));
  }
}
