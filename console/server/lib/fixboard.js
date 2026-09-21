/**
 * Nguồn sự thật THỨ HAI về bug: board fix của skill `/bug-fixer-lite`
 * (`<repo>/.claude/bugs-lite/<slug>-<ngày>.md`).
 *
 * Vì sao cần: console đang đếm "chưa fix" theo trạng thái TRÊN SHEET, mà sheet chỉ đổi khi
 * user chạy `/daily bugwrite` — fix xong chưa kịp ghi thì console báo sai. Board biết trước sheet.
 * Module này CHỈ ĐỌC và không bao giờ ném: board hỏng thì bỏ file đó, đếm vào `skipped`.
 */
const fs = require('fs');
const path = require('path');

const BOARD_DIR = path.join('.claude', 'bugs-lite');
const BOARD_FILE = /^(.+)-(\d{4}-\d{2}-\d{2})(--.+)?\.md$/;
const GOOGLE_SHEET_ID = /spreadsheets\/d\/([\w-]{20,})/;
const SECTION = /^#{1,4}\s+(.+)$/;
const ENTRY_HEADING = /^#{2,4}\s+~*\*{0,2}[A-Za-z]{0,4}#/;
const ENTRY_BULLET = /^[-*]\s+\*\*#/;
const BUG_ID = /#(?:SheetRow)?([A-Za-z]{0,3}\d+)/gi;
const HEAD_CHARS = 2000;

const cache = new Map();

const isFixSection = (heading) => /fix/i.test(heading) && !/không|bỏ qua|báo\b/i.test(heading);
const normalizeBugId = (raw) => raw.toLowerCase();

