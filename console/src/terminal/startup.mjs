/**
 * Lệnh khởi động CHỈ được gõ vào phiên pty mới sinh. Phiên nối lại sau reload có thể đang chạy
 * claude dở — gõ thêm vào đó là chèn chữ vào giữa phiên đang làm việc.
 */
export function startupInput(msg = {}) {
  if (!msg.fresh || !msg.startup) return null;
  return msg.startup + '\r';
}
