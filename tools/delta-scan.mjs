#!/usr/bin/env node
// Làm sẵn phần cơ học của `/daily delta` (git, cửa sổ quét, hàng quét design) rồi in JSON cho model đọc.
// Dùng: node tools/delta-scan.mjs [--root <agent-auto>]

const HOUR = 3600e3;
const JQL_OVERLAP = 30 * 60e3;
const DESIGN_RESCAN_AFTER = 48 * HOUR;
const PRE_TEST_PHASES = ['waiting-design', 'ready', 'coding', 'deliver'];

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
