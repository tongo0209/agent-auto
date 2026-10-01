const crypto = require('crypto');
const { ownerKey } = require('./debt');

const URGENT_ALERTS = ['html-overdue', 'html-urgent', 'bug-reopened'];
const WAITING_MESSAGE = {
  'qc-test-no-buglist': (key) => `Ticket ${key} đã sang QC test — cho em xin link buglist để theo dõi bug nhé.`,
  'design-overdue': (key) => `Ticket ${key} đã qua mốc design — design có chưa ạ, em cần để bắt đầu dựng.`,
};
const REPLACED_BY_DEBT_GROUP = 'debt-dropped';
const RANK = { urgent: 0, bugs: 1, todo: 2, reminder: 3 };
const HASH_LEN = 10;

const shortHash = (text) => crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, HASH_LEN);
const isDoneLine = (line) => /^~~/.test(line.trim());

function itemId({ source, code, key, dedup, date, text, sheetId }) {
  if (source === 'alert') return `alert:${code}:${key}${dedup ? ':' + dedup : ''}`;
  if (source === 'doctor') return `doctor:${code}:${key}`;
  if (source === 'bugs') return `bugs:${sheetId}`;
  if (source === 'review') return `review:${key}`;
  if (source === 'need') return `need:${shortHash(text)}`;
  return `debt:${date}:${shortHash(text)}`;
}

function nextMilestoneDate(issue, today) {
  return (
    Object.values(issue?.milestones || {})
      .filter((date) => date >= today)
      .sort()[0] || null
  );
}

function alertItem(alert) {
  const base = { source: 'alert', code: alert.code, key: alert.key, level: alert.level, text: alert.text };
  if (WAITING_MESSAGE[alert.code]) {
    return { ...base, group: 'waiting', action: { kind: 'copy', message: WAITING_MESSAGE[alert.code](alert.key) } };
  }
  const urgent = URGENT_ALERTS.includes(alert.code);
  const action =
    alert.code === 'bug-reopened' && alert.sheetUrl
      ? { kind: 'fixbug', sheetUrl: alert.sheetUrl }
      : { kind: 'ticket', key: alert.key };
  return {
    ...base,
    group: 'now',
    rank: urgent ? RANK.urgent : RANK.reminder,
    id: itemId({ ...base, dedup: alert.dedup }),
    action,
  };
}

function doctorItems({ errors = [], warns = [] }) {
  const items = errors.map((f) => ({
    source: 'doctor',
    code: f.code,
    key: f.key || '',
    level: 'crit',
    rank: RANK.urgent,
    text: `state.json sai hợp đồng (${f.code}): ${f.text}`,
  }));
  if (warns.length) {
    const codes = [...new Set(warns.map((w) => w.code))].join(', ');
    items.push({
      source: 'doctor',
      code: 'warns',
      key: '',
      level: 'warn',
      rank: RANK.reminder,
      text: `state.json: ${warns.length} cảnh báo hợp đồng (${codes})`,
    });
  }
  return items.map((i) => ({ ...i, group: 'now', action: { kind: 'doctor' } }));
}

function bugItems(pendingRows) {
  const bySheet = new Map();
  for (const row of pendingRows) {
    const entry = bySheet.get(row.sheetId) || { row, count: 0 };
    entry.count += 1;
    bySheet.set(row.sheetId, entry);
  }
  return [...bySheet.values()].map(({ row, count }) => ({
    source: 'bugs',
    sheetId: row.sheetId,
    key: row.keys[0] || '',
    level: 'warn',
    group: 'now',
    rank: RANK.bugs,
    text: `${count} bug đã fix chờ bạn duyệt trước khi ghi Done — ${row.sheetTitle}`,
    action: { kind: 'bugs' },
  }));
}

