#!/usr/bin/env node
// Cổng kiểm R-PM-7/R-PM-8: đọc AI-RULES của gameplay trong ai-template-kit rồi soi file HTML thật.
// Dùng: node tools/pm-gate.mjs <file.html> [--gameplay payment|luckydraw-gift-exchange] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const KIT = process.env.PM_KIT_DIR
  || join(homedir(), 'VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit');

const file = process.argv[2];
const asJson = process.argv.includes('--json');
const gpIdx = process.argv.indexOf('--gameplay');
const gameplayArg = gpIdx > -1 ? (process.argv[gpIdx + 1] || '').trim() : '';
if (!file || file.startsWith('--')) {
  console.error('Thiếu file. Dùng: node tools/pm-gate.mjs <file.html> [--gameplay payment|luckydraw-gift-exchange] [--json]');
  process.exit(2);
}

const html = readFileSync(file, 'utf8');

// ── Nhận diện gameplay theo AI-GUIDE: không đoán được thì hỏi user, không tự chọn ──
const PAYMENT_MARKS = ['pm__btn_claim', 'popupCondition', 'pm__totalCash'];
const LUCKY_MARKS = ['pm__rut', 'popup_condition', 'pm__totalregister-milestone'];
function detectGameplay() {
  if (gameplayArg) return gameplayArg;
  const pay = PAYMENT_MARKS.some((m) => html.includes(m));
  const lucky = LUCKY_MARKS.some((m) => html.includes(m));
  if (pay && !lucky) return 'payment';
  if (lucky && !pay) return 'luckydraw-gift-exchange';
  return null;
}
const gameplay = detectGameplay();
if (!gameplay) {
  console.error('Không nhận ra gameplay từ file (hoặc lẫn hook của cả hai). Chạy lại với --gameplay payment|luckydraw-gift-exchange');
  process.exit(2);
}
const rulesFile = join(KIT, 'gameplays', gameplay, `AI-RULES-${gameplay}.md`);
if (!existsSync(rulesFile)) {
  console.error(`Không thấy ${rulesFile} — kiểm tra PM_KIT_DIR hoặc đã pull gt-promotion-template chưa.`);
  process.exit(2);
}
const rules = readFileSync(rulesFile, 'utf8');

