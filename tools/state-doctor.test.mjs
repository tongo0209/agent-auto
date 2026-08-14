import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDoctor } from './state-doctor.mjs';

/**
 * Dựng 1 agent-auto giả trong folder tạm: chỉ cần state.json + config.json + icons.js.
 *
 * Ghi chú: brief gợi ý dùng `fs.cpSync(...)` thẳng vào `<root>/schema/vocab.json`, nhưng
 * `root` chưa có folder con `schema/` (chỉ mkdtempSync ra root trống) nên cpSync/copyFileSync
 * sẽ ENOENT. Sửa lại: tự mkdirSync `schema/` trước rồi copyFileSync — fixture vẫn độc lập,
 * không đụng gì tới state/schema thật của user.
 */
function fixture(state, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ schemaVersion: 2, issues: {}, ...state }));
  fs.writeFileSync(
    path.join(root, 'config.json'),
    JSON.stringify({ cloudId: 'abc-123', gitAuthor: 'ai@vng.com.vn', repos: { 'cdn-source': root }, ...config })
  );
  fs.mkdirSync(path.join(root, 'console/src/core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'schema'), { recursive: true });
  fs.copyFileSync(new URL('../schema/vocab.json', import.meta.url), path.join(root, 'schema/vocab.json'));
  return root;
}

/**
 * Fixture riêng cho luật E7 (icon vocab ↔ core/icons.js).
 *
 * `fixture()` ở trên tạo `console/src/core/` rỗng (không có icons.js) và copy NGUYÊN
 * schema/vocab.json thật — hợp cho mọi luật khác vì chúng luôn gọi `skipIcons: true`
 * (nhánh E7 không bao giờ chạy nên thiếu icons.js không sao). Luật E7 thì ngược lại:
 * phải tắt `skipIcons` để nhánh thực sự chạy, nên cần tự dựng CẢ HAI phía của hợp đồng
 * icon trong tmp root — 1 icons.js giả tối giản (chỉ cần đúng khuôn `const RAW = { ... };`
 * mà `iconNames()` bóc bằng regex, không cần import/webpack thật) và 1 vocab.json giả
 * chỉ khai đúng 1 phase với icon muốn kiểm tra — để không phụ thuộc vào việc vocab.json
 * thật có khai icon gì trong tương lai.
 */
function fixtureIcons({ vocabIcon, fakeIcons }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-icons-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ schemaVersion: 2, issues: {} }));
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ cloudId: 'abc-123', gitAuthor: 'ai@vng.com.vn', repos: { 'cdn-source': root } }));
  fs.mkdirSync(path.join(root, 'console/src/core'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'console/src/core/icons.js'),
    `const RAW = {\n${fakeIcons.map((n) => `  ${n},\n`).join('')}};\n`
  );
  fs.mkdirSync(path.join(root, 'schema'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'schema/vocab.json'),
    JSON.stringify({
      version: 1,
      phases: [{ id: 'p-test', label: 'test phase', icon: vocabIcon }],
      milestones: [],
      designStatus: [],
    })
  );
  return root;
}

const codes = (list) => list.map((f) => f.code).sort();

test('state sạch → không phát hiện gì', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' }, paths: [{ repo: 'cdn-source', path: '.' }] } },
  });
  const r = runDoctor({ root, skipIcons: true });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(codes(r.warns), []);
});

test('E1 phase lạ', () => {
  const root = fixture({ issues: { 'GW-1': { phase: 'gi-vay-troi', milestones: { html: '2026-08-10' } } } });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E1'));
});

test('E2 key mốc lạ, nhưng key `_` là ghi chú nên bỏ qua', () => {
  const bad = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: { hmtl: '2026-08-10' } } } });
  assert.ok(codes(runDoctor({ root: bad, skipIcons: true }).errors).includes('E2'));
  const ok = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10', _conflict: 'x' } } } });
  assert.ok(!codes(runDoctor({ root: ok, skipIcons: true }).errors).includes('E2'));
});

test('E3 ngày không phải YYYY-MM-DD', () => {
  const root = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: { html: '10/08/2026' } } } });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E3'));
});

test('E4 design.status ngoài enum', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' }, design: { status: 'gần xong' } } },
  });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E4'));
});

test('E8 design đã giao (designLink hoặc subtask Done) mà status vẫn chưa-có-link/trống', () => {
  const root = fixture({
    issues: {
      'GW-1': { phase: 'waiting-design', milestones: { html: '2026-08-11' }, designLink: 'https://x.sharepoint.com/f', design: { status: 'chưa-có-link' } },
      'GW-2': { phase: 'waiting-design', milestones: { html: '2026-08-11' }, design: { subtask: { key: 'GW-3', status: 'Done' } } },
    },
  });
  const errs = runDoctor({ root, skipIcons: true }).errors.filter((e) => e.code === 'E8');
  assert.equal(errs.length, 2);
});

