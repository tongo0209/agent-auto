#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { campaignOf, notePathFor, noteForAnyFile, readLock, HOOKS_AT, HOOKS_AT_DEFAULT } from './lib/project-lock.mjs';

const AGENT_AUTO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GT_PROMOTION = process.env.PM_GT_PROMOTION_DIR || join(homedir(), 'VNG/git-vng/gt-promotion-template');
const KIT = process.env.PM_KIT_DIR || join(GT_PROMOTION, 'standard-html-templates/ai-template-kit');

// Heading là hợp đồng với lib/project-lock.mjs (readLock, noteForAnyFile): cấm đổi chữ.
const SECTION = {
  lock: '1. Khoá',
  places: '2. Nơi code',
  files: '3. Sơ đồ file',
  hooks: '4. Bản đồ hook',
  decisions: '5. Quyết định & hằng số',
  questions: '6. Câu hỏi đang chờ',
  debt: '7. Nợ kỹ thuật',
  commands: '8. Lệnh',
  log: '9. Nhật ký',
};
const HINT = {
  lock: '_khoá trước khi code: `project-note lock <campaign> --gameplay …` (R-PM-11)_',
  places: '_mỗi dòng `- <nhãn>: <đường dẫn tuyệt đối>` — `project-note path` map file bàn giao về đây_',
  files: '_thêm ` — <việc>` sau tên file; `refresh` giữ phần đó_',
  hooks: '_popup → hook:dòng; `refresh` sinh lại mục này, sửa tay sẽ mất_',
  decisions: '_giá trị · nguồn (PM/sheet/design) · ngày — hằng số cơ chế, số đo design, hợp đồng với BE_',
  questions: '_câu hỏi · hỏi ai · ngày hỏi_',
  debt: '_`- [ ] <CODE> <token> (<file>)` — `project-note debt` ghi từ pm-gate; phần dọn dở ghi tay_',
  commands: '_chạy trong thư mục campaign_',
  log: '_ngày · task/bug · đổi gì · commit_',
};
const LOCK_FIELDS = ['gameplay', 'type', 'ref', 'hooks-at', 'nguồn chuẩn', 'ngày khoá', 'ai khoá'];
const UNLOCKED = { gameplay: 'CHƯA KHOÁ', 'hooks-at': HOOKS_AT_DEFAULT };
const GAMEPLAYS = ['luckydraw-gift-exchange', 'payment', 'none'];
const LISTED_FILE = /\.(html|twig|js|scss|md)$/;
const FILE_ROW = /^- `([^`]+)`(.*)$/;
const MARKUP_FILE = /\.(html|twig)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist']);
const HANDOFF_SEARCH_DEPTH = 3;
const GAME_FOLDER_DEPTH = 1;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const NOT_MARKUP = /<!--[\s\S]*?-->|\{#[\s\S]*?#\}|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g;
const TAG_OR_INCLUDE = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>|\{%-?\s*(?:include|embed)\s+['"]([^'"]+)['"]/g;

const today = () => new Date().toLocaleDateString('sv-SE');
const lockLine = (field, value) => (value ? `- ${field}: ${value}` : `- ${field}:`);

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

const chunksOf = (text) => text.split(/^(?=## )/m);
const isSection = (chunk, heading) => chunk.split('\n', 1)[0].trim() === `## ${heading}`;
const bodyOf = (chunk) => chunk.slice(chunk.indexOf('\n') + 1);
const sectionBody = (text, heading) => bodyOf(chunksOf(text).find((c) => isSection(c, heading)) || '');
const bullets = (body) => body.split('\n').filter((line) => line.startsWith('- '));

function editSection(text, heading, edit) {
  return chunksOf(text).map((chunk) => {
    if (!isSection(chunk, heading)) return chunk;
    const blankTail = chunk.match(/\n*$/)[0];
    return `## ${heading}\n${edit(bodyOf(chunk).trimEnd())}${blankTail}`;
  }).join('');
}

function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [relative(base, full)];
  });
}

const sourceFiles = (dir) => listFiles(dir).filter((file) => LISTED_FILE.test(file)).sort();

function fileRows(files, oldBody = '') {
  const oldRows = bullets(oldBody).map((line) => line.match(FILE_ROW)).filter(Boolean);
  const jobOf = new Map(oldRows.map(([, file, job]) => [file, job]));
  return files.map((file) => `- \`${file}\`${jobOf.get(file) || ''}`);
}

