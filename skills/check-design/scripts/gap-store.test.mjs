import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalize, applyRun, computeDelta } from './gap-store.mjs';

const item = (over = {}) => ({
  id: 'frame4-popup',
  label: 'Popup content frame 4',
  kind: 'màn',
  source: { from: 'docx', ref: 'note_dev_landing.docx', quote: 'mỗi menu mở popup content' },
  verdict: 'THIẾU',
  evidence: { looked: ['SUBWEB-VLTT_PC.jpg', 'SUBWEB VLTT_PC.psb (layer tree)'], found: null, blockedBy: null },
  ...over,
});

/* ───────────── Luật cưỡng chế (normalize) ───────────── */

test('THIẾU mà chưa soi PSD nào thì bị hạ xuống CHƯA-CHẮC', () => {
  const { items } = normalize({ key: 'GW-1', items: [item({ evidence: { looked: ['a.jpg'], found: null, blockedBy: null } })] });
  assert.equal(items[0].verdict, 'CHƯA-CHẮC');
  assert.match(items[0].evidence.blockedBy, /chưa soi PSD/);
});

test('THIẾU mà không soi gì cả cũng bị hạ xuống CHƯA-CHẮC', () => {
  const { items } = normalize({ key: 'GW-1', items: [item({ evidence: { looked: [], found: null, blockedBy: null } })] });
  assert.equal(items[0].verdict, 'CHƯA-CHẮC');
});

test('THIẾU có soi cả ảnh lẫn PSD thì giữ nguyên', () => {
  const { items } = normalize({ key: 'GW-1', items: [item()] });
  assert.equal(items[0].verdict, 'THIẾU');
});

test('item không có nguồn đòi thì không được là THIẾU — chuyển sang rổ hỏi', () => {
  const { items, asks } = normalize({ key: 'GW-1', items: [item({ id: 'mobile', source: null })] });
  assert.equal(items.length, 0);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].id, 'mobile');
  assert.match(asks[0].why, /nguồn không/);
});

test('ĐỦ phải có found, không có thì hạ xuống CHƯA-CHẮC', () => {
  const { items } = normalize({
    key: 'GW-1',
    items: [item({ verdict: 'ĐỦ', evidence: { looked: ['a.jpg'], found: null, blockedBy: null } })],
  });
  assert.equal(items[0].verdict, 'CHƯA-CHẮC');
});

test('counts đếm đúng 4 mức + rổ hỏi', () => {
  const { counts } = normalize({
    key: 'GW-1',
    items: [
      item(),
      item({ id: 'a', verdict: 'ĐỦ', evidence: { looked: ['a.jpg'], found: 'a.jpg y≈100', blockedBy: null } }),
      item({ id: 'b', verdict: 'CHƯA-CHẮC', evidence: { looked: ['a.jpg'], found: null, blockedBy: 'PSB chưa tải' } }),
      item({ id: 'c', verdict: 'KHÔNG-ÁP-DỤNG', evidence: { looked: [], found: null, blockedBy: null } }),
    ],
    asks: [{ id: 'share', label: 'Ảnh share', why: 'nguồn không nói' }],
  });
  assert.deepEqual(counts, { ok: 1, missing: 1, unsure: 1, na: 1, ask: 1 });
});

/* ───────────── DELTA + ghi đĩa (applyRun) ───────────── */

/** agent-auto giả: chỉ cần state.json + tasks/<KEY>/brief.md. */
function fixture(brief = '# GW-1\n\n## Việc còn mở\n\n- [ ] việc người viết tay\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-'));
  fs.writeFileSync(
    path.join(root, 'state.json'),
    JSON.stringify({ schemaVersion: 2, issues: { 'GW-1': { phase: 'ready', design: { status: 'đã-giao-đã-tải' } } } }, null, 2)
  );
  fs.mkdirSync(path.join(root, 'tasks/GW-1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tasks/GW-1/brief.md'), brief);
  return root;
}