test('E8 đối chứng — đã ghi mức đã-giao-* hoặc thật sự chưa có gì thì không báo', () => {
  const root = fixture({
    issues: {
      'GW-1': { phase: 'waiting-design', milestones: { html: '2026-08-11' }, designLink: 'https://x.sharepoint.com/f', design: { status: 'đã-giao-chưa-tải' } },
      'GW-2': { phase: 'waiting-design', milestones: { html: '2026-08-11' }, design: { status: 'chưa-có-link', subtask: { key: 'GW-3', status: 'To Do' } } },
    },
  });
  assert.ok(!codes(runDoctor({ root, skipIcons: true }).errors).includes('E8'));
});

test('E5 thiếu schemaVersion', () => {
  const root = fixture({ schemaVersion: undefined, issues: {} });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E5'));
});

test('E6 repo không khai trong config', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' }, paths: [{ repo: 'repo-la', path: '.' }] } },
  });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E6'));
});

test('W2 đang code mà không có paths · W4 không có mốc nào', () => {
  const root = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: {} } } });
  const w = codes(runDoctor({ root, skipIcons: true }).warns);
  assert.ok(w.includes('W2'));
  assert.ok(w.includes('W4'));
});

test('W3 reassigned mà chưa có handoff.md · W5 còn _conflict', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'reassigned', milestones: { html: '2026-08-10', _conflict: 'x' } } },
  });
  const w = codes(runDoctor({ root, skipIcons: true }).warns);
  assert.ok(w.includes('W3'));
  assert.ok(w.includes('W5'));
});

test('exit code: có error → 1, chỉ warn → 0', () => {
  const bad = fixture({ issues: { 'GW-1': { phase: 'x', milestones: { html: '2026-08-10' } } } });
  const warnOnly = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: {} } } });
  assert.equal(runDoctor({ root: bad, skipIcons: true }).errors.length > 0, true);
  assert.equal(runDoctor({ root: warnOnly, skipIcons: true }).errors.length, 0);
});

/**
 * E7 — chặn ca "vocab khai icon mà core/icons.js không có" (panel sẽ render icon rỗng vì
 * `icon()` trả '' cho tên chưa khai báo, và không ai biết vì không throw, không log).
 *
 * PHẢI chạy với skipIcons TẮT (không truyền skipIcons, hoặc truyền false) — 10 ca cũ ở trên
 * đều bật skipIcons:true nên nhánh `if (!skipIcons) { ... }` (state-doctor.mjs dòng 66-73)
 * chưa từng được thực thi trong bộ test tự động trước khi vá.
 */
test('E7 icon khai trong vocab không có trong icons.js → phải báo lỗi', () => {
  const root = fixtureIcons({ vocabIcon: 'khong-ton-tai', fakeIcons: ['wait', 'ready'] });
  const r = runDoctor({ root }); // không skipIcons — mới thật sự chạy nhánh E7
  assert.ok(codes(r.errors).includes('E7'));
});

test('E7 đối chứng — icon CÓ trong icons.js thì không báo lỗi', () => {
  // Không có ca đối chứng thì ca trên chỉ chứng minh "luôn báo lỗi bất kể icon gì" —
  // phải chứng minh luật này phân biệt được đúng/sai, không phải luôn ồn ào.
  const root = fixtureIcons({ vocabIcon: 'ready', fakeIcons: ['wait', 'ready'] });
  const r = runDoctor({ root });
  assert.ok(!codes(r.errors).includes('E7'));
});

/**
 * W1 — chặn ca "paths[].repo khai đúng trong config.repos nhưng paths[].path không tồn tại
 * trên đĩa". Đây là WARN chứ không phải ERROR (E6 mới là "repo lạ, chưa khai trong
 * config.repos" — khác lỗi, khác mức độ nghiêm trọng).
 */
test('W1 path tồn tại đúng repo nhưng không tồn tại trên đĩa → WARN, không phải E6', () => {
  const root = fixture({
    issues: {
      'GW-1': {
        phase: 'coding',
        milestones: { html: '2026-08-10' },
        paths: [{ repo: 'cdn-source', path: 'thu-muc-khong-ton-tai/file.txt' }],
      },
    },
  });
  const r = runDoctor({ root, skipIcons: true });
  assert.ok(codes(r.warns).includes('W1'));
  assert.ok(!codes(r.errors).includes('E6'));
});