// ── Luật rút từ AI-RULES ────────────────────────────────────────────────────
// §4 checklist "- [ ] `hook` … — 1": chỉ lấy token TRƯỚC dấu — (sau đó là ví dụ đối chiếu),
// và trừ đi danh sách "KHÔNG thuộc nhóm singleton" / "[1/popup]" nằm cuối mục.
function parseSingletons() {
  const section = rules.split('## 4.')[1]?.split('\n## 5.')[0] || '';
  const tokensOf = (text) => [...text.matchAll(/`([^`]+)`/g)].map(([, t]) => t).filter((t) => !/[*\s<>]/.test(t));
  const excluded = new Set(section.split('\n')
    .filter((l) => l.includes('KHÔNG thuộc nhóm singleton') || l.includes('[1/popup]'))
    .flatMap((l) => tokensOf(l)));
  const out = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('- [ ]')) continue;
    const kind = /\bid\b/.test(line) ? 'id' : /\bclass\b/.test(line) ? 'class' : 'auto';
    for (const token of tokensOf(line.split(' — ')[0])) {
      if (!excluded.has(token)) out.push({ token, kind });
    }
  }
  return out;
}

// §2 bảng catalog: cột Hook | Loại | Bắt buộc | element | Phải nằm trong | Số lần | …
function parseCatalog() {
  const section = rules.split('## 2.')[1]?.split('\n## 3.')[0] || '';
  const out = [];
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 8) continue;
    const token = cells[1].replace(/`/g, '');
    if (!token || token === 'Hook' || token.startsWith('---') || /[*\s]/.test(token)) continue;
    out.push({
      token,
      kind: cells[2].startsWith('id') ? 'id' : cells[2].startsWith('class') ? 'class' : 'other',
      required: cells[3].includes('✅'),
      inside: /^`pm__[\w-]+`$/.test(cells[5]) ? cells[5].replace(/`/g, '') : '',
    });
  }
  return out;
}

// ── Quét HTML: stack thẻ mở để biết tổ tiên, đủ cho ràng buộc "phải nằm trong" ──
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;

function lineOf(index) {
  return html.slice(0, index).split('\n').length;
}

function scan() {
  const stack = [];
  const seen = new Map(); // token@kind -> [{line, ancestors}]
  const anyTags = [];
  for (const m of html.matchAll(TAG)) {
    const [raw, closing, name, attrs, selfClose] = m;
    if (name.toLowerCase() === 'any') anyTags.push(lineOf(m.index));
    if (closing) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name.toLowerCase()) { stack.length = i; break; } continue; }

    const classes = (attrs.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/) || [])?.slice(1).find(Boolean) || '';
    const id = (attrs.match(/\bid\s*=\s*"([^"]*)"|\bid\s*=\s*'([^']*)'/) || [])?.slice(1).find(Boolean) || '';
    const tokens = { class: classes.split(/\s+/).filter(Boolean), id: id ? [id] : [] };
    const ancestors = stack.flatMap((el) => [...el.tokens.class, ...el.tokens.id]);
    for (const [, attr] of attrs.matchAll(/(?:^|\s)(data-[\w-]+)/g)) {
      const key = `${attr}@data`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push({ line: lineOf(m.index), ancestors: [...ancestors, ...tokens.class, ...tokens.id] });
    }
    for (const kind of ['class', 'id']) {
      for (const t of tokens[kind]) {
        const key = `${t}@${kind}`;
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push({ line: lineOf(m.index), ancestors });
      }
    }
    if (!VOID.has(name.toLowerCase()) && !selfClose) stack.push({ name: name.toLowerCase(), tokens });
  }
  return { seen, anyTags };
}

const { seen, anyTags } = scan();
const hits = (token, kind) => (kind === 'auto'
  ? [...(seen.get(`${token}@class`) || []), ...(seen.get(`${token}@id`) || [])]
  : seen.get(`${token}@${kind}`) || []);

// ── Kết luận ────────────────────────────────────────────────────────────────
const fails = [];
const warns = [];

for (const { token, kind } of parseSingletons()) {
  const found = hits(token, kind);
  if (found.length > 1) {
    fails.push({ rule: 'R-PM-8a', msg: `\`${token}\` là SINGLETON nhưng xuất hiện ${found.length} lần`, lines: found.map((f) => f.line) });
  }
}

for (const { token, kind, required, inside } of parseCatalog()) {
  const found = hits(token, kind === 'other' ? 'data' : kind);
  if (required && found.length === 0) {
    warns.push({ rule: 'R-PM-7', msg: `thiếu hook bắt buộc \`${token}\` (file bàn giao từng phần thì bỏ qua)`, lines: [] });
  }
  if (inside && inside !== '—' && found.length) {
    const orphans = found.filter((f) => !f.ancestors.includes(inside));
    // Trang không hề có container đó = biến thể hook ngoài phạm vi kit → cảnh báo, không chặn.
    const hasContainer = hits(inside, 'class').length > 0;
    if (orphans.length) {
      (hasContainer ? fails : warns).push({
        rule: 'R-PM-8b',
        msg: `\`${token}\` phải nằm trong \`${inside}\`` + (hasContainer ? '' : ' — trang không có container này, soát tay xem đang dùng biến thể nào'),
        lines: orphans.map((o) => o.line),
      });
    }
  }
}

if (anyTags.length) {
  fails.push({ rule: 'R-PM-4', msg: `còn ${anyTags.length} thẻ <any> chưa thay bằng tag thật`, lines: anyTags });
}

if (asJson) {
  console.log(JSON.stringify({ file, gameplay, fails, warns }, null, 2));
} else {
  console.log(`pm-gate · ${file} · gameplay: ${gameplay}`);
  for (const f of fails) console.log(`  🔴 ${f.rule}  ${f.msg}${f.lines.length ? `  (dòng ${f.lines.slice(0, 8).join(', ')}${f.lines.length > 8 ? '…' : ''})` : ''}`);
  for (const w of warns) console.log(`  🟡 ${w.rule}  ${w.msg}`);
  console.log(fails.length ? `  ✗ ${fails.length} lỗi chặn — chưa được báo xong` : '  ✓ không có lỗi chặn');
}
process.exit(fails.length ? 1 : 0);
