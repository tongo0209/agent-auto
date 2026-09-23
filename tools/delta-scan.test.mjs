import { test } from 'node:test';
import assert from 'node:assert';
import { localStamp, scanWindow, ticketsOf, designQueues, monthsStale } from './delta-scan.mjs';

process.env.TZ = 'Asia/Ho_Chi_Minh';
const H = 3600e3;
const NOW = Date.parse('2026-09-23T04:00:00Z'); // 11:00 giờ VN

test('cửa sổ quét = lastRun lùi 30 phút, in giờ local', () => {
  assert.deepStrictEqual(scanWindow('2026-09-23T03:00:00Z', NOW), {
    sinceIso: '2026-09-23T02:30:00.000Z', jqlSince: '2026-09-23 09:30', jqlFallback: null,
  });
});

test('thiếu lastRun thì lùi 4 giờ và báo JQL dùng fallback', () => {
  assert.deepStrictEqual(scanWindow(null, NOW), { sinceIso: '2026-09-23T00:00:00.000Z', jqlSince: null, jqlFallback: '-4h' });
});

test('commit nối ticket theo repo + tiền tố folder, không nối nhầm folder trùng đầu tên', () => {
  const issues = {
    'GW-1': { paths: [{ repo: 'cdn-source', path: 'products/jxm/landing/2026-a' }] },
    'GW-2': { paths: [{ repo: 'gt-promotion-template', path: 'products/jxm/landing/2026-a' }] },
  };
  assert.deepStrictEqual(ticketsOf(['products/jxm/landing/2026-a/index.html'], 'cdn-source', issues), ['GW-1']);
  assert.deepStrictEqual(ticketsOf(['products/jxm/landing/2026-a-subweb/x.scss'], 'cdn-source', issues), []);
});

test('xếp hàng quét design: folder SharePoint quá 48h, chưa tới wait-test', () => {
  const design = (extra) => ({ status: 'đã-giao-đã-tải', manifest: 'm.json', downloadedAt: new Date(NOW - 50 * H).toISOString(), ...extra });
  const issues = {
    'GW-1': { phase: 'coding', design: design() },
    'GW-2': { phase: 'coding', design: design({ lastScanAt: new Date(NOW - 2 * H).toISOString() }) },
    'GW-3': { phase: 'wait-test', design: design() },
    'GW-4': { phase: 'coding', design: design({ scanDue: true }) },
    'GW-5': { phase: 'ready', design: { status: 'đã-giao-đã-tải', link: 'https://drive.google.com/drive/folders/x', sourceModified: '2026-09-01T00:00:00Z' } },
  };
  assert.deepStrictEqual(designQueues(issues, NOW), {
    designScanDue: ['GW-1'],
    driveCheck: [{ key: 'GW-5', link: 'https://drive.google.com/drive/folders/x', sourceModified: '2026-09-01T00:00:00Z' }],
  });
});

test('months.json cũ khi generatedAt khác hôm nay theo giờ local', () => {
  assert.strictEqual(monthsStale({ generatedAt: '2026-09-23' }, new Date(NOW)), false);
  assert.strictEqual(monthsStale({ generatedAt: '2026-09-22T23:00:00+07:00' }, new Date(NOW)), true);
  assert.strictEqual(monthsStale(null, new Date(NOW)), true);
});
