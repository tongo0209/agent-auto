import { test } from 'node:test';
import assert from 'node:assert';
import { createPtyStore } from './ptyStore.js';

/** pty giả — ghi lại mọi thứ nhận được, bắn output theo lệnh của test */
function fakePty() {
  const p = {
    written: [],
    resized: [],
    killed: false,
    _data: null,
    _exit: null,
    onData: (cb) => (p._data = cb),
    onExit: (cb) => (p._exit = cb),
    write: (d) => p.written.push(d),
    resize: (c, r) => p.resized.push([c, r]),
    kill: () => (p.killed = true),
    emit: (d) => p._data(d),
    exit: () => p._exit(),
  };
  return p;
}

/** Client giả — hứng payload server gửi xuống */
function fakeClient() {
  const sent = [];
  return { sent, send: (p) => sent.push(p), outputs: () => sent.filter((p) => p.type === 'output').map((p) => p.data) };
}

const mkStore = (over = {}) => {
  const ptys = [];
  const store = createPtyStore({
    spawn: () => {
      const p = fakePty();
      ptys.push(p);
      return p;
    },
    now: () => over.nowValue ?? 1000,
    ttlMs: over.ttlMs ?? 60000,
    bufferBytes: over.bufferBytes ?? 100,
  });
  return { store, ptys };
};

test('attach lần đầu tạo pty mới', () => {
  const { store, ptys } = mkStore();
  const c = fakeClient();
  const r = store.attach('s1', c, { cols: 80, rows: 24 });
  assert.equal(r.fresh, true);
  assert.equal(ptys.length, 1);
  assert.equal(store.size(), 1);
});

// Đây là điểm chính: reload trang = socket đóng rồi nối lại cùng id → phải trúng pty CŨ,
// không được spawn shell mới (bản cũ kill pty ngay khi socket đóng nên claude chết theo).
test('attach lại cùng id dùng lại pty cũ, không spawn thêm', () => {
  const { store, ptys } = mkStore();
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.detach('s1');
  const r = store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  assert.equal(r.fresh, false);
  assert.equal(ptys.length, 1);
  assert.equal(ptys[0].killed, false);
});

test('detach KHÔNG giết pty', () => {
  const { store, ptys } = mkStore();
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.detach('s1');
  assert.equal(ptys[0].killed, false);
  assert.equal(store.size(), 1);
});

test('output lúc đang rời được phát lại khi attach lại', () => {
  const { store, ptys } = mkStore();
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.detach('s1');
  ptys[0].emit('claude đang chạy...');
  const c2 = fakeClient();
  const r = store.attach('s1', c2, { cols: 80, rows: 24 });
  assert.match(r.replay, /claude đang chạy\.\.\./);
});

test('client đang gắn nhận output trực tiếp', () => {
  const { store, ptys } = mkStore();
  const c = fakeClient();
  store.attach('s1', c, { cols: 80, rows: 24 });
  ptys[0].emit('xin chào');
  assert.deepEqual(c.outputs(), ['xin chào']);
});

// Client cũ không được nhận tiếp: nếu 2 tab trình duyệt cùng gắn 1 phiên thì gõ 1 nơi hiện 2 nơi
// và cả hai cùng ghi input — rối không gỡ được.
test('client mới đá client cũ ra khỏi phiên', () => {
  const { store, ptys } = mkStore();
  const c1 = fakeClient();
  store.attach('s1', c1, { cols: 80, rows: 24 });
  const c2 = fakeClient();
  store.attach('s1', c2, { cols: 80, rows: 24 });
  ptys[0].emit('sau khi đổi client');
  assert.deepEqual(c1.outputs(), []);
  assert.deepEqual(c2.outputs(), ['sau khi đổi client']);
});

test('buffer phát lại bị cắt đầu khi vượt trần byte', () => {
  const { store, ptys } = mkStore({ bufferBytes: 10 });
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.detach('s1');
  ptys[0].emit('abcdefghij');
  ptys[0].emit('KLM');
  const r = store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  assert.equal(r.replay.length, 10);
  assert.equal(r.replay.endsWith('KLM'), true);
});

test('write và resize đi đúng pty', () => {
  const { store, ptys } = mkStore();
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.write('s1', 'ls\r');
  store.resize('s1', 120, 40);
  assert.deepEqual(ptys[0].written, ['ls\r']);
  assert.deepEqual(ptys[0].resized.at(-1), [120, 40]);
});

test('attach lại đồng bộ kích thước cửa sổ mới', () => {
  const { store, ptys } = mkStore();
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.detach('s1');
  store.attach('s1', fakeClient(), { cols: 100, rows: 30 });
  assert.deepEqual(ptys[0].resized.at(-1), [100, 30]);
});

// Đóng tab terminal trong UI là chủ ý của user — khác hẳn reload.
test('kill giết pty và xoá phiên', () => {
  const { store, ptys } = mkStore();
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.kill('s1');
  assert.equal(ptys[0].killed, true);
  assert.equal(store.size(), 0);
});

test('shell tự thoát thì phiên tự biến mất', () => {
  const { store, ptys } = mkStore();
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  ptys[0].exit();
  assert.equal(store.size(), 0);
});

test('shell thoát lúc đang gắn thì báo client', () => {
  const { store, ptys } = mkStore();
  const c = fakeClient();
  store.attach('s1', c, { cols: 80, rows: 24 });
  ptys[0].exit();
  assert.equal(c.sent.some((p) => p.type === 'exit'), true);
});

// Không có TTL thì đóng hẳn trình duyệt là bỏ lại pty sống mãi.
test('sweep giết phiên đã rời quá TTL', () => {
  let clock = 1000;
  const ptys = [];
  const store = createPtyStore({
    spawn: () => {
      const p = fakePty();
      ptys.push(p);
      return p;
    },
    now: () => clock,
    ttlMs: 60000,
    bufferBytes: 100,
  });
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  store.detach('s1');
  clock += 60001;
  store.sweep();
  assert.equal(ptys[0].killed, true);
  assert.equal(store.size(), 0);
});

test('sweep KHÔNG giết phiên đang có client gắn', () => {
  let clock = 1000;
  const ptys = [];
  const store = createPtyStore({
    spawn: () => {
      const p = fakePty();
      ptys.push(p);
      return p;
    },
    now: () => clock,
    ttlMs: 60000,
    bufferBytes: 100,
  });
  store.attach('s1', fakeClient(), { cols: 80, rows: 24 });
  clock += 10 * 60000;
  store.sweep();
  assert.equal(ptys[0].killed, false);
  assert.equal(store.size(), 1);
});

// spawn hỏng (node-pty lệch bản Node) không được làm sập server — bản cũ đã cẩn thận chỗ này.
test('spawn lỗi thì báo client và không tạo phiên', () => {
  const store = createPtyStore({
    spawn: () => {
      throw new Error('posix_spawnp failed');
    },
    now: () => 1000,
    ttlMs: 60000,
    bufferBytes: 100,
  });
  const c = fakeClient();
  const r = store.attach('s1', c, { cols: 80, rows: 24 });
  assert.equal(r.error, 'posix_spawnp failed');
  assert.equal(store.size(), 0);
});
