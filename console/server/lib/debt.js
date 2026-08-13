const { daysBetween } = require('./fsutil');
const { isOffMyPlate } = require('./vocab');

/**
 * Sổ nợ đọng xuyên ngày — việc "Cần bạn" ở board CŨ mà hôm nay không ai nhắc lại.
 *
 * Vì sao cần (đo thật 12/8): board là sổ theo NGÀY và console chỉ đọc board hôm nay, nên mục
 * chưa tick ở board cũ không có ai gom lại. Board 12/8 mang 4 mục mở, các board cũ còn 62 mục.
 * Rơi thật: 4 việc GW-627 ở board 10/8 (báo designer 3 lỗi trong file design · lỗi bản TH ·
 * xác nhận CDN sync 5 file mp3 · thứ tự release có ràng buộc) chỉ tồn tại ở board 10/8, chưa
 * tick, không xuất hiện lại ở 11/8 hay 12/8 — mất radar 2 ngày, mà GW-627 release 15/8.
 * GW-660 "lệch bản pm__ cần anh quyết" từng được mang tay sang board 10/8 kèm chữ "(còn từ
 * 6/8)" rồi cũng biến mất.
 *
 * Luật: THEO TICKET. Mục mở ở board cũ mà owner key VẮNG trên board hôm nay ⇒ rơi radar.
 *
 * KHÔNG khớp mờ nội dung, có lý do: cùng một việc mỗi ngày được diễn đạt một kiểu —
 *   10/8 "làm rõ ticket — Update hình của cái gì, ở đâu"
 *   11/8 "cần bạn quyết: … là việc gì, có design không"
 *   12/8 "cần bạn nói … là làm gì và có design chưa"
 * trùng token rất thấp nên khớp mờ vừa không gộp được, vừa gộp oan hai việc khác nhau cùng
 * ticket. Luật theo-ticket không bao giờ báo sai tuổi vì nó không hề tuyên bố "cùng một việc".
 */

/** Key GW ĐẦU TIÊN trong mục — đúng cách skill mở đầu mục ("GW-627: …", "**GW-720 — …**") */
const ownerKey = (text) => (String(text ?? '').match(/\bGW-\d+/) || [null])[0];

/**
 * @param boards [{ date, items }] — `items` từ lib/needyou.js::parseNeedYou
 * @param today  'YYYY-MM-DD'
 * @param state  state.json (chỉ để đọc phase → cờ offMyPlate)
 * @returns { groups, counts }
 */
function buildDebt({ boards = [], today = '', state = {} } = {}) {
  /**
   * "Board hiện tại" phải hiểu ĐÚNG NHƯ `lib/board.js::readBoard`: board hôm nay nếu có, không
   * thì board MỚI NHẤT. Đó chính là board đang hiện ở khối "Cần bạn" của tab Hôm nay.
   *
   * So cứng `date === today` là sai và không phải ca hiếm: 14 ngày 30/7–12/8 có 4 ngày KHÔNG có
   * board (2/8 và 7–9/8, cuối tuần). Những ngày đó đúng các mục đang hiện ở "Cần bạn" lại bị
   * báo là "rơi radar" kèm alert crit + notification macOS — vừa trùng lặp vừa báo động sai.
   */
  const dates = boards.map((b) => b.date).filter((d) => d && daysBetween(d, today) >= 0);
  const radarDate = dates.includes(today) ? today : dates.sort()[dates.length - 1] || today;

  /**
   * Ticket được nhắc trên board hiện tại. CHỈ tính mục CÒN MỞ (`!item.done`).
   *
   * Đảo quyết định 12/8: lượt trước tính cả mục đã tick với lý do "đã tick nghĩa là hôm nay có
   * chạm". Nhưng mục đã tick là việc đã ĐÓNG, không phải lời nhắc — để nó giữ ticket trong radar
   * thì một mục đã tick về việc KHÁC sẽ che hết các mục còn mở của cùng ticket, đúng kiểu mất
   * việc trong im lặng. Đo trên dữ liệu thật 12/8: đổi luật này KHÔNG làm lộ thêm việc nào
   * (41 việc / 7 ticket trước và sau) ⇒ bịt lỗ mà không thêm tiếng ồn.
   */
  const radarKeys = new Set();
  for (const b of boards) {
    if (b.date !== radarDate) continue;
    for (const item of b.items || []) {
      if (item.done) continue;
      const key = ownerKey(item.text);
      if (key) radarKeys.add(key);
    }
  }

  const byKey = new Map();
  let dropped = 0;
  let inRadar = 0;

  for (const b of boards) {
    // Board hiện tại không tự thành nợ của chính nó; board tương lai (đồng hồ lệch) cũng bỏ.
    // `staleDays` vẫn đếm tới HÔM NAY, không tới `radarDate` — tuổi thật của việc là thứ user cần.
    if (daysBetween(b.date, radarDate) <= 0) continue;
    const staleDays = daysBetween(b.date, today);

    for (const item of b.items || []) {
      if (item.done) continue;
      const key = ownerKey(item.text);
      if (key && radarKeys.has(key)) {
        inRadar++;
        continue;
      }
      dropped++;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ date: b.date, index: item.index, text: item.text, staleDays });
    }
  }

  const groups = [...byKey.entries()]
    .map(([key, items]) => {
      const issue = (key && state.issues?.[key]) || null;
      const phase = issue?.phase || null;
      items.sort((a, z) => z.staleDays - a.staleDays);
      return {
        key,
        phase,
        // Ticket không có trong state → KHÔNG coi là offMyPlate: không lặng lẽ giấu việc đi.
        // Có trong state thì xét đủ 3 nguồn (phase · status Jira · assigneeNow) — vocab::isOffMyPlate.
        offMyPlate: isOffMyPlate(issue),
        items,
        staleDays: items[0].staleDays,
        oldestDate: items[0].date,
      };
    })
    .sort((a, z) => z.staleDays - a.staleDays);

  return { groups, radarDate, counts: { dropped, tickets: groups.length, inRadar } };
}

module.exports = { ownerKey, buildDebt };
