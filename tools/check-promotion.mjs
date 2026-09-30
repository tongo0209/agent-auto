#!/usr/bin/env node
// Soát popup landing theo loại promotion — phần máy móc của skill /check-promotion.
// Luật đọc lúc chạy từ bảng 39 loại trong SKILL.md + reference/*.md, không chép sang đây.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanHtml, ancestorsOf } from './pm-gate/scan.mjs';
import { noteForAnyFile, readLock } from './lib/project-lock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, '../skills/check-promotion');
const REF_DIR = join(SKILL_DIR, 'reference');
const OVERRIDES = join(HERE, '../rules/pm-kit-overrides.tsv');
const STRUCTURE_FILE = '_popup-structure.md';
const PAYMENT_CHECKLIST = '13-khuyen-mai-nap.md';
const VOTE_CHECKLIST = '09-vote.md';
const AUX_CHECKLISTS = {
  milestone: 'milestone.md',
  'moc-thuong': 'milestone.md',
  event: 'event.md',
  'su-kien': 'event.md',
};
const KIT_STANDARD_POPUPS = new Set([
  'popup_signIn', 'popup_login', 'popup_nhanluot_signUp', 'popup_register', 'popup_selectrole', 'popup_condition',
  'popupCondition', 'popup_history', 'popup_inform', 'popup_bxh', 'popup_reward', 'popup_confirm',
]);
const ROLE_BY_HEADING = { 'Đăng ký thông tin': 'register', 'Điều kiện': 'condition', 'Thông báo': 'inform' };
const LEVEL_RANK = { optional: 0, conditional: 1, required: 2 };
const SUBMIT_LIKE = /submit|btn|confirm|xacnhan|dangky|dang-ky|register|nhan/i;
const SUBMIT_EXEMPT_FORM = /invite|loimoi|moiban|share|fb|facebook/i;

const PASS = '✅ Pass';
const FAIL = '❌ Fail';
const read = (file) => readFileSync(file, 'utf8');
const lower = (s) => s.trim().toLowerCase();
const withoutPrefix = (s) => lower(s).replace(/^promotiontypes\./, '');
const backticked = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const sectionAfter = (text, heading) => text.split(heading)[1]?.split(/^## /m)[0] || '';

function loadTypes() {
  const table = sectionAfter(read(join(SKILL_DIR, 'SKILL.md')), /^## 39 promotion type.*$/m);
  return table
    .split('\n')
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const [stt, name, aliasCell, checklistCell] = line.split('|').slice(1, 5).map((c) => c.trim());
      return {
        stt: Number(stt),
        name,
        aliases: backticked(aliasCell),
        checklists: backticked(checklistCell).filter((f) => f.endsWith('.md')),
        structureOnly: checklistCell.includes('structure-only'),
      };
    });
}

export function resolveType(input, types = loadTypes()) {
  const key = lower(input);
  if (/^\d+$/.test(key)) return types.find((t) => t.stt === Number(key)) || null;
  // Alias trước tên-bỏ-tiền-tố: "affiliate" trần là STT 22, không phải PROMOTIONTYPES.AFFILIATE (37)
  const found =
    types.find((t) => lower(t.name) === key) ||
    types.find((t) => t.aliases.includes(key)) ||
    types.find((t) => withoutPrefix(t.name) === withoutPrefix(key));
  if (found) return found;
  const aux = AUX_CHECKLISTS[key];
  return aux ? { stt: null, name: aux.replace('.md', ''), aliases: [], checklists: [aux], structureOnly: false, aux: true } : null;
}

function parseItems(file) {
  const list = sectionAfter(read(join(REF_DIR, file)), /^## required_popups\s*$/m);
  return list
    .split('\n')
    .filter((line) => /^- popup/i.test(line))
    .map((line) => {
      const [, main, alternatives = '', note] = line.match(/^- (\S+)(?: \(hoặc ([^)]*)\))?(.*)$/);
      const level = note.includes('(optional') ? 'optional' : note.includes('nếu') ? 'conditional' : 'required';
      return {
        main,
        variants: [main, ...alternatives.split(',').map((s) => s.trim()).filter(Boolean)],
        level,
        condition: note.match(/nếu ([^)*]+)/)?.[1].trim() || '',
        sources: [file],
      };
    });
}

