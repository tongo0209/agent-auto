/**
 * Nhớ danh sách tab terminal qua các lần reload.
 *
 * Phiên pty sống ở server và neo theo `id` (xem server/lib/ptyStore.js); phía trình duyệt chỉ
 * cần nhớ ĐÚNG những id đó để dựng lại tab và nối vào phiên cũ. Không nhớ id = reload xong
 * spawn shell mới, claude đang chạy coi như mất.
 *
 * Tách khỏi TerminalManager để test được: TerminalManager đụng jQuery + xterm, node:test không
 * nạp nổi; phần logic đáng sai lại nằm hết ở đây.
 */
const KEY = 'console.terms';

export function loadTabs(storage) {
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Dữ liệu hỏng (đổi định dạng, user sửa tay) không được làm console không mở lên được
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  // Bản ghi không có id thì nối vào cũng không biết phiên nào — bỏ luôn
  return parsed.filter((t) => t && typeof t.id === 'string').map((t) => ({ id: t.id, label: String(t.label || '') }));
}

export function saveTabs(storage, sessions) {
  try {
    storage.setItem(KEY, JSON.stringify(sessions.map((s) => ({ id: s.id, label: s.label }))));
  } catch {
    // localStorage đầy hoặc bị chặn — mất khả năng nối lại sau reload, nhưng phiên hiện tại
    // vẫn phải chạy bình thường
  }
}

export function newSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