// Popup = `{% set sectionId %}` của base.html.twig hoặc thẻ id="popup…"
function scanMarkup(dir, file, inheritedPopup = null) {
  const text = readFileSync(join(dir, file), 'utf8').replace(NOT_MARKUP, (block) => block.replace(/[^\n]/g, ' '));
  const lineAt = (index) => text.slice(0, index).split('\n').length;
  const sectionId = text.match(/\{%-?\s*set\s+sectionId\s*=\s*['"](popup[^'"]*)['"]/);
  const filePopup = sectionId ? { id: sectionId[1], line: lineAt(sectionId.index) } : inheritedPopup;
  const groups = new Map();
  const addTo = (popup, hook) => {
    if (!groups.has(popup)) groups.set(popup, new Set());
    if (hook) groups.get(popup).add(hook);
  };
  if (sectionId) addTo(filePopup);
  const stack = [];
  const includes = [];
  for (const match of text.matchAll(TAG_OR_INCLUDE)) {
    const [, closing, rawTag, attrs, include] = match;
    const current = stack.at(-1)?.popup ?? filePopup;
    if (include) {
      includes.push({ target: join(dirname(file), include), popup: current });
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (closing) {
      const open = stack.findLastIndex((entry) => entry.tag === tag);
      if (open >= 0) stack.length = open;
      continue;
    }
    const line = lineAt(match.index);
    const id = attrs.match(/(?:^|\s)id=["']([^"']*)["']/)?.[1] || '';
    const popup = id.startsWith('popup') ? { id, line } : current;
    if (popup !== current) addTo(popup);
    const classHooks = attrs.match(/(?:^|\s)class=["']([^"']*)["']/)?.[1].match(/(?<![\w-])pm__[\w-]+/g) || [];
    const selector = (id.startsWith('pm__') ? `#${id}` : '') + classHooks.map((name) => `.${name}`).join('');
    if (selector) addTo(popup, `${selector}:${line}`);
    if (!VOID_TAGS.has(tag) && !attrs.endsWith('/')) stack.push({ tag, popup });
  }
  return { groups, includes };
}

function hookRows(dir, files) {
  const markup = files.filter((file) => MARKUP_FILE.test(file));
  const popupOfPartial = new Map();
  for (const file of markup) {
    for (const { target, popup } of scanMarkup(dir, file).includes) {
      if (popup && !popupOfPartial.has(target)) popupOfPartial.set(target, { id: popup.id });
    }
  }
  return markup.flatMap((file) => [...scanMarkup(dir, file, popupOfPartial.get(file)).groups].map(([popup, hooks]) => {
    const where = !popup ? '(ngoài popup)' : popup.line ? `#${popup.id}:${popup.line}` : `#${popup.id} (qua include)`;
    return `- \`${file}\` ${where}${hooks.size ? ` → ${[...hooks].join(' · ')}` : ''}`;
  }));
}

function handoffDirs(dir, isHandoff, depth = 1) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      if (depth > GAME_FOLDER_DEPTH && isHandoff(entry.name)) return [full];
      return depth < HANDOFF_SEARCH_DEPTH ? handoffDirs(full, isHandoff, depth + 1) : [];
    });
}

function campaignArg(target) {
  const campaign = target && campaignOf(target);
  if (!campaign || !existsSync(campaign.dir)) fail(`không phải campaign cdn-source: ${target} (cần …/products/<game>/landing/<slug>)`, 2);
  return campaign;
}

function openNote(target) {
  const campaign = campaignArg(target);
  const note = notePathFor(campaign.dir);
  if (!existsSync(note)) fail(`chưa có ${note} — chạy: project-note init ${campaign.dir}`, 1);
  return { campaign, note, text: readFileSync(note, 'utf8') };
}

