/**
 * Làm sạch `history/phases.jsonl` — CHỖ DUY NHẤT biết cách đọc sổ đó cho đúng.
 *
 * Sổ này bị HAI NGUỒN cùng ghi: skill `/daily` ghi kèm lý do thật, và observer của console
 * (`lib/learn.js::observePhases`) quan sát state đổi rồi ghi tiếp với `reason: console-observed`.
 * Đo thật trên dữ liệu 3/8 có đúng 2 loại rác:
 *   1. TRÙNG: `GW-654 coding→reassigned` 2 dòng cách nhau 18 PHÚT (10:21:40 và 10:39:39).
 *   2. NO-OP: `GW-556 coding→coding` — một bên ghi lại phase cũ y nguyên.
 *
 * Vì sao phải dùng chung: `lib/delta.js` (dòng "có gì mới") và `lib/learn.js::leadTimes()`
 * (lead time → dự báo ngày xong) đều đọc sổ này. Ngày 3/8 chỉ `delta.js` lọc rác, còn
 * `leadTimes()` thì không — và 2 dòng rác của GW-556 biến thành 2 mẫu "phase coding dài 0.3h",
 * kéo median phase `coding` từ ~47h xuống 23.5h, làm dự báo báo "xong hôm nay" cho một ticket
 * đang đứng yên 2 ngày. Tách ra đây để không còn chỗ nào đọc sổ thô nữa.
 */

/** Parse `at` chịu cả 2 định dạng đang có trong sổ: có offset (`+07:00`) và dạng cũ thiếu offset */
const ts = (row) => new Date(String(row.at).replace(' ', 'T')).getTime();

/**
 * @param rows dòng thô đọc từ phases.jsonl
 * @returns dòng đã sắp theo thời gian, bỏ no-op và bỏ dòng trùng khít dòng vừa giữ của cùng ticket
 *
 * Chống trùng theo LIỀN KỀ, không theo cửa sổ thời gian: khoảng cách 2 nguồn đo được tới 18 phút
 * nên mọi ngưỡng đều sai. Một lần lặp THẬT (`coding→bugfix` hai lần) bắt buộc có bước chuyển
 * ngược chen giữa, nên nó không bị gộp oan.
 */
function cleanPhaseRows(rows = []) {
  const sorted = [...rows].filter((r) => r && r.key && r.to && r.at).sort((a, b) => ts(a) - ts(b));
  const lastKept = new Map(); // key → sig của dòng vừa giữ
  const out = [];
  for (const row of sorted) {
    if (row.from && row.from === row.to) continue;
    const sig = `${row.from ?? ''}|${row.to}`;
    if (lastKept.get(row.key) === sig) continue;
    lastKept.set(row.key, sig);
    out.push(row);
  }
  return out;
}

module.exports = { cleanPhaseRows, phaseRowTime: ts };
