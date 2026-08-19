#!/usr/bin/env node
/**
 * janitor — dọn rác nặng của repo agent-auto, tự chạy, không cần ai bấm.
 *
 * Luật xương sống: CHỈ tự xoá thứ có ĐƯỜNG VỀ (tải lại được từ SharePoint). Thứ mất là mất
 * luôn thì chỉ báo, dù có nặng tới đâu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DEFAULTS = {
  enabled: true,
  donePhases: ['closed', 'done-fe', 'reassigned'],
  graceDays: 7,
  heavyDirs: ['_raw', '_src'],
  archiveKeepDays: 14,
  archiveAutoDelete: true,
  cacheKeepDays: 14,
  shotsKeepDays: 14,
  protect: [],
  backupsKeepPerFamily: 10,
};

const readJSON = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

const tryRead = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const SHAREPOINT_URL = /https:\/\/[^\s"']*sharepoint[^\s"']*/i;

export const ageDays = (now, when) => {
  const ms = typeof when === 'string' ? Date.parse(when) : Number(when);
  return Number.isFinite(ms) ? (Number(now) - ms) / 86400e3 : Infinity;
};

export function dirSize(target) {
  const st = fs.statSync(target);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(target).reduce((sum, name) => sum + dirSize(path.join(target, name)), 0);
}

export function restoreHint(root, key, state) {
  const dir = path.join(root, 'designs', key);
  const manifest = fs.existsSync(dir) && fs.readdirSync(dir).find((n) => n.startsWith('sp-manifest'));
  if (manifest) return { kind: 'manifest', ref: path.posix.join('designs', key, manifest) };

  const issue = (state.issues || {})[key];
  if (!issue) return { kind: 'none', ref: null };
  const link = issue.designLink || (JSON.stringify(issue).match(SHAREPOINT_URL) || [])[0];
  return link ? { kind: 'link', ref: link } : { kind: 'none', ref: null };
}

export function lastPhaseChange(root) {
  const raw = tryRead(path.join(root, 'history', 'phases.jsonl'));
  if (!raw) return {};
  const at = {};
  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      if (row.key && row.at) at[row.key] = row.at;
    } catch {
      continue;
    }
  }
  return at;
}

const ZIP_ENTRY = /^\s*(\d+)\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s+(.+)$/;

export function zipFullyExtracted(zipAbs, searchDir) {
  let listing;
  try {
    listing = execFileSync('unzip', ['-l', zipAbs], { encoding: 'utf8', maxBuffer: 64e6 });
  } catch {
    return false;
  }
  const entries = [];
  for (const line of listing.split('\n')) {
    const m = line.match(ZIP_ENTRY);
    if (m && !m[2].endsWith('/')) entries.push(path.basename(m[2]) + ':' + m[1]);
  }
  if (!entries.length) return false;

  const onDisk = new Set();
  for (const abs of walkFiles(searchDir, new Set())) {
    if (abs === zipAbs) continue;
    onDisk.add(path.basename(abs) + ':' + fs.statSync(abs).size);
  }
  return entries.every((e) => onDisk.has(e));
}

function planZips(root, key, dir) {
  const out = [];
  for (const abs of walkFiles(dir, new Set())) {
    if (path.extname(abs).toLowerCase() !== '.zip') continue;
    if (!zipFullyExtracted(abs, dir)) continue;
    out.push({
      rule: 'design-zip',
      key,
      path: path.relative(root, abs).split(path.sep).join('/'),
      bytes: fs.statSync(abs).size,
      restore: { kind: 'extracted', ref: path.relative(root, path.dirname(abs)).split(path.sep).join('/') },
    });
  }
  return out;
}

function planArchive({ root, now, cfg }) {
  const base = path.join(root, 'designs', '_archive');
  const victims = [];
  const skipped = [];
  if (!fs.existsSync(base)) return { victims, skipped };

  for (const name of fs.readdirSync(base)) {
    const abs = path.join(base, name);
    if (!fs.statSync(abs).isDirectory()) continue;
    const relPath = path.posix.join('designs', '_archive', name);
    const bytes = dirSize(abs);
    if (ageDays(now, fs.statSync(abs).mtimeMs) < cfg.archiveKeepDays) {
      skipped.push({ path: relPath, why: 'grace', bytes });
      continue;
    }
    if (!cfg.archiveAutoDelete) {
      skipped.push({ path: relPath, why: 'archive-manual', bytes });
      continue;
    }
    victims.push({ rule: 'design-archive', key: null, path: relPath, bytes, restore: { kind: 'superseded', ref: null } });
  }
  return { victims, skipped };
}

