import { TASK_GROUPS } from './constants.mjs';

/** Phase nằm trong nhóm đóng sẵn — suy từ TASK_GROUPS để ĐẾM và NHÓM không bao giờ lệch nhau */
export const FOLDED_PHASES = new Set(TASK_GROUPS.filter((g) => g.collapsed).flatMap((g) => g.phases));

/**
 * Chia nhóm + đếm cho bảng task. Hàm THUẦN (không DOM) để test được — ngày 3/8 hai bug
 * nằm đúng ở đây: phase lạ bị bỏ im lặng, và số đếm tiêu đề lệch số dòng vẽ ra.
 *
 * @param issues  mảng [key, issue]
 * @param filterText  chuỗi lọc (khớp key · summary · note)
 * @param expanded    { [label]: true } — nhóm user đã bấm mở
 */
export function groupTasks(issues, { filterText = '', expanded = {} } = {}) {
  const q = String(filterText).trim().toLowerCase();
  const matched = issues.filter(([key, i]) =>
    !q || (key + ' ' + (i.summary || '') + ' ' + (i.note || '')).toLowerCase().includes(q)
  );

  const groups = TASK_GROUPS.map((g) => ({
    label: g.label,
    phases: g.phases,
    collapsed: Boolean(g.collapsed),
    items: matched.filter(([, i]) => g.phases.includes(i.phase) && (!g.where || g.where(i))),
  })).filter((g) => g.items.length);

  // TASK_GROUPS là WHITELIST phase: phase lạ (skill ghi giá trị console chưa biết) trước đây
  // rơi vào hư không. Giờ gom thành nhóm hiện rõ để còn biết mà khai bổ sung.
  const shown = new Set(groups.flatMap((g) => g.items.map(([key]) => key)));
  const orphans = matched.filter(([key]) => !shown.has(key));
  if (orphans.length) {
    groups.push({ label: 'Phase lạ — console chưa khai báo', phases: [], collapsed: false, items: orphans });
  }

  // Nhóm đóng sẵn luôn xuống cuối, kể cả khi có nhóm "phase lạ" chen vào (sort ổn định)
  groups.sort((a, b) => (a.collapsed ? 1 : 0) - (b.collapsed ? 1 : 0));
  for (const g of groups) g.folded = g.collapsed && expanded[g.label] !== true && !q;

  const isTracked = ([, i]) => !FOLDED_PHASES.has(i.phase);
  return {
    groups,
    trackedTotal: issues.filter(isTracked).length,
    trackedMatched: matched.filter(isTracked).length,
    orphanCount: orphans.length,
  };
}
