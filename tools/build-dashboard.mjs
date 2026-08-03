#!/usr/bin/env node
/**
 * Sinh khối DATA của dashboard.html từ state.json — trước đây khối này VIẾT TAY nên tự lệch:
 * sáng 3/8 dashboard vẫn ghi GW-654 là việc của user trong khi ticket đã chuyển người từ 10:02.
 *
 * Chạy: node tools/build-dashboard.mjs   (hoặc npm run dashboard trong console/)
 */
import fs from 'node:fs';
import path from 'node:path';
import vocabDefault from '../schema/vocab.json' with { type: 'json' };

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const START = '/* ===== DATA — /daily regenerate phần này mỗi lần chạy ===== */';
const END = '/* ===== hết phần DATA ===== */';
const HORIZON = 14;

/**
 * Số ngày từ fromISO đến toISO (chuỗi YYYY-MM-DD).
 * Cố tình KHÔNG dùng `new Date(iso + 'T00:00:00')` rồi `.toISOString()` — cặp đó dựng giờ
 * theo local time rồi đọc lại theo UTC, ở máy UTC+7 ra lệch 1 ngày (bẫy đã dính ở task khác).
 * Ở đây parse tay 3 phần Y-M-D rồi dựng mốc UTC thuần bằng Date.UTC — không phụ thuộc
 * timezone của máy chạy, trừ 2 mốc UTC cho nhau ra đúng số ngày lịch.
 */
const days = (fromISO, toISO) => {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 864e5);
};

/** "hôm nay" theo YYYY-MM-DD giờ ĐỊA PHƯƠNG (không dùng toISOString — đó là giờ UTC). */
function localToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** phase → status của dashboard (GROUPS trong dashboard.html) — suy từ cờ vocab, không hardcode danh sách phase */
function statusOf(phase, vocab) {
  const p = vocab.phases.find((x) => x.id === phase);
  if (!p) return 'waiting';
  if (p.active) return 'running';
  if (p.id === 'ready') return 'planned';
  if (p.id === 'done-fe') return 'done';
  return 'waiting';
}

export function buildBoardData({ state, boardMd, today, vocab = vocabDefault }) {
  const offPlate = vocab.phases.filter((p) => p.offMyPlate).map((p) => p.id);
  const mustDeliver = vocab.milestones.filter((m) => m.mustDeliver).map((m) => m.id);
  const label = Object.fromEntries(vocab.milestones.map((m) => [m.id, m.label]));

  const allEntries = Object.entries(state.issues || {});
  // Ticket offMyPlate (reassigned/closed) KHÔNG vào dashboard — đây chính là bug GW-654 đang sửa.
  const entries = allEntries.filter(([, i]) => !offPlate.includes(i.phase));
  // KHÔNG che tên ticket trong phần chữ tự do (`note`, `todos`). Luật "ticket đã ra khỏi tay
  // không vào dashboard" áp cho THẺ TASK và MỐC — tức chỗ nó bị đọc thành deadline của mình.
  // Còn khi tên nó xuất hiện trong một câu việc ("bàn giao 4 mục cho Đạt"), đó chính là việc
  // THẬT còn phải làm: che đi là làm hỏng nội dung của user để thoả một phép kiểm sai.

  const week = [];
  for (const [key, issue] of entries) {
    for (const [name, date] of Object.entries(issue.milestones || {})) {
      // bỏ key ghi chú của skill (vd `_conflict`, `_designGuess`) và mốc không phải mustDeliver (vd duedate Jira)
      if (name.startsWith('_') || !mustDeliver.includes(name)) continue;
      const d = days(today, date);
      if (d >= 0 && d <= HORIZON) week.push({ key, name, date, label: label[name], days: d });
    }
  }
  week.sort((a, b) => a.date.localeCompare(b.date));

  const tasks = entries.map(([key, issue]) => {
    const next = week.find((w) => w.key === key);
    return {
      key,
      url: `https://vnggames.atlassian.net/browse/${key}`,
      title: issue.summary || key,
      lane: issue.lastAction || '—',
      repo: (issue.paths || [])[0]?.repo || '—',
      due: next ? next.date : today,
      dueLabel: next ? `${next.label} ${next.date.slice(5).replace('-', '/')}` : '—',
      status: statusOf(issue.phase, vocab),
      phase: (vocab.phases.find((p) => p.id === issue.phase) || {}).label || issue.phase,
      note: issue.note || '',
    };
  });

  // "Cần bạn" bóc từ board hôm nay: chỉ dòng chưa tick (`- [ ] `), bỏ dòng đã tick (`- [x] `)
  const todos = String(boardMd || '')
    .split('\n')
    .filter((l) => l.startsWith('- [ ] '))
    .map((l) => l.slice(6).trim());

  return { date: today, week, tasks, todos, weekWarn: '' };
}

export function renderDashboard({ root = REPO_ROOT, today = localToday() } = {}) {
  const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
  const boardPath = path.join(root, 'boards', `${today}.md`);
  const boardMd = fs.existsSync(boardPath) ? fs.readFileSync(boardPath, 'utf8') : '';
  const data = buildBoardData({ state, boardMd, today });

  const file = path.join(root, 'dashboard.html');
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  // Không tìm thấy marker thì THROW, không ghi mù — ghi mù là phá trang của user.
  if (a < 0 || b < 0) throw new Error('dashboard.html thiếu marker DATA — đừng ghi mù, sửa marker trước');

  const block = `${START}\nconst BOARD = ${JSON.stringify(data, null, 2)};\n`;
  const out = html.slice(0, a) + block + html.slice(b);

  // Ghi atomic: ghi ra .tmp rồi renameSync — đứt giữa đường không để lại file HTML rách.
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file);
  return { tasks: data.tasks.length, week: data.week.length };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const r = renderDashboard({});
  console.log(`✓ dashboard.html: ${r.tasks} task · ${r.week} mốc`);
}