export function planDesigns({ root, state = { issues: {} }, now = new Date(), cfg = {} }) {
  const c = { ...DEFAULTS, ...cfg };
  const designs = path.join(root, 'designs');
  const victims = [];
  const skipped = [];
  if (!fs.existsSync(designs)) return { victims, skipped };

  const phaseAt = lastPhaseChange(root);
  for (const key of fs.readdirSync(designs)) {
    const dir = path.join(designs, key);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (key === '_archive') continue;

    const issue = (state.issues || {})[key];
    if (!issue) {
      skipped.push({ key, why: 'unknown-ticket', bytes: dirSize(dir) });
      continue;
    }
    if (c.protect.includes(key)) {
      skipped.push({ key, why: 'protected', bytes: dirSize(dir) });
      continue;
    }
    if (String((issue.design || {}).sourceIntegrity || '').trim().toUpperCase().startsWith('BAD')) {
      skipped.push({ key, why: 'source-broken', bytes: dirSize(dir) });
      continue;
    }
    victims.push(...planZips(root, key, dir));
    if (!c.donePhases.includes(issue.phase)) {
      skipped.push({ key, why: 'phase-active', bytes: dirSize(dir) });
      continue;
    }
    if (ageDays(now, phaseAt[key] || issue.lastSeenUpdated || fs.statSync(dir).mtimeMs) < c.graceDays) {
      skipped.push({ key, why: 'grace', bytes: dirSize(dir) });
      continue;
    }
    const restore = restoreHint(root, key, state);
    if (restore.kind === 'none') {
      skipped.push({ key, why: 'no-restore', bytes: dirSize(dir) });
      continue;
    }
    for (const sub of c.heavyDirs) {
      const abs = path.join(dir, sub);
      if (!fs.existsSync(abs)) continue;
      victims.push({
        rule: 'design-heavy',
        key,
        path: path.posix.join('designs', key, sub),
        bytes: dirSize(abs),
        restore,
      });
    }
  }

  const arch = planArchive({ root, now, cfg: c });
  return { victims: [...victims, ...arch.victims], skipped: [...skipped, ...arch.skipped] };
}

export function inventoryOf(abs, cap = 1000) {
  const st = fs.statSync(abs);
  if (!st.isDirectory()) return { files: [{ rel: path.basename(abs), bytes: st.size }], truncated: false };
  const files = [];
  for (const file of walkFiles(abs, new Set())) {
    if (files.length === cap) return { files, truncated: true };
    files.push({ rel: path.relative(abs, file).split(path.sep).join('/'), bytes: fs.statSync(file).size });
  }
  return { files, truncated: false };
}

export function applyPlan({ root, victims = [], now = new Date(), dry = false, inventoryCap = 1000 }) {
  const base = path.resolve(root);
  const guarded = [base, path.join(base, 'designs'), path.join(base, 'designs', '_archive')];
  const removed = [];
  const refused = [];
  let bytes = 0;

  for (const v of victims) {
    const abs = path.resolve(base, v.path);
    if (!abs.startsWith(base + path.sep) || guarded.includes(abs)) {
      refused.push(v.path);
      continue;
    }
    bytes += v.bytes;
    if (dry) continue;
    const inventory = inventoryOf(abs, inventoryCap);
    fs.rmSync(abs, { recursive: true, force: true });
    fs.appendFileSync(
      path.join(base, '.janitor-log.jsonl'),
      JSON.stringify({
        at: new Date(now).toISOString(),
        rule: v.rule,
        key: v.key || null,
        path: v.path,
        bytes: v.bytes,
        restore: v.restore,
        inventory,
      }) + '\n',
    );
    removed.push(v.path);
  }
  return { removed: removed.length, paths: removed, refused, bytes, dry };
}

function* walkFiles(dir, skip = new Set(['.git', 'node_modules'])) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (skip.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(abs, skip);
    else yield abs;
  }
}

const asVictim = (base, abs, rule, restoreKind) => ({
  rule,
  key: null,
  path: path.relative(base, abs).split(path.sep).join('/'),
  bytes: fs.statSync(abs).size,
  restore: { kind: restoreKind, ref: null },
});

