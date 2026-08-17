/**
 * Hằng số nghiệp vụ — thuần DATA, không nhúng HTML/emoji.
 * `icon` là TÊN NGHIỆP VỤ khai báo trong `@core/icons`; panel gọi `icon(name)` để lấy SVG.
 */
// Đường dẫn TƯƠNG ĐỐI, KHÔNG dùng alias webpack (`@schema/vocab.json`) — đã trả giá 3/8:
// alias chỉ webpack hiểu, còn `node --test` chạy file .mjs này bằng ESM resolver thật của Node,
// coi `@schema/vocab.json` là TÊN PACKAGE → ERR_MODULE_NOT_FOUND, và phải dựng shim trong
// node_modules để lách (shim đó bay ngay lần `npm install` kế tiếp → test đỏ im lặng).
// Đường dẫn tương đối là thứ DUY NHẤT cả webpack và Node cùng hiểu.
// Từ console/src/core/ lùi 3 cấp là gốc repo agent-auto/, rồi vào schema/.
import vocab from '../../../schema/vocab.json' with { type: 'json' };

/**
 * Vốn từ phía client — DẪN XUẤT từ schema/vocab.json (xem server/lib/vocab.js cho bản server).
 * Thêm phase mới = sửa JSON, không sửa file này. Ngoại lệ duy nhất: phase cần hình icon CHƯA có
 * thì vẫn phải thêm 1 dòng import trong core/icons.js — state-doctor bắt ca đó (luật E7).
 */
const idsWhere = (flag) => vocab.phases.filter((p) => p[flag]).map((p) => p.id);

/** Vòng đời task — khớp phase trong state.json do skill /daily ghi */
export const PHASE = Object.fromEntries(
  vocab.phases.map((p) => [p.id, { label: p.label, icon: p.icon, sev: p.sev }])
);

/** Phase mà công việc đang nằm trong tay mình */
export const ACTIVE_PHASES = idsWhere('active');

/**
 * Phase mà MỐC KHÔNG CÒN LÀ CỦA MÌNH — loại khỏi mọi phép tính deadline
 * (timeline, dải mốc 14 ngày, KPI "mốc sắp tới"/"trễ mốc", cảnh báo).
 *
 * Ca thật (3/8): GW-654 đổi assignee sang người khác lúc 10:02, phase ghi `reassigned`.
 * Bộ lọc cũ chỉ loại `closed` (blacklist) nên ticket vẫn vẽ nguyên hàng timeline + mốc
 * HTML 5/8 → đọc thành "còn của mình, sắp trễ"; trong khi BẢNG task lọc theo TASK_GROUPS
 * (whitelist) nên dòng đó BIẾN MẤT → đếm 5 mà chỉ thấy 4 dòng.
 * Ticket vẫn phải HIỆN trong bảng (còn việc bàn giao), chỉ không được tính mốc nữa.
 */
export const OFF_MY_PLATE_PHASES = idsWhere('offMyPlate');

/**
 * `offMyPlate` gộp 2 tình huống KHÁC HẲN nhau, tách ra từ 6/8 vì timeline cần phân biệt:
 *
 * `gone` (reassigned) — việc đã sang tay người khác, KHÔNG còn tồn tại bên mình. Mốc còn lại
 *   là deadline của người nhận → không vẽ hàng timeline nào cả (vẽ ra chỉ đọc nhầm thành nợ
 *   của mình). Vẫn giữ dòng trong BẢNG task vì còn việc bàn giao.
 *
 * `doneMine` (done-fe, closed) — việc CỦA MÌNH đã xong, nhưng Test/Release của BE/QC còn ở phía
 *   trước và đó chính là lúc bug quay lại. Vẫn vẽ hàng (mờ) chừng nào còn mốc tương lai.
 *   `done-fe` vào nhóm này từ 17/8: trước đó chỉ `closed` mang cờ, nên ticket xong FE mà mốc đã
 *   qua hết vẫn nằm lại timeline vĩnh viễn (ca thật GW-627: 4 mốc quá khứ, hàng chỉ còn 1 chấm
 *   Release bên trái vạch hôm nay — không còn gì để canh mà vẫn chiếm chỗ).
 */
export const GONE_PHASES = idsWhere('gone');
export const DONE_PHASES = idsWhere('doneMine');

/**
 * Phase còn được VẼ trên timeline nhưng làm MỜ: phần FE đã xong, mốc còn lại
 * (Dev BE · Test · Release) là việc của BE/QC — cần thấy để biết bao giờ nó chạy tới,
 * nhưng không được đọc ngang hàng với deadline của mình.
 * Bug quay lại thì /daily hạ phase về `bugfix` và hàng tự đậm lại.
 */
export const DIM_PHASES = idsWhere('dim');

/** Phase không tính là "trễ mốc" dù mốc đã qua (BE/QC còn đang xử lý, không phải lỗi của mình) */
export const LATE_EXEMPT_PHASES = idsWhere('lateExempt');