/**
 * E3 bổ sung — key ghi chú `_conflict` (giá trị là câu văn, không phải ngày) KHÔNG được
 * tính là lỗi E3. Nhánh `continue` ở state-doctor.mjs dòng 83 bỏ qua MỌI key bắt đầu bằng
 * "_" trước khi chạy cả 2 check E2 (tên mốc lạ) lẫn E3 (định dạng ngày) — test E2 ở trên
 * (dòng "E2 key mốc lạ...") đã khẳng định nhánh continue cho E2, nhưng chưa khẳng định cho
 * E3 dù cùng một nhánh. Thiếu vế này thì nếu ai lỡ tách nhánh continue riêng cho E2/E3,
 * regression ở phía E3 sẽ không bị bắt.
 */
test('E3 bỏ qua _conflict (giá trị câu văn, không phải ngày) — cùng nhánh continue với E2', () => {
  const root = fixture({
    issues: {
      'GW-1': {
        phase: 'coding',
        milestones: { html: '2026-08-10', _conflict: 'còn tranh chấp giữa FE và BE, chưa chốt ngày' },
      },
    },
  });
  const r = runDoctor({ root, skipIcons: true });
  assert.ok(!codes(r.errors).includes('E3'));
});

/**
 * Ca chạy thật của CLI: `node tools/state-doctor.mjs --root <dir>` KHÔNG truyền `skipIcons`,
 * nên nhánh E7 luôn chạy và `iconNames()` đọc `<root>/console/src/core/icons.js`. Root nào
 * không mang theo bản sao icons.js (fixture, snapshot state ở /tmp để soi thử — đúng cách
 * dùng mà `--root` sinh ra) thì doctor NÉM ENOENT chết ngang, mất luôn cả report của 11 luật
 * còn lại. So sánh với vocab: dòng 48 đã có sẵn nếp "root không có thì lùi về REPO_ROOT" —
 * icons phải theo đúng nếp đó, không được là cái bẫy riêng.
 */
test('--root không có icons.js → lùi về icons.js của repo, không ném', () => {
  const root = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' } } } });
  // fixture() tạo console/src/core/ RỖNG — đúng hiện trạng root do người dùng tự dựng
  assert.ok(!fs.existsSync(path.join(root, 'console/src/core/icons.js')));
  let r;
  assert.doesNotThrow(() => { r = runDoctor({ root }); }); // KHÔNG skipIcons — đúng như CLI gọi
  // Lùi về icons.js thật + vocab thật (fixture copy nguyên) ⇒ hợp đồng icon vẫn khớp, không E7 oan
  assert.ok(!codes(r.errors).includes('E7'));
});

/* ── E9/W6: field `design.gaps` do /check-design ghi ───────────────────────────────────────
 * Field nào cũng phải có người canh. `design.gaps` là số liệu console và báo cáo đọc để nói
 * "design còn thiếu N hạng mục" — sai kiểu ở đây thì cả hai bên đọc phải số rác mà không ai
 * biết, đúng họ lỗi doctor sinh ra để chặn.
 */
test('E9 design.gaps sai định dạng (checkedAt không ISO / counts không phải số)', () => {
  const root = fixture({
    issues: {
      'GW-1': {
        phase: 'ready',
        milestones: { html: '2026-08-10' },
        design: { status: 'đã-giao-đã-tải', gaps: { counts: { missing: 'nhiều' } } },
      },
    },
  });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E9'));
});

test('W6 đang code mà design còn thiếu → cảnh báo, không phải lỗi', () => {
  const root = fixture({
    issues: {
      'GW-1': {
        phase: 'coding',
        milestones: { html: '2026-08-10' },
        paths: [{ repo: 'cdn-source', path: '.' }],
        design: {
          status: 'đã-giao-đã-tải',
          gaps: {
            checkedAt: '2026-08-13T10:00:00+07:00',
            counts: { ok: 1, missing: 2, unsure: 0, na: 0, ask: 0 },
            missingTop: ['Popup frame 4'],
          },
        },
      },
    },
  });
  const r = runDoctor({ root, skipIcons: true });
  const w6 = r.warns.find((w) => w.code === 'W6');
  assert.ok(w6, `mong có W6, thực tế: ${codes(r.warns).join(',')}`);
  assert.match(w6.text, /2 hạng mục/);
  assert.deepEqual(r.errors, []);
});

