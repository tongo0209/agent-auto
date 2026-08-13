const vocab = require('../../../schema/vocab.json');

/**
 * Vốn từ phía server — DẪN XUẤT từ schema/vocab.json, không tự khai lại.
 *
 * Trước đây phase nằm ở 3 chỗ (constants.js client · phases.js server · prose SKILL.md) và
 * ngày 3/8 sinh 2 bug cùng họ: skill ghi `reassigned`, console không biết từ đó nên ticket
 * vừa lọt timeline vừa mất khỏi bảng.
 */
const idsWhere = (flag) => vocab.phases.filter((p) => p[flag]).map((p) => p.id);

const DONE_STATUSES = vocab.doneStatuses || [];
/**
 * Status Jira nghĩa là "đã đóng" — theo statusCategory chứ không chỉ chữ "Done"
 * (bẫy đã gặp: `Canceled`/`COMPLETED` cũng là statusCategory done).
 */
const isDoneStatus = (s) => Boolean(s) && DONE_STATUSES.includes(String(s).trim().toLowerCase());

/**
 * Ticket còn là việc của mình không — dùng CHUNG cho cảnh báo, nợ "Cần bạn", doctor.
 *
 * Vì sao không chỉ nhìn `phase` như trước: `phase` do skill suy từ commit/thao tác nên TỤT HẬU
 * so với Jira. Đo thật 13/8 trên dải cảnh báo: GW-477 (`status: Done`, phase `wait-test`),
 * GW-610 + GW-627 (`COMPLETED`) và GW-654 (đã bàn giao cho người khác — `assigneeNow`) đều
 * KHÔNG còn là việc của user mà vẫn kêu đỏ. 3 nguồn sự thật, thiếu nguồn nào cũng lọt:
 *   phase offMyPlate  ·  status Jira đã đóng  ·  đã có người nhận khác (`assigneeNow`)
 */
const isOffMyPlate = (issue) =>
  Boolean(
    issue &&
      (idsWhere('offMyPlate').includes(issue.phase) || isDoneStatus(issue.status) || Boolean(issue.assigneeNow))
  );

module.exports = {
  vocab,
  PHASE_IDS: vocab.phases.map((p) => p.id),
  PHASE_BY_ID: Object.fromEntries(vocab.phases.map((p) => [p.id, p])),
  /** Mốc không còn là deadline của mình → loại khỏi dải mốc + cảnh báo */
  OFF_MY_PLATE_PHASES: idsWhere('offMyPlate'),
  /** Còn phải làm mới ra được HTML */
  HTML_TODO_PHASES: idsWhere('htmlTodo'),
  /** Miễn "trễ mốc HTML". CHÚ Ý: `deliver` KHÔNG miễn — đang giao mà quá mốc thì vẫn trễ. */
  LATE_EXEMPT_PHASES: idsWhere('lateExempt'),
  /** Phase mà công việc đang nằm trong tay mình — khớp client `constants.mjs::ACTIVE_PHASES` */
  ACTIVE_PHASES: idsWhere('active'),
  MILESTONE_IDS: vocab.milestones.map((m) => m.id),
  MILESTONE_BY_ID: Object.fromEntries(vocab.milestones.map((m) => [m.id, m])),
  MUST_DELIVER_IDS: vocab.milestones.filter((m) => m.mustDeliver).map((m) => m.id),
  /**
   * Mốc "giao hàng" thật — ticket có thể mang 1 trong nhiều mốc này tuỳ luồng (`html` cho
   * ticket thường, `deliver` cho ticket có kênh promotion). Ca lộ ra chỗ thiếu (3/8):
   * GW-556 phase `coding`, mốc `deliver` 7/8 còn 4 ngày (mốc GẦN NHẤT trong cả hệ) nhưng
   * alerts.js cũ chỉ đọc `ms.html` → mảng cảnh báo mốc RỖNG cho ticket này.
   */
  KEY_MILESTONE_IDS: vocab.milestones.filter((m) => m.key).map((m) => m.id),
  /** Phase cần bàn giao (viết tasks/<KEY>/handoff.md) — KHÔNG suy từ offMyPlate (closed cũng offMyPlate mà không cần handoff) */
  NEEDS_HANDOFF_PHASES: idsWhere('needsHandoff'),
  DESIGN_STATUS_IDS: vocab.designStatus.map((d) => d.id),
  DONE_STATUSES,
  isDoneStatus,
  isOffMyPlate,
};