function reviewItems(review) {
  return review
    .filter((r) => r.dirty || r.unpushed)
    .map((r) => ({
      source: 'review',
      key: r.key,
      level: 'warn',
      group: 'now',
      rank: RANK.todo,
      text: [r.dirty && `${r.dirty} file chưa commit`, r.unpushed && `${r.unpushed} commit chưa push`]
        .filter(Boolean)
        .join(' · '),
      action: { kind: 'review' },
    }));
}

function needItems({ boardDate, needYou = [] }) {
  return needYou
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => !isDoneLine(text))
    .map(({ text, index }) => ({
      source: 'need',
      key: ownerKey(text) || '',
      level: 'warn',
      group: 'now',
      rank: RANK.todo,
      text,
      action: { kind: 'need-check', date: boardDate, index, text },
    }));
}

function debtItems({ groups = [] }) {
  return groups
    .flatMap((g) => g.items.map((i) => ({ ...i, key: g.key || '' })))
    .sort((a, b) => !a.key - !b.key || a.date.localeCompare(b.date))
    .map((i) => ({
      source: 'debt',
      key: i.key,
      loose: !i.key,
      date: i.date,
      level: 'info',
      group: 'debt',
      text: i.text,
      staleDays: i.staleDays,
      action: { kind: 'debt-check', date: i.date, index: i.index, text: i.text },
    }));
}

function snoozeOf(item, snoozes, today) {
  const s = snoozes[item.id];
  if (!s || today >= s.until) return null;
  const escalated = s.level !== 'crit' && item.level === 'crit';
  return escalated ? null : s;
}

const byRankThenDue = (a, b) =>
  (a.rank ?? 0) - (b.rank ?? 0) ||
  (a.due || '9999').localeCompare(b.due || '9999') ||
  a.key.localeCompare(b.key);

/** Cùng ticket nhiều lý do (mốc gấp · file chưa commit · đứng yên) gộp một dòng; dòng "Cần bạn" là checkbox nên đứng riêng */
function groupByTicket(sorted) {
  const out = [];
  const byKey = new Map();
  for (const item of sorted) {
    const head = item.key && item.source !== 'need' && byKey.get(item.key);
    if (!head) {
      out.push(item);
      if (item.key && item.source !== 'need') byKey.set(item.key, item);
      continue;
    }
    if (!head.reasons) head.reasons = [{ id: head.id, text: head.text, level: head.level }];
    head.reasons.push({ id: item.id, text: item.text, level: item.level });
  }
  return out.map((i) => (i.reasons ? { ...i, ids: i.reasons.map((r) => r.id) } : i));
}

function buildQueue({ today, issues, alerts, doctor, board, debt, review, bugs, snoozes }) {
  const all = [
    ...doctorItems(doctor),
    ...alerts.filter((a) => a.code !== REPLACED_BY_DEBT_GROUP).map(alertItem),
    ...bugItems(bugs),
    ...reviewItems(review),
    ...needItems(board),
  ]
    .map((i) => ({ ...i, id: i.id || itemId(i), due: nextMilestoneDate(issues[i.key], today) }))
    .concat(debtItems(debt).map((i) => ({ ...i, id: itemId(i), due: null })));

  const out = { now: [], waiting: [], debt: [], snoozed: [] };
  for (const item of all) {
    const snooze = snoozeOf(item, snoozes, today);
    if (snooze) out.snoozed.push({ ...item, snoozedUntil: snooze.until });
    else out[item.group].push(item);
  }
  out.now = groupByTicket(out.now.sort(byRankThenDue));
  out.waiting.sort(byRankThenDue);
  return out;
}

function applySnooze(snoozes, { id, until, level, text }, at = new Date().toISOString()) {
  const next = { ...snoozes };
  if (until) next[id] = { until, level, text, at };
  else delete next[id];
  return next;
}

function pruneSnoozes(snoozes, today) {
  return Object.fromEntries(Object.entries(snoozes).filter(([, s]) => s.until > today));
}

module.exports = { buildQueue, itemId, applySnooze, pruneSnoozes };