function mergeItems(files) {
  const byMain = new Map();
  for (const item of files.flatMap(parseItems)) {
    const prev = byMain.get(item.main);
    if (!prev) {
      byMain.set(item.main, item);
      continue;
    }
    prev.variants = [...new Set([...prev.variants, ...item.variants])];
    prev.sources.push(...item.sources);
    if (LEVEL_RANK[item.level] > LEVEL_RANK[prev.level]) Object.assign(prev, { level: item.level, condition: item.condition });
  }
  return [...byMain.values()];
}

function loadAliasPairs() {
  return read(OVERRIDES)
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cols) => cols[3] === 'alias')
    .map(([, kit, production]) => [kit, production]);
}

function withAliases(ids, pairs) {
  return new Set(ids.flatMap((id) => [id, ...pairs.filter((pair) => pair.includes(id)).flat()]));
}

function loadRoleNames() {
  const roles = new Map();
  for (const [, heading, names] of read(join(REF_DIR, STRUCTURE_FILE)).matchAll(/^- \*\*([^*]+)\*\*: (.+)$/gm)) {
    const role = ROLE_BY_HEADING[heading];
    if (role) for (const id of backticked(names)) roles.set(id, role);
  }
  return roles;
}

function descendantsOf(els, root) {
  return els.map((_, i) => i).filter((i) => i !== root && [...ancestorsOf(els, i)].includes(root));
}

const nameOf = (el) => [el.id, ...el.classes, el.attrs.get('name') || ''].join(' ');
const describe = (el) => `${el.id ? '#' + el.id : el.classes[0] ? '.' + el.classes[0] : el.tag} (line ${el.line})`;

function isSubmit(el) {
  if (el.tag === 'button') return true;
  if (el.tag === 'input') return ['submit', 'button'].includes(el.attrs.get('type'));
  return el.tag === 'a' && SUBMIT_LIKE.test(nameOf(el));
}

function registerChecks(els, popup) {
  const form = descendantsOf(els, popup).find((i) => els[i].tag === 'form');
  const inForm = form === undefined ? [] : descendantsOf(els, form);
  const selectCheck = (name, firstOptionClass) => {
    const select = inForm.find((i) => els[i].tag === 'select' && els[i].attrs.get('name') === name);
    const check = `select[name="${name}"] + option đầu class ${firstOptionClass}`;
    if (select === undefined) return { check, status: `${FAIL} — thiếu select[name="${name}"] trong form` };
    const firstOption = descendantsOf(els, select).find((i) => els[i].tag === 'option');
    const ok = firstOption !== undefined && els[firstOption].classes.includes(firstOptionClass);
    return { check, status: ok ? PASS : `${FAIL} — option đầu thiếu class ${firstOptionClass}` };
  };
  return [
    { check: 'form bên trong popup', status: form === undefined ? `${FAIL} — không có <form>` : PASS },
    selectCheck('ServerID', 'server-select-title'),
    selectCheck('CharacterID', 'character-select-title'),
    { check: 'button submit trong form', status: inForm.some((i) => isSubmit(els[i])) ? PASS : `${FAIL} — form không có nút submit` },
  ];
}

function conditionChecks(els, popup, isPayment) {
  const inside = descendantsOf(els, popup);
  const forms = inside.filter((i) => els[i].tag === 'form');
  const rows = [];
  if (isPayment) {
    rows.push({ check: 'có ≥1 <form> (biến thể payment)', status: forms.length ? PASS : `${FAIL} — không có <form>` });
    const invite = forms.find((i) => els[i].classes.includes('pm__invite-form'));
    if (invite !== undefined) {
      const hasInput = descendantsOf(els, invite).some((i) => els[i].tag === 'input');
      rows.push({ check: 'pm__invite-form có ≥1 input', status: hasInput ? PASS : `${FAIL} — form mời không có input` });
    }
  } else {
    const conditionForm = forms.some((i) => /condition/i.test(els[i].id));
    rows.push({ check: 'form id chứa "condition"', status: conditionForm ? PASS : `${FAIL} — không có form id chứa "condition"` });
    rows.push({ check: 'có ≥1 input', status: inside.some((i) => els[i].tag === 'input') ? PASS : `${FAIL} — không có input` });
  }
  for (const form of forms.filter((i) => !SUBMIT_EXEMPT_FORM.test(nameOf(els[i])))) {
    const hasSubmit = descendantsOf(els, form).some((i) => isSubmit(els[i]));
    rows.push({ check: `form ${describe(els[form])} có submit riêng`, status: hasSubmit ? PASS : `${FAIL} — form thiếu nút submit` });
  }
  return rows;
}

