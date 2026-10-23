import { esc } from '../lib.js';

export const JIRA = 'https://vnggames.atlassian.net';

export const PHASE = {
  bugfix: { label: 'fix bug', group: 'Fix bug', tone: 'crit', icon: 'ph-bug-beetle' },
  coding: { label: 'đang code', group: 'Đang code', tone: 'warn', icon: 'ph-code' },
  deliver: { label: 'giao HTML', group: 'Giao HTML', tone: 'warn', icon: 'ph-package' },
  ready: { label: 'sẵn sàng', group: 'Sẵn sàng', tone: 'ok', icon: 'ph-flag-banner' },
  'waiting-design': { label: 'chờ design', group: 'Chờ design', tone: 'run', icon: 'ph-paint-brush' },
  'wait-test': { label: 'chờ test', group: 'Chờ test', tone: 'run', icon: 'ph-flask' },
  'done-fe': { label: 'xong FE', group: 'Đã xong / ra khỏi tay', tone: 'ok', icon: 'ph-check-circle', folded: true },
  reassigned: { label: 'đã chuyển người', group: 'Đã xong / ra khỏi tay', tone: 'mute', icon: 'ph-user-switch', folded: true },
  closed: { label: 'đóng', group: 'Đã xong / ra khỏi tay', tone: 'mute', icon: 'ph-archive', folded: true },
};
// Autopilot nhận ticket còn việc FE; ticket đã có run đang mở thì dẫn sang run đó thay vì chạy thêm
export const RUNNABLE_PHASES = ['ready', 'coding', 'bugfix'];
export const keysWithOpenRun = (runs) => new Set(runs.filter((r) => r.status !== 'done' && r.stopReason !== 'aborted').map((r) => r.key));
export function runChip(key, phase, openKeys) {
  if (openKeys.has(key)) return `<button class="vw-link" data-view-run="${esc(key)}">Xem run</button>`;
  return RUNNABLE_PHASES.includes(phase) ? `<button class="run-chip" data-run-key="${esc(key)}" title="Xem trước các bước autopilot cho ${esc(key)}"><i class="ph-bold ph-play"></i>Chạy</button>` : '';
}
export const phaseOf = (id) => PHASE[id] ?? { label: id ?? 'không rõ', group: 'Phase lạ', tone: 'mute', icon: 'ph-question' };

export const MILESTONE = { design: 'Design', html: 'HTML', deliver: 'Giao HTML', dev: 'Dev BE', test: 'Test', bugfix: 'Fix bug', release: 'Release', review1: 'Review 1', review2: 'Review 2', duedate: 'Due Jira' };

export const daysUntil = (iso, fromIso) => Math.round((new Date(`${iso}T00:00:00`) - new Date(`${fromIso}T00:00:00`)) / 864e5);
export const shortDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const URGENT_DAYS = 4;
const SOON_DAYS = 8;
const OFF_MY_PLATE = ['reassigned', 'closed'];
const LATE_EXEMPT = ['wait-test', 'bugfix', 'done-fe', 'reassigned', 'closed'];
export const toneByDays = (days) => (days <= URGENT_DAYS ? 'crit' : days <= SOON_DAYS ? 'warn' : 'ok');
export const realMilestones = (issue) => Object.entries(issue.milestones ?? {}).filter(([name]) => !name.startsWith('_'));
export const isLate = (issue, today) => Boolean(issue.milestones?.html) && daysUntil(issue.milestones.html, today) < 0 && !LATE_EXEMPT.includes(issue.phase);
export function nextMilestone(issue, today) {
  if (OFF_MY_PLATE.includes(issue.phase)) return null;
  return realMilestones(issue)
    .map(([name, date]) => ({ name, date, days: daysUntil(date, today) }))
    .filter((m) => m.days >= 0)
    .sort((a, b) => a.days - b.days)[0] ?? null;
}
export const hhmm =(iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--');
export const stamp = (iso) => String(iso ?? '').replace('T', ' ').slice(0, 16);

export const inlineMd = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

const tableHtml = (rows) => {
  const cells = rows.filter((r) => !/^\|[\s:|-]+\|?\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|'));
  const [head, ...body] = cells;
  return `<table><thead><tr>${head.map((c) => `<th>${inlineMd(c.trim())}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
};

export function markdown(src) {
  const lines = String(src ?? '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    } else if (/^#{1,4} /.test(line)) {
      const level = Math.min(line.indexOf(' '), 3);
      out.push(`<h${level}>${inlineMd(line.slice(line.indexOf(' ') + 1))}</h${level}>`);
    } else if (line.startsWith('|')) {
      const rows = [line];
      while (lines[i + 1]?.startsWith('|')) rows.push(lines[++i]);
      out.push(tableHtml(rows));
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const items = [line];
      while (lines[i + 1] !== undefined && (/^\s*([-*]|\d+\.) /.test(lines[i + 1]) || /^\s{2,}\S/.test(lines[i + 1]))) items.push(lines[++i]);
      out.push(`<ul>${items.map((l) => {
        const box = l.match(/^\s*[-*] \[([ xX])\] /);
        const body = l.replace(/^\s*([-*]|\d+\.) (\[[ xX]\] )?/, '');
        return `<li class="${/^\s{2,}/.test(l) ? 'sub' : ''}">${box ? `<i class="ph${box[1] === ' ' ? '' : '-fill'} ph-check-square"></i> ` : ''}${inlineMd(body)}</li>`;
      }).join('')}</ul>`);
    } else if (line.startsWith('> ')) out.push(`<blockquote>${inlineMd(line.slice(2))}</blockquote>`);
    else if (/^-{3,}$/.test(line.trim())) out.push('<hr>');
    else if (line.trim()) out.push(`<p>${inlineMd(line)}</p>`);
  }
  return out.join('');
}

const ENTRANCE_MS = 1000;
export function settler(root) {
  let armed = false;
  return () => {
    if (armed) return;
    armed = true;
    setTimeout(() => root.classList.add('vw-settled'), ENTRANCE_MS);
  };
}

export const skeleton = (rows = 4) => `<div class="vw-skel">${'<div class="skel"></div>'.repeat(rows)}</div>`;
export const note = (icon, html, cls = '') => `<div class="vw-note ${cls}"><i class="ph ${icon}"></i><span>${html}</span></div>`;
export const errNote = (err) => note('ph-warning-circle', `Không đọc được dữ liệu: ${esc(err?.message ?? err)}`, 'err');
export const pill = (tone, html, title = '') => `<span class="vw-pill t-${tone}"${title ? ` title="${esc(title)}"` : ''}>${html}</span>`;

// Lệnh có hậu quả (fix bug, dev, commit) chỉ chép + mở CLI, người dùng tự dán và Enter
export async function draft(ctx, command, title, launch = 'claude') {
  try {
    await navigator.clipboard.writeText(command);
    ctx.openTerminal(launch, title);
    ctx.toast('Đã chép lệnh và mở CLI. Dán vào rồi tự bấm Enter.');
  } catch {
    window.prompt('Chép tay lệnh này rồi dán vào CLI:', command);
  }
}
