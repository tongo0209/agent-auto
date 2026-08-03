/** Hàm định dạng thuần — không đụng DOM, không state */
import { LATE_EXEMPT_PHASES } from './constants.mjs';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Markdown INLINE tối thiểu cho nội dung lấy từ board .md: **đậm**, ~~gạch~~, `mã`.
 * Escape TRƯỚC rồi mới đổi thẻ nên vẫn an toàn với HTML trong board.
 * Cần vì board là file người gõ tay — gạch ngang việc đã xong là thao tác thật của user,
 * hiện ra `~~như này~~` thì đọc thành rác.
 */
export function inlineMd(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/** 2026-08-03 → 08/03 */
export function shortDate(iso) {
  return String(iso || '').slice(5).replace('-', '/');
}

/**
 * 2026-08 → T8/2026.
 * KHÔNG dùng dạng `26/08`: đọc thành "ngày 26 tháng 8" (đã nhầm thật khi xem chart).
 */
export function shortMonth(ym) {
  const [y, m] = String(ym || '').split('-');
  return y && m ? `T${Number(m)}/${y}` : String(ym || '');
}

export function toISODate(date) {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

export function daysUntil(iso, fromISO) {
  return Math.round((new Date(iso + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 864e5);
}

/** Mức gấp theo số ngày còn lại — dùng chung cho màu viền/nhãn */
export function severityByDays(days) {
  if (days <= 4) return 'crit';
  if (days <= 8) return 'warn';
  return 'ok';
}

/** Mốc gần nhất chưa qua của một issue */
export function nextMilestone(issue, todayISO) {
  return Object.entries(issue.milestones || {})
    .map(([name, date]) => ({ name, date, days: daysUntil(date, todayISO) }))
    .filter((m) => m.days >= 0)
    .sort((a, b) => a.days - b.days)[0];
}

/**
 * Mốc HTML đã qua mà phase chưa được miễn → coi là trễ.
 * `deliver` KHÔNG nằm trong danh sách miễn: đang giao HTML mà quá mốc thì vẫn là trễ.
 */
export function isLate(issue, todayISO) {
  const html = (issue.milestones || {}).html;
  if (!html) return false;
  return daysUntil(html, todayISO) < 0 && !LATE_EXEMPT_PHASES.includes(issue.phase);
}