const missingItem = {
  id: 'frame4-popup', label: 'Popup content frame 4', kind: 'màn',
  source: { from: 'docx', ref: 'note.docx', quote: 'mỗi menu mở popup content' },
  verdict: 'THIẾU',
  evidence: { looked: ['pc.jpg', 'pc.psb (layer tree)'], found: null, blockedBy: null },
};

test('run đầu: ghi design-gap.json, đánh dấu firstSeenMissing = hôm nay', () => {
  const root = fixture();
  const r = applyRun({ root, key: 'GW-1', run: { key: 'GW-1', depth: 'deep', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const saved = JSON.parse(fs.readFileSync(r.gapFile, 'utf8'));
  assert.equal(saved.runs.length, 1);
  assert.equal(saved.runs[0].items[0].firstSeenMissing, '2026-08-13');
  assert.equal(r.counts.missing, 1);
});

test('run sau: item vẫn thiếu thì giữ firstSeenMissing và đếm số ngày', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const r2 = applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-15T10:00:00+07:00' });
  assert.equal(r2.delta.stillMissing.length, 1);
  assert.equal(r2.delta.stillMissing[0].days, 2);
  assert.equal(r2.delta.stillMissing[0].firstSeenMissing, '2026-08-13');
});

test('run sau: item đã có design thì vào rổ resolved', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const fixed = { ...missingItem, verdict: 'ĐỦ', evidence: { looked: ['pc.jpg'], found: 'pc.jpg y≈2400', blockedBy: null } };
  const r2 = applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [fixed] }, now: '2026-08-15T10:00:00+07:00' });
  assert.deepEqual(r2.delta.resolved.map((x) => x.id), ['frame4-popup']);
  assert.equal(r2.delta.stillMissing.length, 0);
});

test('ghi state.issues[KEY].design.gaps mà không đụng design.status', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', depth: 'deep', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const st = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
  assert.equal(st.issues['GW-1'].design.status, 'đã-giao-đã-tải');
  assert.equal(st.issues['GW-1'].design.gaps.counts.missing, 1);
  assert.deepEqual(st.issues['GW-1'].design.gaps.missingTop, ['Popup content frame 4']);
  assert.equal(st.issues['GW-1'].design.gaps.checkedAt, '2026-08-13T10:00:00+07:00');
});

test('vá brief giữa marker, chạy 2 lần không nhân đôi và không nuốt dòng người viết', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-15T10:00:00+07:00' });
  const brief = fs.readFileSync(path.join(root, 'tasks/GW-1/brief.md'), 'utf8');
  assert.equal(brief.match(/<!-- check-design:begin -->/g).length, 1);
  assert.match(brief, /việc người viết tay/);
  assert.match(brief, /Popup content frame 4/);
});

test('brief không có mục "Việc còn mở" thì thêm mục mới ở cuối', () => {
  const root = fixture('# GW-1\n\nnội dung\n');
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const brief = fs.readFileSync(path.join(root, 'tasks/GW-1/brief.md'), 'utf8');
  assert.match(brief, /## Việc còn mở/);
  assert.match(brief, /<!-- check-design:begin -->/);
});

test('chỉ giữ 10 run gần nhất', () => {
  const root = fixture();
  for (let d = 1; d <= 12; d++) {
    applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: `2026-08-${String(d).padStart(2, '0')}T10:00:00+07:00` });
  }
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'tasks/GW-1/design-gap.json'), 'utf8'));
  assert.equal(saved.runs.length, 10);
  assert.equal(saved.runs[0].checkedAt.slice(0, 10), '2026-08-03');
});

test('computeDelta báo mục mới phát sinh', () => {
  const prev = { items: [{ id: 'a', label: 'A', verdict: 'ĐỦ' }] };
  const cur = { items: [{ id: 'b', label: 'B', verdict: 'THIẾU', firstSeenMissing: '2026-08-13' }] };
  const d = computeDelta(prev, cur, '2026-08-13T10:00:00+07:00');
  assert.deepEqual(d.fresh.map((x) => x.id), ['b']);
  assert.equal(d.stillMissing.length, 0);
});