export function planOps({ root, now = new Date(), cfg = {} }) {
  const c = { ...DEFAULTS, ...cfg };
  const victims = [];

  for (const abs of walkFiles(path.join(root, '.cache'))) {
    if (fs.statSync(abs).size === 0) victims.push(asVictim(root, abs, 'cache-empty', 'failed-read'));
    else if (ageDays(now, fs.statSync(abs).mtimeMs) >= c.cacheKeepDays) victims.push(asVictim(root, abs, 'cache-stale', 'regenerable'));
  }

  for (const abs of walkFiles(path.join(root, '.browserpilot', 'shots'))) {
    if (ageDays(now, fs.statSync(abs).mtimeMs) >= c.shotsKeepDays) victims.push(asVictim(root, abs, 'shots-stale', 'regenerable'));
  }

  const backups = path.join(root, '.backups');
  if (fs.existsSync(backups)) {
    const families = fs
      .readdirSync(backups, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(backups, e.name));
    for (const family of [backups, ...families]) {
      const files = fs
        .readdirSync(family, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.join(family, e.name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      for (const abs of files.slice(c.backupsKeepPerFamily)) victims.push(asVictim(root, abs, 'backup-rotate', 'rotated'));
    }
  }

  for (const abs of walkFiles(root)) {
    if (path.basename(abs) === '.DS_Store') victims.push(asVictim(root, abs, 'junk', 'junk'));
  }

  return { victims, skipped: [] };
}

export function dueToday(root, now = new Date()) {
  const raw = tryRead(path.join(root, 'history', 'janitor.jsonl'));
  if (!raw) return true;
  const rows = raw.split('\n').filter(Boolean);
  if (!rows.length) return true;
  try {
    const last = JSON.parse(rows[rows.length - 1]).at;
    return new Date(last).toDateString() !== new Date(now).toDateString();
  } catch {
    return true;
  }
}

const NEEDS_YOU = new Set(['no-restore', 'archive-manual']);

export function runJanitor({ root, now = new Date(), argv = [], cfg = {} } = {}) {
  const fromConfig = readJSON(path.join(root, 'config.json'), {}).janitor || {};
  const c = { ...DEFAULTS, ...fromConfig, ...cfg };
  const at = new Date(now).toISOString();
  if (c.enabled === false) return { at, skipped: 'disabled', removed: 0, bytes: 0, needsYou: [], rules: {} };

  const state = readJSON(path.join(root, 'state.json'), { issues: {} });
  const designs = planDesigns({ root, state, now, cfg: c });
  const ops = planOps({ root, now, cfg: c });
  const victims = [...designs.victims, ...ops.victims];
  const dry = argv.includes('--dry');
  const res = applyPlan({ root, victims, now, dry });

  const rules = {};
  for (const v of victims) {
    rules[v.rule] = rules[v.rule] || { n: 0, bytes: 0 };
    rules[v.rule].n += 1;
    rules[v.rule].bytes += v.bytes;
  }
  const needsYou = [...designs.skipped, ...ops.skipped].filter((s) => NEEDS_YOU.has(s.why));
  const row = {
    at,
    dry,
    removed: dry ? 0 : res.removed,
    bytes: res.bytes,
    refused: res.refused,
    rules,
    needsYou,
  };
  if (!dry) {
    fs.mkdirSync(path.join(root, 'history'), { recursive: true });
    fs.appendFileSync(path.join(root, 'history', 'janitor.jsonl'), JSON.stringify(row) + '\n');
  }
  return row;
}

const ALERT_FLOOR_BYTES = 100 * 1024 ** 2;

export function sweepAlert(res = {}) {
  const rows = res.skipped ? [] : res.needsYou || [];
  const heavy = rows.filter((s) => (s.bytes || 0) >= ALERT_FLOOR_BYTES);
  if (!heavy.length) return null;
  const total = heavy.reduce((n, s) => n + s.bytes, 0);
  const names = heavy.map((s) => `${s.key || s.path.split("/").slice(-2).join("/")} (${mb(s.bytes)})`).join(' · ');
  return `Janitor: ${mb(total)} không tự xoá được — ${names}. Xem: node tools/janitor.mjs --dry`;
}

const mb = (n) => (n / 1024 ** 2).toFixed(1) + ' MB';

export function formatReport(res = {}) {
  if (res.skipped) return `janitor: bỏ lượt (${res.skipped})`;
  const head = `janitor ${res.dry ? '(thử)' : ''} — thu hồi ${mb(res.bytes || 0)} qua ${res.removed || 0} mục`;
  const lines = Object.entries(res.rules || {}).map(([rule, s]) => `  · ${rule}: ${s.n} mục, ${mb(s.bytes)}`);
  const needs = (res.needsYou || []).map((s) => `  · ${s.key || s.path} — ${s.why} (${mb(s.bytes || 0)})`);
  if (needs.length) lines.push('', 'cần bạn quyết (không tự xoá được):', ...needs);
  if ((res.refused || []).length) lines.push('', `từ chối ${res.refused.length} đường dẫn ngoài repo`);
  return [head, ...lines].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  console.log(formatReport(runJanitor({ root: path.resolve(import.meta.dirname, '..'), argv: process.argv.slice(2) })));
}