export const MILESTONE_LABEL = Object.fromEntries(vocab.milestones.map((m) => [m.id, m.label]));
export const KEY_MILESTONE_IDS = vocab.milestones.filter((m) => m.key).map((m) => m.id);

/**
 * Trạng thái design (state.issues[key].design.status do skill /daily ghi).
 * Phase `waiting-design` KHÔNG đủ để biết design đã giao chưa: design có thể đã giao
 * (link nằm trong ticket) mà chỉ vướng khâu tải về local — hiện nhãn riêng để khỏi
 * nhìn board rồi tưởng designer chưa gửi.
 * `label: null` (case "chưa-có-link") → map thành `null`: phase "chờ design" đã nói đủ, khỏi lặp.
 */
export const DESIGN_STATUS = Object.fromEntries(
  vocab.designStatus.map((d) => [d.id, d.label === null ? null : d])
);

/**
 * Nhóm dòng của bảng task: gom theo `group` của phase, giữ NGUYÊN thứ tự phase trong vocab
 * (việc đang chạy trước, nhóm `folded` cuối bảng).
 */
/**
 * Design ĐÃ GIAO nhưng chưa có đủ local: bắt MỌI mức "đã-giao-*" trừ "đã-giao-đã-tải"
 * (chưa-tải / tải-một-phần / chờ-link), không so bằng 1 chuỗi cứng — 10/8 lộ đúng lỗi này
 * ở phía skill: GW-627 design đã giao (subtask Design Done + link trong ticket) mà bị đọc
 * thành "chờ design". Mức mới thêm vào vocab.designStatus sẽ tự rơi đúng nhóm.
 */
export const designDeliveredNotLocal = (issue) => {
  const st = String(issue.design?.status || '');
  return st.startsWith('đã-giao') && st !== 'đã-giao-đã-tải';
};

function buildGroups() {
  const out = [];
  for (const p of vocab.phases) {
    const found = out.find((g) => g.label === p.group);
    if (found) {
      found.phases.push(p.id);
      found.collapsed = found.collapsed && Boolean(p.folded);
    } else {
      out.push({ label: p.group, phases: [p.id], collapsed: Boolean(p.folded) });
    }
  }
  // Tinh chỉnh DUY NHẤT không biểu diễn được bằng JSON: `waiting-design` gộp 2 tình huống khác
  // hẳn nhau — designer chưa gửi gì, và design ĐÃ gửi mà chỉ vướng khâu tải về máy. Xếp chung
  // 1 nhóm thì đọc thành vô lý ("chờ design" mà "design đã giao").
  const i = out.findIndex((g) => g.label === 'Chờ design');
  out.splice(
    i,
    1,
    {
      label: 'Chờ design',
      phases: ['waiting-design'],
      collapsed: false,
      where: (issue) => !designDeliveredNotLocal(issue),
    },
    {
      label: 'Design đã giao · chờ tải về',
      phases: ['waiting-design'],
      collapsed: false,
      where: designDeliveredNotLocal,
    }
  );
  return out;
}

export const TASK_GROUPS = buildGroups();

/** Nút "gõ hộ" lệnh vào tab terminal đang mở (`icon` tuỳ chọn) */
export const COMMANDS = [
  { cmd: 'claude', label: 'claude', icon: 'play', primary: true, title: 'Khởi động Claude Code trong tab đang mở' },
  { cmd: '/daily', label: '/daily', title: 'Trọn luồng sáng: quét → duyệt 1 lần → chạy' },
  { cmd: '/daily plan', label: 'plan', title: 'Chỉ quét + kế hoạch, không thực thi' },
  { cmd: '/daily week', label: 'week', title: 'Kế hoạch tuần + cảnh báo dồn mốc' },
  { cmd: '/daily wrap', label: 'wrap', title: 'Chốt ngày + standup + metrics' },
  { cmd: '/daily status', label: 'status', title: 'Xem nhanh board' },
  {
    // Radar nền 60' do launchd lo (tools/radar-tick.mjs) — nút này chỉ để quét TAY 1 lượt ngay,
    // không phải đợi hết nhịp. Ghi chú cũ ở đây nói cron không có token connector Jira: ĐÃ ĐO
    // LẠI 13/8 và SAI (claude -p gọi được cả Jira lẫn skill) — xem
    // docs/specs/2026-08-13-radar-auto-design.md mục 2.
    cmd: '/daily delta',
    label: 'quét ngay',
    icon: 'radar',
    title: "Quét 1 lượt ngay trong tab này (radar nền 60' do launchd chạy sẵn)",
  },
];

export const POLL_MS = 3000;
export const WEEK_HORIZON_DAYS = 14;

/** Ngưỡng coi 1 tab terminal là "vừa xong việc" — xem TerminalManager.watchIdle */
export const IDLE = { busyGapMs: 3000, idleMs: 5000, minBusyMs: 30000, tickMs: 1000 };