function informChecks(els, popup) {
  const inside = descendantsOf(els, popup);
  const kitText = inside.some((i) => els[i].classes.includes('pm__inform-text'));
  const oldText = inside.some((i) => {
    const parent = els[els[i].parent];
    return els[i].tag === 'p' && (parent.classes.includes('MS__content') || parent.classes.includes('content'));
  });
  const ok = kitText || oldText;
  return [{ check: 'vùng chữ thông báo (pm__inform-text hoặc <p> trong .MS__content)', status: ok ? PASS : `${FAIL} — không có vùng chữ thông báo` }];
}

function summaryIcon({ failed, structureOnly, warnings }) {
  if (failed.length) return '❌';
  if (structureOnly) return '◐';
  return warnings.length ? '⚠️' : '✅';
}

export function checkHtml(html, type, { gameplay } = {}) {
  const els = scanHtml(html).elements;
  const aliasPairs = loadAliasPairs();
  const popups = new Map();
  els.forEach((el, i) => {
    if ((el.tag === 'section' || el.tag === 'div') && /^popup/.test(el.id) && !popups.has(el.id)) popups.set(el.id, i);
  });

  const items = type.structureOnly ? [] : mergeItems(type.checklists);
  const required = [];
  const warnings = [];
  const matched = new Set();
  const optionalIds = new Set();
  for (const item of items) {
    const candidates = withAliases(item.variants, aliasPairs);
    if (item.level === 'optional') {
      candidates.forEach((id) => optionalIds.add(id));
      required.push({ popup: item.main, status: '⏭️ Skip', note: 'optional' });
      continue;
    }
    const hit = [...popups.keys()].find((id) => candidates.has(id));
    const from = item.sources.length < type.checklists.length ? ` [chỉ có ở ${item.sources.join(', ')}]` : '';
    if (hit) {
      matched.add(hit);
      required.push({ popup: item.main, status: PASS, note: `Matched: ${hit} (line ${els[popups.get(hit)].line})${from}` });
    } else if (item.level === 'conditional') {
      const note = `chỉ bắt buộc nếu ${item.condition} — dev tự xác nhận`;
      required.push({ popup: item.main, status: '⚠️ Warning', note: note + from });
      warnings.push(`${item.main}: ${note}`);
    } else {
      required.push({ popup: item.main, status: FAIL, note: `Không tìm thấy (variants: ${item.variants.join(', ')})${from}` });
    }
  }

  const checksExtra = !type.structureOnly && !type.checklists.includes(AUX_CHECKLISTS.milestone);
  const extra = !checksExtra
    ? []
    : [...popups.keys()]
        .filter((id) => !matched.has(id) && !optionalIds.has(id) && !KIT_STANDARD_POPUPS.has(id))
        .map((id) => ({ popup: id, note: `⚠️ Không nằm trong checklist ${type.checklists.join(' + ')}` }));
  extra.forEach((x) => warnings.push(`${x.popup} thừa so với checklist`));

  const roles = loadRoleNames();
  for (const item of items.filter((x) => x.level !== 'optional')) {
    const role = item.variants.map((id) => roles.get(id)).find(Boolean);
    if (role) for (const id of withAliases(item.variants, aliasPairs)) if (!roles.has(id)) roles.set(id, role);
  }
  const isPayment = type.checklists.includes(PAYMENT_CHECKLIST) || gameplay === 'payment';
  const isVote = type.checklists.includes(VOTE_CHECKLIST);
  const structure = [];
  for (const [id, index] of popups) {
    if (optionalIds.has(id)) continue;
    const role = roles.get(id);
    const rows =
      role === 'register' ? registerChecks(els, index)
      : role === 'condition' ? conditionChecks(els, index, isPayment)
      : role === 'inform' ? informChecks(els, index)
      : [];
    structure.push(...rows.map((row) => ({ popup: id, ...row })));
    const hasPhotoInput = descendantsOf(els, index).some(
      (i) => els[i].tag === 'input' && els[i].attrs.get('type') === 'file' && (els[i].attrs.get('name') || '').startsWith('MediaImage'),
    );
    if (isVote && role === 'register' && !hasPhotoInput) {
      warnings.push(`${id}: thiếu input[type="file"][name="MediaImage[..]"] — chỉ cần nếu có flow dự thi`);
    }
  }

  const counted = [...required, ...structure].filter((row) => row.status === PASS || row.status.startsWith(FAIL));
  const failed = counted.filter((row) => row.status.startsWith(FAIL)).map((row) => row.check ? `${row.popup}: ${row.check}` : row.popup);
  const result = { required, extra, structure, warnings, failed, passed: counted.length - failed.length, total: counted.length };
  return { ...result, icon: summaryIcon({ failed, structureOnly: type.structureOnly, warnings }) };
}

