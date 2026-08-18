#!/usr/bin/env node
/**
 * bug-radar — phần THUẦN TÍNH TOÁN của radar buglist hậu bàn giao.
 *
 * Vì sao tách khỏi skill: phần quyết định "bug nào mới", "bug nào của mình", "lượt này có
 * đáng gọi claude không" phải chạy được bằng máy và test được bằng máy. Để LLM tự nhớ thì
 * mỗi lượt radar ra một kết quả khác nhau, và không ai chứng minh được nó đúng.
 *
 * Thiết kế: docs/specs/2026-08-17-bug-radar-design.md
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  enabled: true,
  coolAfterHours: 3,
  freshFirstScanHours: 24,
};

const SHEET_URL = /docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/g;

export function extractSheetLinks(text = '') {
  const out = new Map();
  for (const m of String(text).matchAll(SHEET_URL)) {
    if (!out.has(m[1])) out.set(m[1], `https://docs.google.com/spreadsheets/d/${m[1]}`);
  }
  return [...out].map(([sheetId, url]) => ({ sheetId, url }));
}

export function normalizeCell(value = '') {
  return String(value)
    .replace(/\\([\\`*_{}[\]()#+\-.!>&])/g, '$1')
    .replace(/\[merged\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const COLUMNS = {
  bugid: 'bugId',
  'assignee fix': 'assignee',
  assignee: 'assignee',
  description: 'desc',
  image: 'image',
  reporter: 'reporter',
  'dev check status': 'devStatus',
  notes: 'notes',
  evidence: 'notes',
  'qc / gs recheck': 'recheck',
  'qc/gs recheck': 'recheck',
  'qc / gs check': 'recheck',
  'qc/gs check': 'recheck',
  recheck: 'recheck',
  'bug type': 'type',
};

const splitRow = (line) =>
  line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(normalizeCell);

const headerMap = (cells) => {
  const map = {};
  cells.forEach((cell, i) => {
    const field = COLUMNS[cell.toLowerCase()];
    if (field && map[field] === undefined) map[field] = i;
  });
  return map;
};

export function parseBugTable(markdown = '') {
  const lines = String(markdown).split('\n');
  const rows = [];
  let map = null;
  const seenIds = new Set();
  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      map = null;
      continue;
    }
    const cells = splitRow(line);
    if (/^[:\- ]+$/.test(cells.join(''))) continue;
    const asHeader = headerMap(cells);
    if (asHeader.bugId !== undefined && asHeader.desc !== undefined) {
      map = asHeader;
      continue;
    }
    if (!map) continue;
    const bugId = cells[map.bugId];
    if (!/^\d+$/.test(bugId)) continue;
    const pick = (field) => (map[field] === undefined ? '' : cells[map[field]] || '');
    const row = {
      bugId,
      assignee: pick('assignee'),
      desc: pick('desc'),
      image: pick('image'),
      reporter: pick('reporter'),
      devStatus: pick('devStatus'),
      notes: pick('notes'),
      recheck: pick('recheck'),
      type: pick('type'),
    };
    if (!row.desc) continue;
    if (seenIds.has(bugId)) continue;
    seenIds.add(bugId);
    rows.push(row);
  }
  return rows;
}

const TITLE_NOISE = /^(bug|buglist|list|web|event|fix|request|clone|mainsite|landing|ldp|page|\d{4,})$/;

function titleTokens(title = '') {
  return new Set(
    normalizeCell(title)
      .toLowerCase()
      .replace(/[[\]():,._/-]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !TITLE_NOISE.test(t)),
  );
}

export function matchSheetToTicket(sheetTitle, tickets = [], minScore = 0.5) {
  const sheet = titleTokens(sheetTitle);
  if (!sheet.size) return null;
  let best = null;
  for (const ticket of tickets) {
    const hits = [...sheet].filter((t) => titleTokens(ticket.summary).has(t)).length;
    const score = hits / sheet.size;
    if (score >= minScore && (!best || score > best.score)) best = { key: ticket.key, score };
  }
  return best;
}

export function looksLikeBugSheet(markdown = '') {
  return String(markdown)
    .split('\n')
    .some((line) => {
      if (!line.trim().startsWith('|')) return false;
      const map = headerMap(splitRow(line));
      return map.bugId !== undefined && map.desc !== undefined;
    });
}

export function rowHash(row = {}) {
  const payload = ['bugId', 'desc', 'devStatus', 'recheck', 'assignee', 'type']
    .map((f) => normalizeCell(row[f] || '').toLowerCase())
    .join('|');
  return createHash('sha1').update(payload).digest('hex').slice(0, 12);
}

const REOPEN = /fail|reopen|chưa (fix|xong|đạt)|not ?ok|còn lỗi|lỗi lại/i;

export function diffRows(seen = {}, rows = []) {
  const fresh = [];
  const changed = [];
  const reopened = [];
  const next = { ...seen };
  for (const row of rows) {
    const hash = rowHash(row);
    next[row.bugId] = hash;
    if (seen[row.bugId] === undefined) fresh.push(row);
    else if (seen[row.bugId] !== hash) {
      changed.push(row);
      if (REOPEN.test(row.recheck)) reopened.push(row);
    }
  }
  return { fresh, changed, reopened, next, actionable: [...fresh, ...changed] };
}

const DEV_DONE = /done|fixed|đã fix|hoàn thành|closed/i;

const QC_CONFIRMED = /confirm|verified|passed|đã (fix|xong|ok)|no bug|closed/i;
const DISMISSED = /skip|n\/a|cancel|reject|not a bug|bỏ qua/i;

export function isSettled(row = {}) {
  const recheck = normalizeCell(row.recheck);
  const devStatus = normalizeCell(row.devStatus);
  if (REOPEN.test(recheck)) return false;
  if (DISMISSED.test(recheck) || DISMISSED.test(devStatus)) return true;
  return QC_CONFIRMED.test(recheck) || DEV_DONE.test(devStatus);
}

const CODE_TYPE = /functional|performance|visual|css|layout|ui/i;
const CONTENT_TYPE = /content|text|nội dung|wording/i;

export function classifyBug(row = {}) {
  const assignee = normalizeCell(row.assignee).toLowerCase();
  const type = normalizeCell(row.type).toLowerCase();
  if (/game ?studio|^gs$/.test(assignee)) return 'not-mine';
  if (CONTENT_TYPE.test(type)) return /mainsite/.test(assignee) ? 'mine' : 'not-mine';
  if (CODE_TYPE.test(type)) return 'mine';
  return 'unknown';
}

export function prefilterMine(rows = []) {
  const buckets = { mine: [], notMine: [], unknown: [] };
  for (const row of rows) {
    const verdict = classifyBug(row);
    if (verdict === 'mine') buckets.mine.push(row);
    else if (verdict === 'unknown') buckets.unknown.push(row);
    else buckets.notMine.push(row);
  }
  return buckets;
}

export function updateHeat(entry = {}, modifiedTime, now = new Date(), cfg = {}) {
  const { coolAfterHours } = { ...DEFAULTS, ...cfg };
  const firstSight = !entry.modifiedTime;
  const changed = Boolean(modifiedTime) && modifiedTime !== entry.modifiedTime;
  let lastChangeAt = entry.lastChangeAt || null;
  if (changed) lastChangeAt = firstSight ? modifiedTime : new Date(now).toISOString();
  const idleH = lastChangeAt ? (Number(now) - Date.parse(lastChangeAt)) / 3.6e6 : Infinity;
  return {
    ...entry,
    modifiedTime: modifiedTime || entry.modifiedTime || null,
    lastChangeAt,
    lastPollAt: new Date(now).toISOString(),
    heat: idleH < coolAfterHours ? 'hot' : 'warm',
    changed,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function lastMilestone(milestones = {}) {
  const days = Object.entries(milestones)
    .filter(([field, value]) => !field.startsWith('_') && ISO_DAY.test(value))
    .map(([, value]) => value)
    .sort();
  return days.at(-1) || null;
}

export function shouldRetire(entry = {}, issues = {}, now = new Date()) {
  const keys = entry.keys || [];
  if (!keys.length) return false;
  const today = new Date(now).toISOString().slice(0, 10);
  return keys.every((key) => {
    const last = lastMilestone(issues[key]?.milestones);
    return Boolean(last) && last < today;
  });
}

export function firstScanMode(entry = {}, now = new Date(), cfg = {}) {
  if (Object.keys(entry.seenBugs || {}).length) return 'act';
  const { freshFirstScanHours } = { ...DEFAULTS, ...cfg };
  const ageH = entry.modifiedTime ? (Number(now) - Date.parse(entry.modifiedTime)) / 3.6e6 : Infinity;
  return ageH <= freshFirstScanHours ? 'act' : 'seed';
}

export function pickPrompt(state = {}, now = new Date(), cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const entries = Object.values(state.bugWatch || {});
  if (new Date(now).getMinutes() < 30) return { prompt: '/daily delta', why: 'full' };
  if (c.enabled === false) return { skip: 'bugradar-off' };
  if (entries.some((e) => e.heat === 'hot')) return { prompt: '/daily bugwatch', why: 'hot' };
  return { skip: 'cold' };
}

const GATES = {
  g1: 'assignee không còn là mình',
  g2: 'chưa biết task sống ở folder nào (chạy /daily link <KEY>)',
  g3: 'không đọc được sheet bằng account mình',
  g4: 'không có bug nào thuộc FE mình',
};

export function checkGates({ assigneeIsMe, pathsConfirmed, sheetReadable, mineCount = 0 } = {}) {
  const failed = [];
  if (!assigneeIsMe) failed.push('g1');
  if (!pathsConfirmed) failed.push('g2');
  if (!sheetReadable) failed.push('g3');
  if (!(mineCount > 0)) failed.push('g4');
  return { pass: failed.length === 0, failed, why: failed.map((g) => GATES[g]).join(' · ') || null };
}

export function summarize(seen, markdown) {
  const rows = parseBugTable(markdown);
  const { fresh, changed, reopened, next, actionable } = diffRows(seen, rows);
  const open = actionable.filter((r) => !isSettled(r));
  const buckets = prefilterMine(open);
  return {
    isBugSheet: looksLikeBugSheet(markdown),
    rowsTotal: rows.length,
    settled: actionable.length - open.length,
    toSkill: buckets.mine.length + buckets.unknown.length,
    fresh: fresh.map((r) => r.bugId),
    changed: changed.map((r) => r.bugId),
    reopened: reopened.map((r) => r.bugId),
    mine: buckets.mine.map((r) => ({ bugId: r.bugId, type: r.type, assignee: r.assignee, desc: r.desc })),
    notMine: buckets.notMine.map((r) => ({ bugId: r.bugId, assignee: r.assignee, type: r.type })),
    unknown: buckets.unknown.map((r) => ({ bugId: r.bugId, assignee: r.assignee, desc: r.desc })),
    next,
  };
}

const UNVERIFIED = {
  'build-failed': 'build không pass',
  'build-not-run': 'chưa build lại sau khi sửa',
  'live-mismatch': 'bản trên CDN chưa khớp dist local',
  'live-not-checked': 'chưa đối chiếu bản live trên CDN',
  'no-evidence': 'không có ảnh QC lẫn bước tái hiện để đối chiếu',
};

/**
 * Chấm độ chắc của một fix bằng BẰNG CHỨNG MÁY THU ĐƯỢC, không bằng lời LLM tự nhận.
 * Cùng bằng chứng phải ra cùng kết luận mọi lượt — đó là lý do nó nằm ở đây chứ không ở skill.
 */
