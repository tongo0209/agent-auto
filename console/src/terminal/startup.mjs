// Khởi động CHỈ gõ vào phiên mới sinh (phiên nối lại có thể chạy dở — cấm chèn chữ vào).
export function startupInput(msg = {}) {
  if (!msg.fresh || !msg.startup) return null;
  return msg.startup + '\r';
}
