#!/usr/bin/env node
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { notePathFor, readLock } from './project-lock.mjs';

const root = mkdtempSync(join(tmpdir(), 'project-lock-'));
process.env.PM_PROJECTS_DIR = join(root, 'projects');
let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`}`);
};

const campaign = join(root, 'cdn-source/products/cfl/landing/2026-taudien');
mkdirSync(join(campaign, 'dist'), { recursive: true });
const note = join(root, 'projects/cfl/2026-taudien.md');

check('file sâu trong campaign → note theo game/slug', notePathFor(join(campaign, 'dist/index.html')), note);
check('chính thư mục campaign', notePathFor(campaign), note);
check('ngoài products/<game>/landing/<slug> → null', notePathFor(join(root, 'elsewhere/index.html')), null);
check('chưa có note → readLock null', readLock(note), null);

mkdirSync(join(root, 'projects/cfl'), { recursive: true });
writeFileSync(note, '# cfl/2026-taudien\n## 1. Khoá\n- gameplay: CHƯA KHOÁ\n## 2. Nơi code\n');
check('mục Khoá còn nhãn CHƯA KHOÁ → null', readLock(note), null);

writeFileSync(note, [
  '# cfl/2026-taudien — Tàu điện',
  '## 1. Khoá',
  '- gameplay: payment',
  '- type: 13-khuyen-mai-nap',
  '- ref: products/cfl/landing/2026-rung-ky-bi',
  '- nguồn chuẩn: kit 72bcec9c',
  '## 2. Nơi code',
  '- gameplay: luckydraw-gift-exchange',
].join('\n'));
check('đọc đúng 3 khoá, chỉ trong mục 1', readLock(note), { gameplay: 'payment', type: '13-khuyen-mai-nap', ref: 'products/cfl/landing/2026-rung-ky-bi' });

writeFileSync(note, '## 1. Khoá\n- gameplay: none\n- type: 27-diem-danh-rut-tham\n');
check('gameplay none, thiếu ref → ref rỗng', readLock(note), { gameplay: 'none', type: '27-diem-danh-rut-tham', ref: '' });

console.log(`\npass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