function table(header, rows) {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function formatReport(file, input, type, r) {
  const label = type.aux ? `Checklist phụ — ${type.name}` : `STT ${type.stt} — ${type.name}`;
  const out = [`🎯 Target: ${file}`, `📋 Loại: ${label} (input user: ${input}) — checklist: ${type.checklists.join(' + ')}`, ''];
  if (type.structureOnly) {
    out.push(`⚠️ Loại \`${type.name}\` (STT ${type.stt}) chưa có checklist riêng — chỉ kiểm CẤU TRÚC popup đang có. Muốn kiểm đủ popup bắt buộc thì cần ≥3 template production của loại này để rút checklist.`, '');
  } else {
    out.push('## Popups Required', table(['#', 'Popup', 'Status', 'Ghi chú'], r.required.map((x, i) => [i + 1, x.popup, x.status, x.note])), '');
    out.push('## Popups Extra', r.extra.length ? table(['Popup', 'Ghi chú'], r.extra.map((x) => [x.popup, x.note])) : 'Không có popup thừa.', '');
  }
  out.push('## Cấu trúc Popup Quan Trọng', r.structure.length ? table(['Popup', 'Check', 'Status'], r.structure.map((x) => [x.popup, x.check, x.status])) : 'Không có popup đăng ký / điều kiện / thông báo trong file.', '');
  out.push(`## Tổng kết: ${r.passed}/${r.total} Passed ${r.icon}`);
  if (type.structureOnly) out.push('◐ Chỉ kiểm cấu trúc — loại này chưa có checklist popup bắt buộc, CHƯA kết luận đủ popup');
  if (r.failed.length) out.push(`❌ Thiếu: ${r.failed.join('; ')}`);
  if (r.warnings.length) out.push(`⚠️ Warning: ${r.warnings.join('; ')}`);
  return out.join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const tokens = argv.filter((a) => a !== '--json');
  const file = tokens.find((t) => t.endsWith('.html') || t.includes('/'));
  const input = tokens.filter((t) => t !== file).join(' ');
  const type = input ? resolveType(input) : null;
  if (!type) {
    console.error(`LOAI_KHONG_KHOP: "${input}" — in bảng 39 loại (SKILL.md Bước 0) và chờ user nhập`);
    return 2;
  }
  if (!type.checklists.length || !type.checklists.every((f) => existsSync(join(REF_DIR, f)))) {
    console.error(`KHONG_CO_CHECKLIST: STT ${type.stt} — ${type.name} không có popup flow hoặc thiếu file checklist`);
    return 2;
  }
  if (!file || !existsSync(file)) {
    console.error(`THIEU_FILE: ${file || '(chưa truyền)'} — xác định file theo SKILL.md Bước 1`);
    return 2;
  }
  const gameplay = readLock(noteForAnyFile(file))?.gameplay;
  const result = checkHtml(read(file), type, { gameplay });
  console.log(json ? JSON.stringify({ file, type, gameplay, ...result }, null, 2) : formatReport(file, input, type, result));
  return result.failed.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
