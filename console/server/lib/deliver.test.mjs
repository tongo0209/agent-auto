import { test } from 'node:test';
import assert from 'node:assert';
import deliver from './deliver.js';

const { evaluateDelivery } = deliver;

/** Dòng git log thật của gt-promotion (format %h|%cI|%s) */
const LOG = '095a076|2026-08-10T13:40:31+07:00|(feat): add A49-CFL offline tournament mainsite template';

const ok = (over = {}) =>
  evaluateDelivery({
    promoFolder: '221_JXM/RequestH5BinhChonVoLam_56193',
    files: ['index.html', 'diemdanh.html'],
    remoteLog: LOG,
    dirty: '',
    ...over,
  });

test('đủ 3 điều kiện → đã bàn giao, cho phép đánh Done', () => {
  const v = ok();
  assert.equal(v.state, 'delivered');
  assert.equal(v.canDone, true);
  assert.equal(v.commit, '095a076');
  assert.equal(v.at, '2026-08-10T13:40:31+07:00');
  assert.match(v.subject, /A49-CFL offline tournament/);
});

test('ticket không có promoFolder → không áp dụng, KHÔNG hiện nút', () => {
  const v = ok({ promoFolder: null });
  assert.equal(v.state, 'n/a');
  assert.equal(v.canDone, false);
});

test('có folder nhưng mainsite chưa có file nào → chưa bàn giao', () => {
  const v = ok({ files: [] });
  assert.equal(v.state, 'no-files');
  assert.equal(v.canDone, false);
});

test('file đã chép nhưng CHƯA PUSH → chặn Done', () => {
  // Đây là ca nguy hiểm nhất: file nằm trên máy mình, PM không thấy gì.
  const v = ok({ remoteLog: '' });
  assert.equal(v.state, 'unpushed');
  assert.equal(v.canDone, false);
  assert.match(v.message, /push/i);
});

test('đã push nhưng folder còn thay đổi chưa commit → vẫn cho Done, có cảnh báo', () => {
  const v = ok({ dirty: ' M 221_JXM/RequestH5BinhChonVoLam_56193/mainsite/index.html' });
  assert.equal(v.state, 'delivered');
  assert.equal(v.canDone, true);
  assert.equal(v.dirty, true);
  assert.match(v.message, /chưa commit|chưa push/i);
});

test('sạch sẽ thì không bịa ra cảnh báo dirty', () => {
  assert.equal(ok().dirty, false);
});

test('git log có ký tự | trong subject vẫn bóc đúng commit và thời gian', () => {
  const v = ok({ remoteLog: 'abc1234|2026-08-09T10:00:00+07:00|fix: sửa header | footer' });
  assert.equal(v.commit, 'abc1234');
  assert.equal(v.at, '2026-08-09T10:00:00+07:00');
  assert.equal(v.subject, 'fix: sửa header | footer');
});

test('git log lem nhem (thiếu trường) → coi như chưa push, không đoán bừa', () => {
  const v = ok({ remoteLog: 'khong-phai-dinh-dang' });
  assert.equal(v.state, 'unpushed');
  assert.equal(v.canDone, false);
});
