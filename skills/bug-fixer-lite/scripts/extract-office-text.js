#!/usr/bin/env node
// Bóc text + ảnh từ buglist dạng .pptx / .docx — cho INTAKE ADAPTER của skill
// bug-fixer-lite (nguồn ngoài Google Sheet). Zero-dependency: Node stdlib + `unzip` hệ thống.
//
//   node extract-office-text.js <file.pptx|file.docx> <thư-mục-ra>
//
// stdout, mỗi dòng 1 JSON:
//   .pptx → {"slide": N, "text": "...", "images": ["<path>", ...]}   (1 dòng/slide)
//   .docx → {"para": N, "text": "..."}  (1 dòng/đoạn có chữ)
//           + dòng cuối {"images": ["<path>", ...]} (docx không map ảnh→đoạn
//             tin cậy được — caller tự đối chiếu nội dung ảnh)
// File hỏng/không phải zip/đuôi lạ → lỗi sạch ra stderr, exit 1.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node extract-office-text.js <file.pptx|file.docx> <outdir>');
  process.exit(1);
}
const ext = path.extname(src).toLowerCase();
if (ext !== '.pptx' && ext !== '.docx') {
  console.error(`extract-office-text: chỉ nhận .pptx/.docx, nhận được: ${ext || '(không đuôi)'}`);
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
  entries = unzip(['-Z1', src]).split('\n').filter(Boolean);
} catch (e) {
  console.error(`extract-office-text: không mở được file (${e.message.split('\n')[0]})`);
  process.exit(1);
}

// gom text theo đoạn: mỗi <paraTag> = 1 đoạn, nối các <textTag> bên trong
function paraTexts(xml, paraTag, textTag) {
  const paras = [];
  for (const pm of xml.matchAll(new RegExp(`<${paraTag}[ >][\\s\\S]*?</${paraTag}>`, 'g'))) {
    const t = [...pm[0].matchAll(new RegExp(`<${textTag}[^>]*>([^<]*)</${textTag}>`, 'g'))]
      .map((m) => m[1]).join('');
    if (t.trim()) paras.push(t.trim());
  }
  return paras;
}

function extractMedia(pattern, names) {
  if (!names.length) return [];
  unzip(['-o', '-j', src, pattern, '-d', out], [0, 1, 11]);
  return names.map((n) => path.join(out, path.basename(n)));
}

if (ext === '.pptx') {
  const slides = entries
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10));
  for (const sn of slides) {
    const num = parseInt(path.basename(sn).match(/(\d+)/)[1], 10);
    const text = paraTexts(unzip(['-p', src, sn]), 'a:p', 'a:t').join('\n');
    const relsName = `ppt/slides/_rels/${path.basename(sn)}.rels`;
    let images = [];
    if (entries.includes(relsName)) {
      const rels = unzip(['-p', src, relsName]);
      const mediaNames = [...rels.matchAll(/Target="\.\.\/media\/([^"]+)"/g)]
        .map((m) => `ppt/media/${m[1]}`)
        .filter((n) => entries.includes(n));
      images = mediaNames.length ? extractMedia('ppt/media/*', mediaNames) : [];
    }
    console.log(JSON.stringify({ slide: num, text, images }));
  }
} else {
  if (!entries.includes('word/document.xml')) {
    console.error('extract-office-text: docx thiếu word/document.xml');
    process.exit(1);
  }
  const xml = unzip(['-p', src, 'word/document.xml']);
  paraTexts(xml, 'w:p', 'w:t').forEach((t, i) => {
    console.log(JSON.stringify({ para: i + 1, text: t }));
  });
  const media = entries.filter((n) => n.startsWith('word/media/'));
  console.log(JSON.stringify({ images: extractMedia('word/media/*', media) }));
}
