#!/usr/bin/env node
/**
 * Tự đóng ticket đã hết việc: HẾT mốc tương lai VÀ Jira đã Done.
 *
 * Vì sao cần: phase không bao giờ tự tiến khi mốc trôi qua, nên ticket `bugfix`/`wait-test`
 * nằm lại timeline vĩnh viễn và vẫn bị đếm là "đang làm" (console/src/core/marks.mjs:120 giữ
 * vô điều kiện mọi phase chưa done). Đo 14/9: GW-660 quá mốc 19 ngày, GW-477 14 ngày.
 *
 * Jira status là chốt an toàn của con người: quá mốc mà Jira còn To Do thì KHÔNG đóng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUPS_KEPT = 30;

const dayDiff = (fromISO, toISO) =>
  Math.round((Date.parse(toISO + 'T00:00:00') - Date.parse(fromISO + 'T00:00:00')) / 864e5);

export function shouldAutoClose(issue, { todayISO, doneStatuses }) {
  if (issue.phase === 'closed') return { close: false, reason: 'đã closed' };
  if (issue.phase === 'reassigned') return { close: false, reason: 'đã chuyển người' };

  const status = String(issue.status || '').toLowerCase();
  if (!doneStatuses.includes(status)) return { close: false, reason: `Jira còn "${issue.status}"` };

  const dates = Object.entries(issue.milestones || {})
    .filter(([name]) => !name.startsWith('_'))
    .map(([, date]) => date);
  if (!dates.length) return { close: false, reason: 'chưa có mốc nào' };

  const future = dates.filter((d) => dayDiff(todayISO, d) >= 0);
  if (future.length) return { close: false, reason: `còn ${future.length} mốc chưa tới` };

  const lastMilestone = [...dates].sort().pop();
  const daysPast = -dayDiff(todayISO, lastMilestone);
  return {
    close: true,
    lastMilestone,
    daysPast,
    reason: `quá mốc cuối ${lastMilestone} (${daysPast} ngày) + Jira ${issue.status}`,
  };
}

export function planAutoClose(state, opts) {
  return Object.entries(state.issues || {}).flatMap(([key, issue]) => {
    const verdict = shouldAutoClose(issue, opts);
    if (!verdict.close) return [];
    return [{ key, from: issue.phase, lastMilestone: verdict.lastMilestone, daysPast: verdict.daysPast, reason: verdict.reason }];
  });
}

export function applyAutoClose(state, plan, { nowISO }) {
  const next = structuredClone(state);
  const phaseLog = plan.map((p) => {
    const issue = next.issues[p.key];
    issue.phase = 'closed';
    issue.closedAuto = true;
    issue.closedAt = nowISO;
    issue.closedReason = p.reason;
    return { at: nowISO, key: p.key, from: p.from, to: 'closed', reason: `auto-close — ${p.reason}` };
  });
  return { state: next, phaseLog };
}

function backupState(root) {
  const dir = path.join(root, '.backups/state');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  fs.copyFileSync(path.join(root, 'state.json'), path.join(dir, `state-${stamp}.json`));
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().slice(0, -BACKUPS_KEPT);
  for (const f of old) fs.unlinkSync(path.join(dir, f));
}

/** Khuôn giống runJanitor: máy tự chạy được trong radar-tick, không cần LLM phán. */
export function runAutoClose({ root, now = new Date(), dry = false }) {
  const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));

  // Thiếu vocab thì BỎ LƯỢT có ghi lý do, không ném: radar-tick gọi hàm này, ném là chết cả
  // lượt canh buglist chỉ vì một file schema.
  const vocabPath = path.join(root, 'schema/vocab.json');
  if (!fs.existsSync(vocabPath)) return { closed: [], error: 'thiếu schema/vocab.json' };
  const { doneStatuses } = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));

  const plan = planAutoClose(state, { todayISO: now.toLocaleDateString('en-CA'), doneStatuses });
  if (!plan.length || dry) return { closed: plan };

  backupState(root);
  const { state: next, phaseLog } = applyAutoClose(state, plan, { nowISO: now.toISOString() });
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(next, null, 2));
  fs.appendFileSync(path.join(root, 'history/phases.jsonl'), phaseLog.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return { closed: plan };
}

function main() {
  const dry = !process.argv.includes('--apply');
  const { closed } = runAutoClose({ root: ROOT, dry });
  if (!closed.length) {
    console.log('✓ Không ticket nào đủ điều kiện tự đóng.');
    return;
  }
  for (const p of closed) console.log(`${p.key.padEnd(8)} ${p.from.padEnd(11)} → closed   ${p.reason}`);
  console.log(
    dry
      ? `\n${closed.length} ticket sẽ đóng. Chạy lại với --apply để ghi.`
      : `\n✓ Đã đóng ${closed.length} ticket, ghi phases.jsonl (state cũ ở .backups/state/).`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