function init(target, flag) {
  const { game, slug, dir } = campaignArg(target);
  const note = notePathFor(dir);
  if (existsSync(note)) fail(`đã có ${note} — không ghi đè; dùng refresh`, 1);
  const jira = flag('jira');
  const numbers = [jira?.match(/\d+/)?.[0], flag('nexus')].filter(Boolean);
  // Chỉ khớp ĐÚNG slug(+số): tên CHỨA slug dính campaign game khác (2026-trung-thu)
  const isHandoff = (name) => new RegExp(`^${slug}([-_]\\d+)?$`, 'i').test(name)
    || numbers.some((number) => new RegExp(`(^|\\D)${number}(\\D|$)`).test(name));
  const handoffs = (existsSync(GT_PROMOTION) ? handoffDirs(GT_PROMOTION, isHandoff) : []).sort().flatMap((found) => {
    const copies = readdirSync(found, { withFileTypes: true }).filter((e) => e.isDirectory() && /^(promotion|mainsite)/i.test(e.name));
    return copies.length ? copies.map((e) => join(found, e.name)).sort() : [found];
  });
  const files = sourceFiles(dir);
  const index = files.find((file) => ['index.html', 'index.html.twig'].includes(basename(file)));
  const title = (index && readFileSync(join(dir, index), 'utf8').match(/<title>([^<]+)<\/title>/)?.[1].trim()) || slug;
  const pkg = join(dir, 'package.json');
  const scripts = existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')).scripts || {} : {};
  const body = {
    lock: [HINT.lock, ...LOCK_FIELDS.map((field) => lockLine(field, UNLOCKED[field]))],
    places: [
      HINT.places,
      `- cdn-source: ${dir}`,
      ...(handoffs.length
        ? handoffs.map((handoff) => `- gt-promotion: ${handoff}`)
        : [`- gt-promotion: (không thấy thư mục tên = "${slug}" hoặc mang số ${numbers.join('/') || 'Jira/Nexus'} — điền tay)`]),
      '- new-mainsite: (chưa điền)',
      `- jira: ${jira || '(chưa điền)'}`,
      ...(flag('nexus') ? [`- nexus: ${flag('nexus')}`] : []),
    ],
    files: [HINT.files, ...fileRows(files)],
    hooks: [HINT.hooks, ...hookRows(dir, files)],
    decisions: [HINT.decisions],
    questions: [HINT.questions],
    debt: [HINT.debt],
    commands: [
      HINT.commands,
      ...Object.entries(scripts).map(([name, command]) => `- \`npm run ${name}\` — ${command}`),
      `- pm-gate: \`node ${AGENT_AUTO}/tools/pm-gate.mjs <file.html> --page ${dir}\``,
      `- layout-gate: \`node ${AGENT_AUTO}/tools/layout-gate.mjs ${dir}\``,
      '- check-promotion: `/check-promotion <loại|STT> <file.html>`',
      '- ui-check: `/ui-check` sau build',
    ],
    log: [HINT.log, `- ${today()} tạo file dự án (project-note init)`],
  };
  const sections = Object.entries(SECTION).map(([key, heading]) => `## ${heading}\n${body[key].join('\n')}\n`);
  mkdirSync(dirname(note), { recursive: true });
  writeFileSync(note, `# ${game}/${slug} — ${title}\n\n${sections.join('\n')}`);
  console.log(note);
}

function refresh(target) {
  const { campaign, note, text } = openNote(target);
  const files = sourceFiles(campaign.dir);
  const withFiles = editSection(text, SECTION.files, (old) => [HINT.files, ...fileRows(files, old)].join('\n'));
  writeFileSync(note, editSection(withFiles, SECTION.hooks, () => [HINT.hooks, ...hookRows(campaign.dir, files)].join('\n')));
  console.log(`đã cập nhật mục 3-4: ${note}`);
}

function check(target) {
  const { campaign, note, text } = openNote(target);
  const files = sourceFiles(campaign.dir);
  const listed = bullets(sectionBody(text, SECTION.files)).map((line) => line.match(FILE_ROW)?.[1]).filter(Boolean);
  const storedHooks = bullets(sectionBody(text, SECTION.hooks));
  const freshHooks = hookRows(campaign.dir, files);
  const problems = [
    ...(readLock(note) ? [] : ['mục 1: chưa khoá gameplay — chạy lock']),
    ...listed.filter((file) => !files.includes(file)).map((file) => `mục 3: không còn \`${file}\``),
    ...files.filter((file) => !listed.includes(file)).map((file) => `mục 3: chưa ghi \`${file}\``),
    ...storedHooks.filter((row) => !freshHooks.includes(row)).map((row) => `mục 4: lỗi thời ${row}`),
    ...freshHooks.filter((row) => !storedHooks.includes(row)).map((row) => `mục 4: chưa ghi ${row}`),
  ];
  console.log(`project-note check · ${campaign.game}/${campaign.slug}`);
  if (!problems.length) return console.log('  ✓ file dự án khớp đĩa');
  problems.forEach((problem) => console.log(`  ✗ ${problem}`));
  fail(`  → mục 3-4: project-note refresh ${campaign.dir} · mục 1: project-note lock`, 1);
}

