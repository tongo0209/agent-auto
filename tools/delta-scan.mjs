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
const HUB_CHECK_PHASES = ['waiting-design', 'ready', 'coding'];
const HUB_DESIGN_PENDING = ['chưa-có-link', 'đã-giao-chờ-link'];
const HUB_RECHECKED_WITHIN = 4 * HOUR;
const HUB_STALE_AFTER = 24 * HOUR;
const GIT_TIMEOUT = 60e3;
const PULLED_REPO = 'gt-promotion-template';
const LOG_FORMAT = '%x1e%H%x1f%ad%x1f%an%x1f%s';

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

export const parseGitLog = (log) =>
  log.split('\x1e').filter(Boolean).map((record) => {
    const [head, ...files] = record.split('\n');
    const [hash, date, author, subject] = head.split('\x1f');
    return { hash, date, author, subject, files: files.filter(Boolean) };
  });

export function unpushedByTicket(commitsByRepo, issues) {
  const unpushed = {};
  for (const [repo, commits] of Object.entries(commitsByRepo)) {
    for (const { hash, date, subject, files } of commits) {
      for (const key of ticketsOf(files, repo, issues)) (unpushed[key] ??= []).push({ repo, hash: hash.slice(0, 9), date, subject });
    }
  }
  return unpushed;
}

export function designQueues(issues, nowMs) {
  const designScanDue = [];
  const driveCheck = [];
  const accessCheck = [];
  for (const [key, { phase, design }] of Object.entries(issues)) {
    if (design?.accessPending && phase !== 'closed') accessCheck.push({ key, ...design.accessPending });
    if (!PRE_TEST_PHASES.includes(phase) || design?.status !== 'đã-giao-đã-tải') continue;
    if (design.link?.includes('drive.google.com')) driveCheck.push({ key, link: design.link, sourceModified: design.sourceModified });
    const lastScan = Date.parse(design.lastScanAt ?? design.downloadedAt);
    if (design.manifest && !design.scanDue && nowMs - lastScan > DESIGN_RESCAN_AFTER) designScanDue.push(key);
  }
  return { designScanDue, driveCheck, accessCheck };
}

export function hubCheckDue(issues, nowMs) {
  const today = localStamp(new Date(nowMs)).slice(0, 10);
  const due = [];
  for (const [key, { phase, nexusId, milestones, design = {} }] of Object.entries(issues)) {
    if (!HUB_CHECK_PHASES.includes(phase) || !nexusId) continue;
    const sinceHubCheck = nowMs - (Date.parse(design.hubCheckedAt) || 0);
    if (sinceHubCheck < HUB_RECHECKED_WITHIN) continue;
    const designDue = HUB_DESIGN_PENDING.includes(design.status) && milestones?.design <= today;
    const stale = phase === 'waiting-design' && sinceHubCheck > HUB_STALE_AFTER;
    if (!designDue && !stale) continue;
    due.push({ key, nexusId, url: `https://hub.vnggames.com/tickets/${nexusId}`, reason: designDue ? 'design-due' : 'stale' });
  }
  return due;
}

export function monthsStale(months, now) {
  const generated = months?.generatedAt;
  if (!generated) return true;
  const day = generated.length === 10 ? generated : localStamp(new Date(generated)).slice(0, 10);
  return day !== localStamp(now).slice(0, 10);
}

const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: GIT_TIMEOUT, stdio: ['ignore', 'pipe', 'pipe'] });

const errorText = (err) => String(err.stderr || err.message).trim().slice(0, 300);

// Fetch trước khi log: log suông chỉ thấy ref local, commit người khác vừa push là vô hình (ca 19/8).
// format-local chứ không format: commit ghi +0000 (bot CMS, merge GitLab) sẽ hiện sớm 7 tiếng (ca 9/9).
export function gitScan(dir, sinceIso, { pull }) {
  const result = { ok: true, stale: false, commits: [] };
  try {
    git(dir, pull ? ['pull', '--ff-only', '--quiet'] : ['fetch', '--quiet', '--all']);
  } catch (err) {
    Object.assign(result, { stale: true, error: errorText(err) });
  }
  let log;
  try {
    log = git(dir, ['log', '--all', `--since=${sinceIso}`, '--date=format-local:%Y-%m-%d %H:%M', `--pretty=format:${LOG_FORMAT}`, '--name-only']);
  } catch (err) {
    return { ...result, ok: false, stale: true, error: errorText(err) };
  }
  result.commits = parseGitLog(log);
  return result;
}

// Nhánh không có upstream thì coi origin/<default> là nơi đã push (cdn-source: tont → MR vào master).
export function unpushedScan(dir, paths) {
  const upstreamOrDefault = () => {
    try {
      return git(dir, ['rev-parse', '--abbrev-ref', '@{u}']).trim();
    } catch {
      return git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim();
    }
  };
  try {
    const base = upstreamOrDefault();
    const log = git(dir, ['log', `${base}..HEAD`, '--date=format-local:%Y-%m-%d %H:%M', `--pretty=format:${LOG_FORMAT}`, '--name-only', '--', ...paths]);
    return { base, commits: parseGitLog(log) };
  } catch (err) {
    return { commits: [], error: errorText(err) };
  }
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
  const unpushedCommits = {};
  const unpushedError = {};
  for (const [name, dir] of Object.entries(repoDirs)) {
    const { commits, ...status } = gitScan(dir, window.sinceIso, { pull: name === PULLED_REPO });
    let untracked = 0;
    for (const { hash, date, author, subject, files } of commits) {
      const keys = ticketsOf(files, name, issues);
      if (!keys.length) untracked += 1;
      for (const key of keys) (byTicket[key] ??= []).push({ repo: name, hash: hash.slice(0, 9), date, author, subject, files });
    }
    repos[name] = { ...status, commits: commits.length, untracked };
    const openPaths = Object.values(issues)
      .filter((issue) => issue.phase !== 'closed')
      .flatMap((issue) => (issue.paths ?? []).filter((p) => p.repo === name).map((p) => p.path));
    if (!openPaths.length) continue;
    const { commits: ahead, error } = unpushedScan(dir, openPaths);
    unpushedCommits[name] = ahead;
    if (error) unpushedError[name] = error;
  }
  return {
    window,
    repos,
    byTicket,
    unpushed: unpushedByTicket(unpushedCommits, issues),
    unpushedError,
    monthsStale: monthsStale(readJson(join(root, 'history', 'months.json'), null), now),
    ...designQueues(issues, now.getTime()),
    hubCheckDue: hubCheckDue(issues, now.getTime()),
    ms: Date.now() - startedMs,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root');
  const root = i === -1 ? resolve(fileURLToPath(import.meta.url), '..', '..') : process.argv[i + 1];
  console.log(JSON.stringify(deltaScan({ root }), null, 2));
}
