/**
 * Đặt nhãn cho các mốc trên trục timeline. Tách khỏi gantt.js để test được: gantt.js import
 * icon (.svg qua webpack) nên node:test không nạp được file đó.
 *
 * Nhãn xét 2 LƯỢT: mốc ưu tiên (HTML) giành chỗ TRƯỚC. Xét 1 lượt trái→phải thì HTML ở sau
 * vẫn hiện cạnh nhãn vừa hiện và chồng chữ.
 */
export function layoutMarks(
  milestones,
  { pctOf, daysUntilOf, keyIds = ['html'], minGapPct = 10, offGapPct = minGapPct, maxDays = Infinity }
) {
  const marks = Object.entries(milestones || {})
    // Key mở đầu `_` là GHI CHÚ của skill (`_conflict`, `_designGuess`…), không phải mốc.
    // Không lọc thì nó vẽ ra chấm + nhãn tên-field (đã thấy thật: "_dueda" đè "HTML").
    .filter(([name]) => !name.startsWith('_'))
    .map(([name, date]) => {
      const days = daysUntilOf(date);
      const left = pctOf(date);
      // Mốc rơi SAU mép phải của trục (ca thật GW-654: release 1/9 mà trục hết 30/8) thì ghim
      // mép phải thay vì bỏ — đúng thông tin cần để canh fix. Mốc ĐÃ QUA nằm trước trục vẫn bỏ:
      // ghim mép trái chỉ tạo nhiễu, quá khứ không phải thứ phải canh.
      const off = left === null && days > maxDays;
      return { name, date, left: off ? 100 : left, days, off };
    })
    .filter((m) => m.left !== null)
    .sort((a, b) => a.left - b.left || a.days - b.days);

  // Mọi mốc ngoài khung đều ghim cùng 100% → giữ nguyên là chồng chấm chồng chữ ở mép phải
  // (ca thật GW-525: review2 31/8 + release 19/9). Gộp còn MỘT chấm mang mốc SỚM NHẤT — nó
  // tới trước nên là cái phải canh trước; số mốc còn lại đi vào `moreOff` cho nhãn "+n".
  const offs = marks.filter((m) => m.off);
  if (offs.length) {
    offs[0].moreOff = offs.length - 1;
    for (const m of offs.slice(1)) marks.splice(marks.indexOf(m), 1);
  }

  // Mỗi nhãn đã hiện chiếm một VÙNG CẤM quanh nó, không phải một điểm: nhãn mốc off dài hơn
  // hẳn (kèm ngày + "+n" + mũi tên) và đổ ngược về trái nên vùng của nó rộng hơn `minGapPct`.
  const taken = [];
  const fits = (left) => taken.every((t) => Math.abs(left - t.left) >= t.gap);
  const claim = (m) => taken.push({ left: m.left, gap: m.off ? offGapPct : minGapPct });
  // Mốc ưu tiên (HTML) và mốc NGOÀI KHUNG giành nhãn trước: mốc off là thứ duy nhất nói được
  // "còn mốc nữa ở ngoài khung nhìn", để luật giãn nhãn bịt nó thì hàng đó thành mù ngày.
  const first = (m) => keyIds.includes(m.name) || m.off;
  for (const m of marks.filter(first)) {
    m.showLabel = true;
    claim(m);
  }
  for (const m of marks.filter((m) => !first(m))) {
    m.showLabel = fits(m.left);
    if (m.showLabel) claim(m);
  }
  return marks;
}

/**
 * Class của hàng timeline. Tách khỏi gantt.js để TEST ĐƯỢC: gantt.js import icon (.svg qua
 * webpack loader) nên node:test không nạp được file đó.
 * `done-fe` = FE xong, mốc còn lại (Dev BE · Test · Release) là việc của BE/QC → vẽ mờ chứ
 * không bỏ hàng: vẫn cần thấy bao giờ nó chạy tới, nhưng không được đọc ngang hàng deadline
 * của mình.
 */
export function rowClass(phase, dimPhases) {
  return dimPhases.includes(phase) ? 'grow dim' : 'grow';
}

/**
 * Ticket này có được vẽ 1 hàng trên timeline không? Ba nhóm, ba luật (user chốt 6/8):
 *
 * `gonePhases` (đã chuyển người) → KHÔNG BAO GIỜ vẽ. Việc không còn bên mình, mốc còn lại là
 *   deadline của người nhận; vẽ ra là đọc nhầm thành nợ của mình.
 * `donePhases` (của mình, đã đóng) → vẫn vẽ CHỪNG NÀO còn mốc tương lai. FE xong không phải
 *   hết việc: Test/Release của BE/QC còn ở phía trước và đó là lúc bug quay lại (ca thật
 *   GW-660: đóng 3/8 nhưng test 21/8 · release 26/8). Hết mốc tương lai thì mới bỏ hàng, không
 *   thì timeline phình mãi theo ticket đã đóng.
 * Còn lại (việc trong tay) → luôn vẽ, kể cả khi mốc đã qua hết — nhất là khi đã qua.
 */
export function keepOnTimeline(issue, { gonePhases, donePhases, daysUntilOf }) {
  if (gonePhases.includes(issue.phase)) return false;
  if (!donePhases.includes(issue.phase)) return true;
  return Object.entries(issue.milestones || {})
    .filter(([name]) => !name.startsWith('_'))
    .some(([, date]) => daysUntilOf(date) >= 0);
}