function lock(target, flag) {
  const gameplay = flag('gameplay');
  if (!GAMEPLAYS.includes(gameplay)) fail(`--gameplay phải là: ${GAMEPLAYS.join(' | ')}`, 2);
  const { note, text } = openNote(target);
  // Lock lại mà thiếu cờ thì giữ giá trị đang có: tụt hooks-at source → handoff là cổng lỏng đi không báo.
  const current = (field) => sectionBody(text, SECTION.lock).match(new RegExp(`^- ${field}:[ \\t]*(.*)$`, 'm'))?.[1].trim() || '';
  const hooksAt = flag('hooks-at') || current('hooks-at') || HOOKS_AT_DEFAULT;
  if (!HOOKS_AT.includes(hooksAt)) fail(`--hooks-at phải là: ${HOOKS_AT.join(' | ')}`, 2);
  const kitSha = existsSync(KIT) ? execFileSync('git', ['-C', KIT, 'log', '-1', '--format=%h', '--', '.'], { encoding: 'utf8' }).trim() : '';
  const values = {
    gameplay,
    type: flag('type') || current('type'),
    ref: flag('ref') || current('ref'),
    'hooks-at': hooksAt,
    'nguồn chuẩn': kitSha && `kit ${kitSha}`,
    'ngày khoá': today(),
    'ai khoá': flag('by') || current('ai khoá'),
  };
  const setField = (body, field) => {
    const line = lockLine(field, values[field]);
    const pattern = new RegExp(`^- ${field}:.*$`, 'm');
    return pattern.test(body) ? body.replace(pattern, line) : `${body}\n${line}`;
  };
  writeFileSync(note, editSection(text, SECTION.lock, (body) => LOCK_FIELDS.reduce(setField, body)));
  console.log(`đã khoá gameplay: ${gameplay} · hooks-at: ${hooksAt} → ${note}`);
}

function debt(target, flag) {
  if (!flag('from')) fail('thiếu --from <pm-gate.json>', 2);
  const { campaign, note, text } = openNote(target);
  const parsed = JSON.parse(readFileSync(flag('from'), 'utf8'));
  const reports = Array.isArray(parsed) ? parsed : [parsed]; // pm-gate --page --json trả mảng, mỗi trang dist 1 report
  const items = reports.flatMap((report) => {
    const reportFile = resolve(report.file);
    const file = reportFile.startsWith(campaign.dir + sep) ? relative(campaign.dir, reportFile) : report.file;
    return [...report.preexisting, ...report.warns].map((f) => `${f.code} ${f.token} (${file})`);
  });
  const recorded = new Set(bullets(sectionBody(text, SECTION.debt)).map((line) => line.replace(/^- \[[ x]\] /, '')));
  const fresh = [...new Set(items)].filter((item) => !recorded.has(item));
  writeFileSync(note, editSection(text, SECTION.debt, (body) => [body, ...fresh.map((item) => `- [ ] ${item}`)].join('\n')));
  console.log(`thêm ${fresh.length} dòng nợ vào mục 7: ${note}`);
}

function log(target, _flag, entry) {
  if (!entry) fail('thiếu nội dung: project-note log <campaign> "<dòng>"', 2);
  const { note, text } = openNote(target);
  writeFileSync(note, editSection(text, SECTION.log, (body) => `${body}\n- ${today()} ${entry}`));
  console.log(`đã ghi nhật ký: ${note}`);
}

function path(target) {
  const note = target && noteForAnyFile(target);
  if (!note) fail(`không map được ${target} — chạy init trong campaign cdn-source trước`, 1);
  console.log(note);
  if (!existsSync(note)) console.error(`chưa có file — chạy: project-note init ${campaignOf(target).dir}`);
}

const COMMANDS = { path, init, refresh, check, lock, debt, log };
const [command, target, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? rest[at + 1] : undefined;
};
if (!COMMANDS[command]) fail('dùng: project-note <path|init|refresh|check|lock|debt|log> <campaign|file> [...]', 2);
COMMANDS[command](target, flag, rest[0]);
