const path = require('path');
const { AGENT_AUTO } = require('./paths');

/**
 * Trạng thái radar nền cho console. Vì sao cần vẽ ra màn hình: không có dòng này thì "im vì
 * yên" và "im vì chết" trông GIỐNG HỆT nhau — đúng cái bẫy đã trả giá 6/8 với months.json
 * (console vẽ số cũ, user nhìn thấy ngay và mất tin vào cả trang).
 *
 * Cổng giờ lấy THẲNG từ tools/radar-tick.mjs (Node 25 cho phép require file ESM). Chép lại
 * luật giờ sang đây là mở đường cho hai bản lệch nhau: console vẽ "ngoài giờ" trong khi radar
 * vẫn đang chạy, hoặc ngược lại.
 */
const { shouldRunNow, failStreak } = require(path.join(AGENT_AUTO, 'tools', 'radar-tick.mjs'));

/**
 * "Chết" = trôi qua 2.5 nhịp mà không có lượt nào. Suy TỪ nhịp chứ không cắm cứng 90 phút:
 * nhịp 60' mà ngưỡng 90' thì chỉ cần 1 lượt bị bỏ (cổng ③ nhường lúc user gõ tay) là dòng
 * này đỏ oan — báo động sai vài lần là user thôi không nhìn nó nữa.
 */
const DEAD_FACTOR = 2.5;
const deadMs = (cfg) => (cfg.everyMin || 30) * DEAD_FACTOR * 60e3;

/** Thuần — không đọc file, test bơm `rows` vào thẳng */
function radarStatus({ rows = [], cfg = {}, now = new Date() }) {
  const ticks = rows.filter((r) => !r.skipped);
  const last = ticks[ticks.length - 1] || null;
  const lastChangedAt = [...ticks].reverse().find((r) => r.changed)?.at || null;
  const streak = failStreak(rows);
  const gate = shouldRunNow(now instanceof Date ? now : new Date(now), cfg);

  // Thứ tự quyết định QUAN TRỌNG: tắt/ngoài giờ phải chặn TRƯỚC "chết", nếu không dòng này đỏ
  // suốt đêm và cả cuối tuần — lúc đó radar im là đúng thiết kế, báo đỏ mới là báo sai.
  let level = 'ok';
  if (gate.why === 'disabled') level = 'off';
  else if (!gate.run) level = 'off-hours';
  else if (streak >= 3) level = 'dead';
  else if (!last || Number(now) - Date.parse(last.at) > deadMs(cfg)) level = 'dead';

  return {
    level,
    enabled: cfg.enabled !== false,
    inWindow: gate.run,
    last,
    lastChangedAt,
    failStreak: streak,
  };
}

module.exports = { radarStatus, deadMs, DEAD_FACTOR };