export function gradeFix(evidence = {}) {
  const { buildOk, liveMatch, hasQcImage, repro } = evidence;
  const fail = (why) => ({ grade: 'unverified', why, whyLabel: UNVERIFIED[why] });
  if (buildOk !== true) return fail(buildOk === false ? 'build-failed' : 'build-not-run');
  if (liveMatch !== true) return fail(liveMatch === false ? 'live-mismatch' : 'live-not-checked');
  if (!hasQcImage && !repro) return fail('no-evidence');
  return { grade: 'verified', why: null, whyLabel: null };
}

export function countPending(state = {}) {
  const rows = Object.values(state.bugWatch || {}).flatMap((e) => e.pendingSheetWrite || []);
  return {
    total: rows.length,
    verified: rows.filter((r) => r.grade === 'verified').length,
    unverified: rows.filter((r) => r.grade !== 'verified').length,
  };
}

export function queueRow(entry = {}, row = {}, now = new Date()) {
  const graded = gradeFix(row.evidence || {});
  const queued = { ...row, ...graded, queuedAt: new Date(now).toISOString() };
  const rest = (entry.pendingSheetWrite || []).filter((r) => r.bugId !== row.bugId);
  return { ...entry, pendingSheetWrite: [...rest, queued] };
}

export function mergeWatch(bugWatch = {}, found = [], now = new Date()) {
  const next = { ...bugWatch };
  for (const { sheetId, url, key, title } of found) {
    const entry = next[sheetId] ? { ...next[sheetId] } : {
      url,
      title: title || null,
      keys: [],
      addedAt: new Date(now).toISOString(),
      modifiedTime: null,
      lastChangeAt: null,
      heat: 'warm',
      seenBugs: {},
      pendingSheetWrite: [],
    };
    if (key && !entry.keys.includes(key)) entry.keys = [...entry.keys, key];
    if (title && !entry.title) entry.title = title;
    next[sheetId] = entry;
  }
  return next;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'bugsheets');
