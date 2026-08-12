/**
 * Suy trạng thái BÀN GIAO của task promotion — hàm thuần, không chạy git, không gọi mạng.
 *
 * Bằng chứng bàn giao của team này là chính repo gt-promotion-template: FE chép output vào
 * `<game>/<slug>-<nexusId>/mainsite/` rồi push, platform lấy từ đó. Không có sổ sách nào khác,
 * và (theo chốt 10/08) KHÔNG ghi gì vào description Jira để đánh dấu.
 *
 * Mọi lệnh git nằm ở chỗ gọi, ở đây chỉ nhận kết quả dạng chuỗi → toàn bộ luật quyết định
 * "đã bàn giao chưa" test được mà không cần dựng repo giả.
 */

/** `git log -1 --format=%h|%cI|%s` — subject có thể chứa dấu | nên chỉ tách 2 lần đầu */
function parseLog(remoteLog) {
  const raw = String(remoteLog || '').trim();
  if (!raw) return null;

  const i = raw.indexOf('|');
  const j = raw.indexOf('|', i + 1);
  if (i < 0 || j < 0) return null;

  const commit = raw.slice(0, i).trim();
  const at = raw.slice(i + 1, j).trim();
  const subject = raw.slice(j + 1).trim();
  // Thiếu commit hoặc thiếu ngày = không đủ bằng chứng. Thà báo "chưa push" còn hơn đoán bừa
  // rồi cho đánh Done một ticket chưa ai thấy hàng.
  if (!commit || !at) return null;

  return { commit, at, subject };
}

/**
 * @param {{promoFolder:?string, files:string[], remoteLog:string, dirty:string}} input
 * @returns {{state:string, canDone:boolean, commit:?string, at:?string, subject:?string,
 *            dirty:boolean, message:string}}
 */
function evaluateDelivery({ promoFolder, files = [], remoteLog = '', dirty = '' }) {
  const base = { commit: null, at: null, subject: null, dirty: false };

  if (!promoFolder)
    return {
      ...base,
      state: 'n/a',
      canDone: false,
      message: 'Ticket không có kênh promotion — console không đụng tới Jira.',
    };

  if (!files.length)
    return {
      ...base,
      state: 'no-files',
      canDone: false,
      message: `Chưa có file nào trong ${promoFolder}/mainsite/.`,
    };

  const log = parseLog(remoteLog);
  if (!log)
    return {
      ...base,
      state: 'unpushed',
      canDone: false,
      message: `File đã chép nhưng chưa push lên remote — PM chưa thấy gì. Push ${promoFolder} trước đã.`,
    };

  const isDirty = Boolean(String(dirty || '').trim());
  return {
    ...log,
    state: 'delivered',
    canDone: true,
    dirty: isDirty,
    message: isDirty
      ? `Đã bàn giao ở commit ${log.commit}, NHƯNG folder còn thay đổi chưa commit/chưa push — bản mới nhất chưa lên.`
      : `Đã bàn giao ở commit ${log.commit}.`,
  };
}

module.exports = { evaluateDelivery, parseLog };