function bugIdsOf(headLine) {
  const label = headLine.replace(/^#{2,4}\s+/, '').replace(/^[-*]\s+/, '');
  const bold = label.match(/\*\*(.+?)\*\*/)?.[1] ?? label.split('—')[0];
  return [...bold.matchAll(BUG_ID)].map((m) => normalizeBugId(m[1]));
}

function sheetWrittenOf(block) {
  const value = (block.match(/ghi-sheet[:*\s]*([^\n]*)/i)?.[1] || '').toLowerCase();
  if (/đã ghi|\bdone\b/.test(value)) return 'done';
  if (/skip/.test(value)) return 'skip';
  return 'pending';
}

/** 3 shape thật của board: `### #42 …` · `- **#3** …` · hàng bảng `| R15 | … |` dưới heading FIX */
function parseBoard(text) {
  const entries = [];
  let inFix = false;
  let open = null;
  let section = [];
  let tableEntries = [];

  const closeEntry = () => {
    if (!open) return;
    const block = open.join('\n');
    for (const bugId of bugIdsOf(open[0])) {
      entries.push({
        bugId,
        worksheet: open[0].match(/^[#\s]*\**([A-Za-z]{1,4})#/)?.[1]?.toUpperCase() || null,
        title: open[0].replace(/^[#\-*\s]+/, '').replace(/\*\*/g, '').trim(),
        sheetRow: Number(block.match(/sheetrow[:\s()]*(\d+)/i)?.[1]) || null,
        verdict: block.match(/verdict[:*\s]*([^\s*]+)/i)?.[1]?.toUpperCase() || null,
        commit: block.match(/\bcommit\s+`?([0-9a-f]{7,40})`?/i)?.[1] || null,
        sheetWritten: sheetWrittenOf(block),
      });
    }
    open = null;
  };

  /** Bảng fix ghi "Ghi-sheet cả 8 bug: done" MỘT lần dưới bảng ⇒ chốt ở cuối mục, không từng hàng */
  const closeSection = () => {
    closeEntry();
    const written = sheetWrittenOf(section.join('\n'));
    for (const entry of tableEntries) entries.push({ ...entry, sheetWritten: entry.sheetWritten || written });
    section = [];
    tableEntries = [];
  };

  for (const line of text.split('\n')) {
    const isEntry = ENTRY_HEADING.test(line) || ENTRY_BULLET.test(line);
    if (SECTION.test(line) && !isEntry) {
      closeSection();
      inFix = isFixSection(line);
      continue;
    }
    if (inFix) section.push(line);
    if (isEntry && !line.includes('~~')) {
      closeEntry();
      if (inFix) open = [line];
      continue;
    }
    if (inFix && !open && line.startsWith('|') && !/^[|\s:-]+$/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      const id = cells[0]?.match(/^\**#?([A-Za-z]{0,3}\d+)/)?.[1];
      if (id) {
        tableEntries.push({
          bugId: normalizeBugId(id),
          worksheet: null,
          title: cells[1] || '',
          sheetRow: Number(cells[0].match(/\((?:SheetRow|BugID)?\s*(\d+)\)/i)?.[1]) || null,
          verdict: line.match(/\b(PASS|FAIL)\b/)?.[1] || null,
          commit: line.match(/\bcommit\s+`?([0-9a-f]{7,40})`?/i)?.[1] || null,
          sheetWritten: /ghi-sheet/i.test(line) ? sheetWrittenOf(line) : null,
        });
      }
      continue;
    }
    if (open) open.push(line);
  }
  closeSection();
  return entries;
}

function parseCached(file) {
  const mtimeMs = fs.statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit;

  const text = fs.readFileSync(file, 'utf8');
  const fresh = {
    mtimeMs,
    entries: parseBoard(text),
    sheetIdHint: text.slice(0, HEAD_CHARS).match(GOOGLE_SHEET_ID)?.[1] || null,
  };
  cache.set(file, fresh);
  return fresh;
}

const subdirs = (dir) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
};

/** Board sống ở gốc repo, ở từng product, và ở từng landing — không quét đệ quy cả repo */
function boardDirs(repoRoot) {
  const dirs = [path.join(repoRoot, BOARD_DIR)];
  for (const product of subdirs(path.join(repoRoot, 'products'))) {
    dirs.push(path.join(product, BOARD_DIR));
    for (const campaign of subdirs(path.join(product, 'landing'))) dirs.push(path.join(campaign, BOARD_DIR));
  }
  return dirs.filter(fs.existsSync);
}

function resolveSheetId(slug, sheetIdHint, registry) {
  if (sheetIdHint) return { sheetId: sheetIdHint };
  const sheetUrl = registry[slug]?.sheetUrl;
  if (!sheetUrl) return { reason: 'slug-khong-co-trong-registry' };
  const id = sheetUrl.match(GOOGLE_SHEET_ID)?.[1];
  return id ? { sheetId: id } : { reason: 'sheet-url-khong-phai-google' };
}

/** Cùng bug ở 2 board: board ngày mới thắng; cùng ngày thì bản gộp thắng bản lane */
const isNewer = (a, b) =>
  a.fixedAt !== b.fixedAt ? a.fixedAt > b.fixedAt : a.lane === b.lane ? a.mtimeMs > b.mtimeMs : !a.lane;

function scanFixBoards({ repos, registry }) {
  const bySheet = {};
  const unmapped = [];
  let boards = 0;
  let skipped = 0;

  for (const repoRoot of Object.values(repos || {})) {
    for (const dir of boardDirs(repoRoot)) {
      for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
        const named = name.match(BOARD_FILE);
        boards += 1;
        if (!named) {
          skipped += 1;
          continue;
        }
        const file = path.join(dir, name);
        const [, slug, fixedAt, lane] = named;
        const { entries, sheetIdHint, mtimeMs } = parseCached(file);
        if (entries.length === 0) {
          skipped += 1;
          continue;
        }
        const { sheetId, reason } = resolveSheetId(slug, sheetIdHint, registry);
        if (!sheetId) {
          unmapped.push({ board: file, slug, reason, bugs: entries.length });
          continue;
        }
        const bugs = (bySheet[sheetId] ??= {});
        for (const entry of entries) {
          const row = { ...entry, fixedAt, board: file, lane: lane || null, mtimeMs };
          if (!bugs[entry.bugId] || isNewer(row, bugs[entry.bugId])) bugs[entry.bugId] = row;
        }
      }
    }
  }
  return { bySheet, unmapped, boards, skipped };
}

/** 3 trạng thái console cần: chưa fix · đã fix chưa ghi sheet · đã ghi sheet (sheet chưa refresh) */
function annotateOpenBugs(openBugs, boardBugs = {}) {
  return (openBugs || []).map((bug) => {
    const fix = boardBugs[normalizeBugId(String(bug.bugId))] || null;
    if (!fix) return { ...bug, fixState: 'chua-fix', fix: null };
    return { ...bug, fixState: fix.sheetWritten === 'done' ? 'da-ghi-sheet' : 'da-fix-chua-ghi-sheet', fix };
  });
}

module.exports = { scanFixBoards, annotateOpenBugs, parseBoard, boardDirs };
