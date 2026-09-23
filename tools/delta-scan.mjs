#!/usr/bin/env node
// Làm sẵn phần cơ học của `/daily delta` (git, cửa sổ quét, hàng quét design) rồi in JSON cho model đọc.
// Dùng: node tools/delta-scan.mjs [--root <agent-auto>]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOUR = 3600e3;
const JQL_OVERLAP = 30 * 60e3;
const DESIGN_RESCAN_AFTER = 48 * HOUR;
const PRE_TEST_PHASES = ['waiting-design', 'ready', 'coding', 'deliver'];
const GIT_TIMEOUT = 60e3;
const PULLED_REPO = 'gt-promotion-template';

const pad = (n) => String(n).padStart(2, '0');

export const localStamp = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Lùi 30 phút để không hụt thay đổi rơi vào khe giữa lúc JQL lượt trước chạy và lúc ghi lastRun (ca GW-805).
export function scanWindow(lastRun, nowMs) {
  if (!lastRun) return { sinceIso: new Date(nowMs - 4 * HOUR).toISOString(), jqlSince: null, jqlFallback: '-4h' };
  const since = new Date(Date.parse(lastRun) - JQL_OVERLAP);
  return { sinceIso: since.toISOString(), jqlSince: localStamp(since), jqlFallback: null };
}

export function ticketsOf(files, repo, issues) {
  return Object.entries(issues)
    .filter(([, issue]) => issue.phase !== 'closed')
    .filter(([, issue]) => (issue.paths ?? []).some((p) => p.repo === repo && files.some((f) => f.startsWith(`${p.path}/`))))
    .map(([key]) => key);
}

export function designQueues(issues, nowMs) {
  const designScanDue = [];
  const driveCheck = [];
  for (const [key, { phase, design }] of Object.entries(issues)) {
    if (!PRE_TEST_PHASES.includes(phase) || design?.status !== 'đã-giao-đã-tải') continue;
    if (design.link?.includes('drive.google.com')) driveCheck.push({ key, link: design.link, sourceModified: design.sourceModified });
    const lastScan = Date.parse(design.lastScanAt ?? design.downloadedAt);
    if (design.manifest && !design.scanDue && nowMs - lastScan > DESIGN_RESCAN_AFTER) designScanDue.push(key);
  }
  return { designScanDue, driveCheck };
}

export function monthsStale(months, now) {
  const generated = months?.generatedAt;
  if (!generated) return true;
  const day = generated.length === 10 ? generated : localStamp(new Date(generated)).slice(0, 10);
  return day !== localStamp(now).slice(0, 10);
}

const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: GIT_TIMEOUT, stdio: ['ignore', 'pipe', 'pipe'] });

// Fetch trước khi log: log suông chỉ thấy ref local, commit người khác vừa push là vô hình (ca 19/8).
// format-local chứ không format: commit ghi +0000 (bot CMS, merge GitLab) sẽ hiện sớm 7 tiếng (ca 9/9).
export function gitScan(dir, sinceIso, { pull }) {
  const result = { ok: true, stale: false, commits: [] };
  try {
    git(dir, pull ? ['pull', '--ff-only', '--quiet'] : ['fetch', '--quiet', '--all']);
  } catch (err) {
    Object.assign(result, { stale: true, error: String(err.stderr || err.message).trim().slice(0, 300) });
  }
  let log;
  try {
    log = git(dir, ['log', '--all', `--since=${sinceIso}`, '--date=format-local:%Y-%m-%d %H:%M', '--pretty=format:%x1e%H%x1f%ad%x1f%an%x1f%s', '--name-only']);
  } catch (err) {
    return { ...result, ok: false, stale: true, error: String(err.stderr || err.message).trim().slice(0, 300) };
  }
  result.commits = log.split('\x1e').filter(Boolean).map((record) => {
    const [head, ...files] = record.split('\n');
    const [hash, date, author, subject] = head.split('\x1f');
    return { hash, date, author, subject, files: files.filter(Boolean) };
  });
  return result;
}

const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};

export function deltaScan({ root, now = new Date() }) {
  const startedMs = Date.now();
  const { repos: repoDirs = {} } = readJson(join(root, 'config.json'), {});
  const { lastRun = null, issues = {} } = readJson(join(root, 'state.json'), {});
  const window = scanWindow(lastRun, now.getTime());
  const repos = {};
  const byTicket = {};
  for (const [name, dir] of Object.entries(repoDirs)) {
    const { commits, ...status } = gitScan(dir, window.sinceIso, { pull: name === PULLED_REPO });
    let untracked = 0;
    for (const { hash, date, author, subject, files } of commits) {
      const keys = ticketsOf(files, name, issues);
      if (!keys.length) untracked += 1;
      for (const key of keys) (byTicket[key] ??= []).push({ repo: name, hash: hash.slice(0, 9), date, author, subject, files });
    }
    repos[name] = { ...status, commits: commits.length, untracked };
  }
  return {
    window,
    repos,
    byTicket,
    monthsStale: monthsStale(readJson(join(root, 'history', 'months.json'), null), now),
    ...designQueues(issues, now.getTime()),
    ms: Date.now() - startedMs,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root');
  const root = i === -1 ? resolve(fileURLToPath(import.meta.url), '..', '..') : process.argv[i + 1];
  console.log(JSON.stringify(deltaScan({ root }), null, 2));
}
