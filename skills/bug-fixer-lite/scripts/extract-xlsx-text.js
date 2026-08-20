#!/usr/bin/env node
// Bóc TEXT theo dòng từ file .xlsx — cho INTAKE ADAPTER của skill bug-fixer-lite
// (nguồn `file`: buglist QC tải về dạng Excel/xlsx export từ Google Sheets).
// Zero-dependency: Node stdlib + `unzip` hệ thống. Cặp đôi với extract-xlsx-images.js
// (script kia lấy ẢNH + anchor row/colLetter; script này lấy CHỮ trong ô).
//
//   node extract-xlsx-text.js <file.xlsx> [--sheet <index 1-based>] [--max-rows <n>]
//
// stdout: mỗi DÒNG có dữ liệu 1 JSON, khoá theo CHỮ CÁI CỘT (khớp sheet-map của skill):
//   {"row":3,"cells":{"A":"BugID","B":"Device","E":"Description", ...}}
// Ô rỗng bị bỏ khỏi `cells` (không sinh khoá) — dòng trống bị bỏ hẳn.
// `row` là số dòng GỐC 1-based trong sheet (= SheetRow), kể cả khi có dòng trống ở trên,
// nên dùng trực tiếp làm srcRef được.
//
// Xử đúng 4 kiểu ô hay gặp: inlineStr · shared string (t="s") · số/ngày (<v>) ·
// chuỗi công thức (t="str", lấy giá trị cached). Ô `=IMAGE("url")` KHÔNG có <v> nên ra
// RỖNG — đây là cạm bẫy đã ghi trong SKILL.md, không phải lỗi script.
// File hỏng/không phải zip/đuôi lạ → lỗi sạch ra stderr, exit 1.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const argv = process.argv.slice(2);
const src = argv[0];
if (!src) {
  console.error('usage: node extract-xlsx-text.js <file.xlsx> [--sheet <n>] [--max-rows <n>]');
  process.exit(1);
}
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? parseInt(argv[i + 1], 10) : dflt;
};
const sheetIdx = getOpt('--sheet', 1);
const maxRows = getOpt('--max-rows', 0);

if (path.extname(src).toLowerCase() !== '.xlsx') {
  console.error(`extract-xlsx-text: chỉ nhận .xlsx, nhận được: ${path.extname(src) || '(không đuôi)'}`);
  process.exit(1);
}

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
  entries = unzip(['-Z1', src]).split('\n').filter(Boolean);
} catch (e) {
  console.error(`extract-xlsx-text: không mở được file (${e.message.split('\n')[0]})`);
  process.exit(1);
}

const sheetName = `xl/worksheets/sheet${sheetIdx}.xml`;
if (!entries.includes(sheetName)) {
  const have = entries.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  console.error(`extract-xlsx-text: không có ${sheetName}. Sheet có trong file: ${have.join(', ') || '(không có)'}`);
  process.exit(1);
}

// ── entity + shared strings
function unesc(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

// nối mọi <t> trong 1 <si> (chuỗi bị chia nhiều run khi có định dạng khác nhau)
const shared = [];
if (entries.includes('xl/sharedStrings.xml')) {
  const xml = unzip(['-p', src, 'xl/sharedStrings.xml']);
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1]));
    shared.push(parts.join(''));
  }
}

const sheet = unzip(['-p', src, sheetName]);

let emitted = 0;
for (const rm of sheet.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const rowNum = parseInt(rm[1], 10);
  const cells = {};
  for (const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = cm[1];
    const body = cm[2];
    const refM = attrs.match(/\br="([A-Z]+)\d+"/);
    if (!refM) continue;
    const col = refM[1];
    const tM = attrs.match(/\bt="([^"]+)"/);
    const type = tM ? tM[1] : 'n';

    let val = '';
    if (type === 'inlineStr') {
      val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join('');
    } else if (type === 's') {
      const v = body.match(/<v>([\s\S]*?)<\/v>/);
      const i = v ? parseInt(v[1], 10) : -1;
      val = i >= 0 && i < shared.length ? shared[i] : '';
    } else {
      // n / str / b / d — lấy giá trị cached; ô công thức không có <v> → rỗng
      const v = body.match(/<v>([\s\S]*?)<\/v>/);
      val = v ? unesc(v[1]) : '';
    }
    val = val.replace(/\r\n/g, '\n').trim();
    if (val !== '') cells[col] = val;
  }
  // Ô rỗng cũng có thể mang ẢNH NHÚNG → dòng "rỗng chữ" vẫn có thể là bug thật,
  // nhưng ở đây chỉ bóc chữ: bỏ dòng không có ô nào có chữ.
  if (Object.keys(cells).length === 0) continue;
  console.log(JSON.stringify({ row: rowNum, cells }));
  emitted++;
  if (maxRows && emitted >= maxRows) break;
}

if (emitted === 0) {
  console.error('extract-xlsx-text: không bóc được dòng nào có chữ (sheet rỗng, hoặc mọi ô là công thức không có giá trị cached)');
  process.exit(1);
}