test('design.gaps hợp lệ và không thiếu gì → im lặng', () => {
  const root = fixture({
    issues: {
      'GW-1': {
        phase: 'coding',
        milestones: { html: '2026-08-10' },
        paths: [{ repo: 'cdn-source', path: '.' }],
        design: {
          status: 'đã-giao-đã-tải',
          gaps: {
            checkedAt: '2026-08-13T10:00:00+07:00',
            counts: { ok: 3, missing: 0, unsure: 0, na: 0, ask: 1 },
            missingTop: [],
          },
        },
      },
    },
  });
  const r = runDoctor({ root, skipIcons: true });
  assert.ok(!codes(r.errors).includes('E9'));
  assert.ok(!codes(r.warns).includes('W6'));
});

/* ── E10/W7: CỔNG CÀI ĐẶT ──────────────────────────────────────────────────
 * Vì sao thêm (14/8): đo thật trên `config.example.json` nguyên placeholder, doctor trả
 * `✓ 0 ERROR · 0 WARN`. Mà README lại bảo member mới dùng ĐÚNG lệnh `/daily doctor` để
 * nghiệm thu cài đặt — tức là hệ thống báo xanh cho một máy chưa cấu hình gì. Báo xanh sai
 * tệ hơn báo đỏ: member tin là xong rồi mới chết ở bước quét Jira mà không biết vì sao.
 *
 * Ranh giới E10 vs W7 — placeholder là bằng chứng CHẮC CHẮN chưa cấu hình ⇒ ERROR.
 * Còn repo trỏ path không tồn tại chỉ là WARN: có member cố tình chưa clone `vportal2view`
 * (37.718 file) mà vẫn dùng /daily cho cdn-source được, chặn cứng là chặn oan.
 */
function fixtureConfig(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-cfg-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ schemaVersion: 2, issues: {} }));
  if (config !== null) fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
  fs.mkdirSync(path.join(root, 'console/src/core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'schema'), { recursive: true });
  fs.copyFileSync(new URL('../schema/vocab.json', import.meta.url), path.join(root, 'schema/vocab.json'));
  return root;
}
const OK_CFG = (root) => ({ cloudId: 'abc-123', gitAuthor: 'ai@vng.com.vn', repos: { 'cdn-source': root } });

test('E10: config đã cấu hình đủ → im lặng', () => {
  const root = fixtureConfig({});
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(OK_CFG(root)));
  const r = runDoctor({ root, skipIcons: true });
  assert.ok(!codes(r.errors).includes('E10'), 'không được báo E10 khi config đã đủ');
});

test('E10: cloudId còn nguyên placeholder <...> → ERROR', () => {
  const root = fixtureConfig({});
  fs.writeFileSync(path.join(root, 'config.json'),
    JSON.stringify({ ...OK_CFG(root), cloudId: '<cloudId Jira của bạn>' }));
  const r = runDoctor({ root, skipIcons: true });
  assert.ok(codes(r.errors).includes('E10'));
});

test('E10: cloudId rỗng → ERROR', () => {
  const root = fixtureConfig({});
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ ...OK_CFG(root), cloudId: '' }));
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E10'));
});

test('E10: gitAuthor còn placeholder → ERROR', () => {
  const root = fixtureConfig({});
  fs.writeFileSync(path.join(root, 'config.json'),
    JSON.stringify({ ...OK_CFG(root), gitAuthor: '<email git của bạn>' }));
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E10'));
});

test('E10: repos còn placeholder → ERROR, và nêu đích danh repo nào', () => {
  const root = fixtureConfig({});
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
    ...OK_CFG(root),
    repos: { 'cdn-source': root, 'new-mainsite': '<đường dẫn tuyệt đối tới repo new-mainsite>' },
  }));
  const r = runDoctor({ root, skipIcons: true });
  const e = r.errors.find((x) => x.code === 'E10' && /new-mainsite/.test(x.text));
  assert.ok(e, 'phải chỉ đích danh new-mainsite, không nói chung chung');
});

test('E10: thiếu hẳn config.json → ERROR (chưa chạy install-skills.sh)', () => {
  const root = fixtureConfig(null);
  const r = runDoctor({ root, skipIcons: true });
  assert.ok(codes(r.errors).includes('E10'));
});

test('W7: repo trỏ path không tồn tại → chỉ WARN, không chặn', () => {
  const root = fixtureConfig({});
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
    ...OK_CFG(root),
    repos: { 'cdn-source': root, vportal2view: path.join(root, 'khong-he-ton-tai') },
  }));
  const r = runDoctor({ root, skipIcons: true });
  assert.ok(codes(r.warns).includes('W7'));
  assert.ok(!codes(r.errors).includes('E10'), 'path sai ≠ chưa cấu hình');
});
