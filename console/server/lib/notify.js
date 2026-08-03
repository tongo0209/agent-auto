const { execFile } = require('child_process');

/**
 * Nhắc mốc RA NGOÀI trang. Trước đây `onNotify` phía client chỉ chạy khi trang đang mở và mất
 * focus → đóng tab là im, mà mốc HTML thì không đợi ai mở tab.
 *
 * `shouldNotify` là hàm THUẦN để test được; phần chạm hệ điều hành gói riêng trong
 * `sendNotification` và là best-effort (không phải macOS / bị chặn quyền thì bỏ qua).
 */
const REPEAT_MS = 12 * 3600e3; // đừng spam — 1 mốc crit chỉ nhắc lại sau 12h nếu vẫn còn crit

/**
 * Alert crit này đã nhắc gần đây chưa? So theo (key, code) — không so theo text vì text
 * đổi mỗi ngày (VD "còn 2 ngày" → "còn 1 ngày") mà bản chất vẫn là CÙNG một mốc.
 */
function shouldNotify(alert, log, nowMs, config = {}) {
  if (config.notify === false) return false; // công tắc tắt hẳn — tôn trọng lựa chọn user
  if (alert.level !== 'crit') return false; // chỉ crit mới xứng đáng chen ra ngoài trang
  const last = (log || [])
    .filter((r) => r && r.key === alert.key && r.code === alert.code)
    .map((r) => Date.parse(r.at))
    .sort((a, b) => b - a)[0];
  return !last || nowMs - last >= REPEAT_MS;
}

/** Lọc trong danh sách alert hiện tại xem cái nào ĐÁNG nhắc — thuần, không I/O */
function notifyNewCrits({ alerts = [], log = [], nowMs, config = {} }) {
  return { sent: alerts.filter((a) => shouldNotify(a, log, nowMs, config)) };
}

/**
 * Bắn notification macOS qua osascript. Best-effort tuyệt đối: server này đang host terminal
 * thật của user, osascript lỗi (không phải macOS, chưa cấp quyền Notifications…) chỉ được
 * log rồi bỏ qua — KHÔNG được ném lỗi làm sập server.
 */
function sendNotification(title, message) {
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.log('notify: bỏ qua (' + err.message + ')');
  });
}

module.exports = { shouldNotify, notifyNewCrits, sendNotification, REPEAT_MS };