const readJSON = (p, fb) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fb;
  }
};

function saveState(statePath, state) {
  const backupDir = path.join(ROOT, '.backups', 'state');
  fs.mkdirSync(backupDir, { recursive: true });
  const tag = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  fs.copyFileSync(statePath, path.join(backupDir, `state-${tag}.json`));
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

function cli([cmd, sheetId, payload]) {
  const statePath = path.join(ROOT, 'state.json');
  const state = readJSON(statePath, { issues: {}, bugWatch: {} });
  if (cmd === 'pick') {
    const cfg = readJSON(path.join(ROOT, 'config.json'), {}).bugRadar || {};
    return pickPrompt(state, new Date(), cfg);
  }
  if (cmd === 'pending') return countPending(state);
  const entry = (state.bugWatch || {})[sheetId] || {};
  if (cmd === 'queue') {
    const updated = queueRow(entry, JSON.parse(payload));
    state.bugWatch = { ...state.bugWatch, [sheetId]: updated };
    saveState(statePath, state);
    const row = updated.pendingSheetWrite.at(-1);
    return { sheetId, bugId: row.bugId, grade: row.grade, why: row.why, pending: countPending(state) };
  }
  const md = fs.readFileSync(path.join(CACHE, `${sheetId}.md`), 'utf8');
  const { next, ...found } = summarize(entry.seenBugs || {}, md);
  if (cmd === 'scan') return { sheetId, ...found, seenCount: Object.keys(next).length };
  if (cmd === 'commit') {
    const lastScan = {
      at: new Date().toISOString(),
      rowsTotal: found.rowsTotal,
      settled: found.settled,
      toSkill: found.toSkill,
      fresh: found.fresh.length,
      changed: found.changed.length,
      reopened: found.reopened,
      mine: found.mine.length,
      unknown: found.unknown.length,
      notMine: found.notMine.length,
    };
    state.bugWatch = { ...state.bugWatch, [sheetId]: { ...entry, seenBugs: next, lastScan } };
    saveState(statePath, state);
    return { sheetId, committed: Object.keys(next).length, lastScan };
  }
  throw new Error(`lệnh không hiểu: ${cmd} — dùng scan|commit|queue|pending|pick`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2));
}
