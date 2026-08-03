const fs = require('fs');
const { Router } = require('express');
const { file } = require('../lib/paths');
// Trùng tên có chủ ý: learn.js đã có sẵn `forecast()` (không tham số — tổng hợp lead time +
// danh sách ticket đang chạy), còn `forecast.js` mới là hàm THUẦN (nhận 1 phase + elapsedHours,
// trả ngày dự báo) để test độc lập không cần đọc file. Alias để khỏi đụng tên trong file này.
const { forecast: learnSnapshot } = require('../lib/learn');
const { forecast } = require('../lib/forecast');
const { todayStr } = require('../lib/fsutil');

const router = Router();

/**
 * GET /api/learn — lead time thật từng phase + dự báo cho ticket đang chạy.
 * `minSamples` đi kèm để UI biết ngưỡng và in "chưa đủ dữ liệu" thay vì bịa số.
 * Thêm `forecasts` (key → { date, samples } | null) — ngày dự kiến xong phase hiện tại,
 * suy từ median lead time thật. KHÔNG được phá field cũ (`phases`, `running`, `sampleRows`,
 * `minSamples`) vì client đang đọc thẳng chúng.
 */
router.get('/learn', (_req, res) => {
  const data = learnSnapshot();
  // leadByPhase: field thật của learn.js là `n` (xem leadTimes()), đổi tên sang `samples`
  // cho khớp interface của forecast() — 2 module tách biệt, không rằng buộc tên field lẫn nhau.
  const leadByPhase = Object.fromEntries(
    data.phases.map((p) => [p.phase, { medianHours: p.medianHours, samples: p.n }])
  );
  const todayISO = todayStr();
  const forecasts = Object.fromEntries(
    data.running.map((r) => [r.key, forecast({ phase: r.phase, elapsedHours: r.hours, leadByPhase, todayISO })])
  );
  res.json({ ...data, forecasts });
});

/** GET /api/lessons — bài học đã gom (markdown thô, UI tự render) */
router.get('/lessons', (_req, res) => {
  if (!fs.existsSync(file.lessons)) return res.type('text/plain').send('');
  res.type('text/plain').send(fs.readFileSync(file.lessons, 'utf8'));
});

module.exports = router;
