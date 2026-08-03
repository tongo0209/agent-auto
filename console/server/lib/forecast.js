/**
 * Dự báo ngày xong phase hiện tại từ lead time THẬT (history/phases.jsonl, qua learn.js).
 *
 * Giữ đúng luật "không bịa" đã có trong vòng học: dưới `minSamples` mẫu thì trả null để UI
 * không hiện gì — dự báo sai còn tệ hơn không dự báo, vì nó làm hoãn đúng việc gấp. Không
 * nội suy, không lấy mẫu của phase khác bù vào.
 */
function forecast({ phase, elapsedHours = 0, leadByPhase = {}, todayISO, minSamples = 3 }) {
  const lead = leadByPhase[phase];
  if (!lead || !lead.samples || lead.samples < minSamples) return null;
  // Đã quá median (hoặc đúng median) → còn lại 0h, dự báo là HÔM NAY chứ không phải ngày âm
  const remainHours = Math.max(0, lead.medianHours - elapsedHours);
  const remainDays = Math.ceil(remainHours / 24);
  // Cộng ngày bằng Date.UTC + đọc lại bằng toISOString (cũng UTC) — tránh bẫy timezone:
  // dựng mốc từ `new Date(todayISO + 'T00:00:00')` là giờ ĐỊA PHƯƠNG, còn toISOString() trả
  // giờ UTC, nên máy ở múi giờ dương (VN = UTC+7) bị lùi mất 1 ngày. Giữ cả 2 đầu cùng 1 múi
  // giờ (UTC) thì không lệch.
  const [y, m, d] = todayISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + remainDays));
  return { date: date.toISOString().slice(0, 10), samples: lead.samples };
}

module.exports = { forecast };
