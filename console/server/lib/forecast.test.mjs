import { test } from 'node:test';
import assert from 'node:assert';
import { forecast } from './forecast.js';

const lead = { coding: { medianHours: 72, samples: 5 }, deliver: { medianHours: 10, samples: 2 } };
const TODAY = '2026-08-03';

test('đủ mẫu → dự báo = hôm nay + số ngày còn lại', () => {
  const r = forecast({ phase: 'coding', elapsedHours: 24, leadByPhase: lead, todayISO: TODAY });
  assert.deepEqual(r, { date: '2026-08-05', samples: 5 }); // còn 48h = 2 ngày
});

test('dưới 3 mẫu → null, KHÔNG bịa số', () => {
  assert.equal(forecast({ phase: 'deliver', elapsedHours: 1, leadByPhase: lead, todayISO: TODAY }), null);
});

test('phase không có mẫu nào → null', () => {
  assert.equal(forecast({ phase: 'bugfix', elapsedHours: 1, leadByPhase: lead, todayISO: TODAY }), null);
});

test('đã quá median → dự báo là hôm nay, không phải ngày âm', () => {
  const r = forecast({ phase: 'coding', elapsedHours: 200, leadByPhase: lead, todayISO: TODAY });
  assert.equal(r.date, TODAY);
});
