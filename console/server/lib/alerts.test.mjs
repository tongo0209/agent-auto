import { test } from 'node:test';
import assert from 'node:assert';
import { buildAlerts } from './alerts.js';

/**
 * Test cho lỗ Critical 3/8 — cảnh báo mốc: `buildAlerts()` KHÔNG có test nào từ trước, đó
 * chính là lý do lỗ sống sót lâu vậy.
 *
 * Ca lộ lỗ: GW-556 (`coding`, KHÔNG có mốc `html`, chỉ có `deliver` 07/8 còn 4 ngày — mốc
 * GẦN NHẤT trong cả hệ hôm 3/8) — bản cũ chỉ đọc `ms.html` nên `buildAlerts()` trả `[]` cho
 * ticket này, notifyTick() im lặng đúng lúc gấp nhất.
 *
 * `today` cố định '2026-08-03' để mọi ca số ngày (`daysBetween`) là số cứng, không trôi theo
 * ngày chạy test.
 */
const TODAY = '2026-08-03';

function stateWith(issue) {
  return { issues: { 'GW-TEST': issue } };
}

/** Chỉ lấy alert MỐC (3 mã html-overdue/html-urgent/html-near) — bỏ qua design-overdue/stale/... */
const milestoneAlerts = (alerts) => alerts.filter((a) => a.code.startsWith('html-'));

test('phase deliver + mốc html đã qua → html-overdue mức crit', () => {
  const alerts = buildAlerts(
    stateWith({ phase: 'deliver', milestones: { html: '2026-08-01' } }),
    TODAY,
    {}
  );
  const ms = milestoneAlerts(alerts);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].code, 'html-overdue');
  assert.equal(ms[0].level, 'crit');
});

test('ca GW-556: phase coding, KHÔNG có mốc html, có deliver còn 4 ngày → html-near mức warn, text nói "Giao HTML"', () => {
  const alerts = buildAlerts(
    stateWith({ phase: 'coding', milestones: { deliver: '2026-08-07' } }),
    TODAY,
    {}
  );
  const ms = milestoneAlerts(alerts);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].code, 'html-near');
  assert.equal(ms[0].level, 'warn');
  assert.ok(ms[0].text.includes('Giao HTML'), `text phải chứa nhãn mốc "Giao HTML", nhận được: "${ms[0].text}"`);
});

test('phase được miễn trễ mốc (wait-test/done-fe/closed/reassigned) + mốc đã qua → KHÔNG có alert mốc', () => {
  for (const phase of ['wait-test', 'done-fe', 'closed', 'reassigned']) {
    const alerts = buildAlerts(
      stateWith({ phase, milestones: { html: '2026-07-01', deliver: '2026-07-01' } }),
      TODAY,
      {}
    );
    assert.equal(milestoneAlerts(alerts).length, 0, `phase "${phase}" được miễn trễ mốc mà vẫn sinh alert mốc`);
  }
});

test('mốc deliver còn 1 ngày → html-urgent mức crit', () => {
  const alerts = buildAlerts(
    stateWith({ phase: 'coding', milestones: { deliver: '2026-08-04' } }),
    TODAY,
    {}
  );
  const ms = milestoneAlerts(alerts);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].code, 'html-urgent');
  assert.equal(ms[0].level, 'crit');
});

/**
 * ĐỔI QUYẾT ĐỊNH 12/8 — ca trước ở đây khẳng định "chỉ có duedate → không alert, duedate là mốc
 * hành chính". Lý do gốc của nó vẫn đúng và được giữ: `duedate` Jira có thể lệch mốc thật viết
 * trong description (GW-610 — duedate 29/7 nhưng mốc HTML 30/7, description mới là chuẩn).
 *
 * Nhưng luật cũ đi quá xa: nó cũng im khi `duedate` là mốc DUY NHẤT biết được. Đo thật 12/8 —
 * GW-720 `milestones: {duedate: 13/8}`, phase `waiting-design`, due NGÀY MAI, là "việc gấp nhất
 * hôm nay" theo board, mà `/api/alerts` trả `[]`; GW-525 (due 14/8, phase coding) cũng vậy.
 * `server/index.js` bắn notification từ đúng mảng này ⇒ `notified.jsonl` im 2 ngày liền, đúng 2
 * ngày chứa mốc gấp nhất.
 *
 * Luật mới: mốc key thắng khi có; KHÔNG có mốc key nào thì mới lấy `duedate`.
 */
test('chỉ có duedate và mốc đã qua → CÓ alert mốc (đổi luật 12/8, ca GW-720/GW-525)', () => {
  const ms = milestoneAlerts(buildAlerts(stateWith({ phase: 'coding', milestones: { duedate: '2026-07-01' } }), TODAY, {}));
  assert.equal(ms.length, 1);
  assert.equal(ms[0].code, 'html-overdue');
  assert.ok(ms[0].text.includes('Due Jira'), `phải gọi đúng tên mốc, nhận được: "${ms[0].text}"`);
});

test('ca thật GW-720: chỉ có duedate, còn 1 ngày, waiting-design → crit', () => {
  const ms = milestoneAlerts(
    buildAlerts({ issues: { 'GW-720': { phase: 'waiting-design', milestones: { duedate: '2026-08-04' } } } }, TODAY, {})
  );
  assert.equal(ms.length, 1);
  assert.equal(ms[0].code, 'html-urgent');
  assert.equal(ms[0].level, 'crit');
});

test('GIỮ luật cũ: có mốc key thì duedate bị bỏ qua, dù duedate sớm hơn (ca GW-610)', () => {
  // duedate 29/7 đã qua 5 ngày, html 30/8 còn xa. Nếu duedate thắng thì sẽ báo overdue oan.
  const ms = milestoneAlerts(
    buildAlerts(stateWith({ phase: 'coding', milestones: { html: '2026-08-30', duedate: '2026-07-29' } }), TODAY, {})
  );
  assert.equal(ms.length, 0, 'duedate không được lấn mốc key');
});

test('phase được miễn trễ mốc vẫn KHÔNG bị duedate đánh thức', () => {
  const ms = milestoneAlerts(
    buildAlerts(stateWith({ phase: 'wait-test', milestones: { duedate: '2026-07-01' } }), TODAY, {})
  );
  assert.equal(ms.length, 0);
});

test('ĐỐI CHỨNG: phase coding + mốc html còn 7 ngày → không có alert mốc (không phải hàm cứ có mốc là báo)', () => {
  const alerts = buildAlerts(
    stateWith({ phase: 'coding', milestones: { html: '2026-08-10' } }),
    TODAY,
    {}
  );
  assert.equal(milestoneAlerts(alerts).length, 0);
});

test('design đã giao mà chưa tải → WARN, nhưng chỉ với phase còn phải ra HTML', () => {
  // Cổng của cảnh báo này là cờ `htmlTodo`. Trước đây không ca test nào phủ nó, nên xoá cờ
  // `htmlTodo` khỏi `coding` trong vocab vẫn qua được `npm run check` — mất lưới im lặng.
  const design = { status: 'đã-giao-chưa-tải' };
  const coding = buildAlerts(
    { issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-20' }, design } } },
    '2026-08-03',
    {}
  );
  assert.ok(coding.some((a) => a.code === 'design-not-downloaded' && a.level === 'warn'));

  // `wait-test` đã qua khâu giao HTML → tải design về nữa cũng không còn ý nghĩa chặn luồng
  const waitTest = buildAlerts(
    { issues: { 'GW-2': { phase: 'wait-test', milestones: { html: '2026-08-20' }, design } } },
    '2026-08-03',
    {}
  );
  assert.ok(!waitTest.some((a) => a.code === 'design-not-downloaded'));
});

/* ─────────────────── nợ đọng rơi radar (debt-dropped) ─────────────────── */

const debtWith = (groups) => ({ groups });
const debtAlerts = (alerts) => alerts.filter((a) => a.code === 'debt-dropped');

test('ca thật GW-627: 4 việc từ board 10/8 rơi 2 ngày → MỘT alert cho cả ticket, không phải 4', () => {
  const alerts = buildAlerts(
    { issues: { 'GW-627': { phase: 'done-fe', milestones: {} } } },
    TODAY,
    {},
    debtWith([
      {
        key: 'GW-627',
        offMyPlate: false,
        staleDays: 2,
        oldestDate: '2026-08-01',
        items: [{}, {}, {}, {}],
      },
    ])
  );
  const d = debtAlerts(alerts);
  assert.equal(d.length, 1, 'phải gộp 1 alert/ticket — 4 alert cho 1 ticket là spam');
  assert.ok(d[0].text.includes('4 việc'), `text phải nói số việc, nhận được: "${d[0].text}"`);
  assert.ok(d[0].text.includes('2026-08-01'), 'text phải nói board nguồn để bấm vào tra lại');
});

test('nợ LUÔN là warn, dù cũ bao nhiêu ngày — nợ là việc tồn, không phải việc gấp', () => {
  // Đổi luật 13/8: trước đây nợ ≥3 ngày lên `crit` nên bắn cả notification. Đo trên màn hình
  // thật: 5 dòng đỏ nợ đè hết mốc deadline xuống dưới — dải cảnh báo mất tác dụng phân loại.
  const at = (staleDays) =>
    debtAlerts(
      buildAlerts(
        { issues: { 'GW-1': { phase: 'coding', milestones: {} } } },
        TODAY,
        {},
        debtWith([{ key: 'GW-1', offMyPlate: false, staleDays, oldestDate: '2026-08-01', items: [{}] }])
      )
    )[0];
  for (const d of [1, 2, 3, 9, 30]) assert.equal(at(d).level, 'warn', `nợ ${d} ngày phải là warn`);
});

test('nhiều ticket nợ → ĐÚNG 1 dòng gom, không phải mỗi ticket 1 dòng', () => {
  // Ca thật 13/8: GW-477 · GW-525 · GW-610 · GW-627 mỗi cái 1 dòng đỏ riêng.
  const alerts = buildAlerts(
    {
      issues: {
        'GW-1': { phase: 'coding', milestones: {} },
        'GW-2': { phase: 'coding', milestones: {} },
        'GW-3': { phase: 'coding', milestones: {} },
      },
    },
    TODAY,
    {},
    debtWith([
      { key: 'GW-1', offMyPlate: false, staleDays: 14, oldestDate: '2026-07-30', items: [{ date: '2026-07-30' }, { date: '2026-08-02' }] },
      { key: 'GW-2', offMyPlate: false, staleDays: 10, oldestDate: '2026-08-03', items: [{ date: '2026-08-03' }] },
      { key: 'GW-3', offMyPlate: false, staleDays: 3, oldestDate: '2026-08-10', items: [{ date: '2026-08-10' }] },
    ])
  );
  const d = debtAlerts(alerts);
  assert.equal(d.length, 1, 'phải gom thành đúng 1 dòng');
  assert.ok(d[0].text.includes('4 việc'), `phải cộng đủ số việc: "${d[0].text}"`);
  assert.ok(d[0].text.includes('4 board'), `phải nói số board: "${d[0].text}"`);
  assert.ok(d[0].text.includes('2026-07-30'), `phải nói mốc cũ nhất: "${d[0].text}"`);
  for (const k of ['GW-1', 'GW-2', 'GW-3'])
    assert.ok(d[0].text.includes(k), `vẫn phải kể tên ticket ${k} để còn lần ra: "${d[0].text}"`);
});

test('ticket đã đóng ở Jira thì IM, dù phase còn tụt hậu', () => {
  // Ca thật 13/8: GW-477 `status: Done` mà phase mới `wait-test`; GW-610/GW-627 `COMPLETED`.
  // Phase do skill suy từ commit nên luôn chậm hơn Jira ⇒ không được lấy phase làm nguồn duy nhất.
  for (const status of ['Done', 'COMPLETED', 'Canceled', 'closed']) {
    const alerts = buildAlerts(
      { issues: { 'GW-477': { phase: 'wait-test', status, milestones: { html: '2026-08-01' } } } },
      TODAY,
      {},
      debtWith([{ key: 'GW-477', offMyPlate: false, staleDays: 14, oldestDate: '2026-07-30', items: [{ date: '2026-07-30' }] }])
    );
    assert.equal(alerts.length, 0, `status "${status}" mà vẫn còn cảnh báo: ${JSON.stringify(alerts)}`);
  }
});

test('ticket đã bàn giao cho người khác (assigneeNow) thì IM', () => {
  // Ca thật GW-654: phase `reassigned`, assigneeNow "Trần Thành Đạt" — không còn việc của mình.
  const alerts = buildAlerts(
    { issues: { 'GW-654': { phase: 'coding', assigneeNow: 'Trần Thành Đạt', milestones: { html: '2026-08-01' } } } },
    TODAY,
    {},
    debtWith([{ key: 'GW-654', offMyPlate: false, staleDays: 9, oldestDate: '2026-08-01', items: [{ date: '2026-08-01' }] }])
  );
  assert.equal(alerts.length, 0, JSON.stringify(alerts));
});

test('ticket closed/reassigned KHÔNG sinh alert nợ — nhiễu tháng 7 chỉ nằm trong UI', () => {
  for (const phase of ['closed', 'reassigned']) {
    const alerts = buildAlerts(
      { issues: { 'GW-660': { phase, milestones: {} } } },
      TODAY,
      {},
      debtWith([{ key: 'GW-660', offMyPlate: true, staleDays: 30, oldestDate: '2026-07-05', items: [{}] }])
    );
    assert.equal(debtAlerts(alerts).length, 0, `phase "${phase}" không được nhắc ra ngoài trang`);
  }
});

test('nợ không gắn ticket: CỐ Ý không sinh alert (không quy được cho ai) — chỉ hiện trong UI', () => {
  const alerts = buildAlerts(
    { issues: {} },
    TODAY,
    {},
    debtWith([{ key: null, offMyPlate: false, staleDays: 20, oldestDate: '2026-07-14', items: [{}] }])
  );
  assert.equal(debtAlerts(alerts).length, 0);
});

test('nợ của ticket KHÔNG có trong state vẫn được nhắc — đừng im vì state thiếu', () => {
  const alerts = buildAlerts(
    { issues: {} },
    TODAY,
    {},
    debtWith([{ key: 'GW-999', offMyPlate: false, staleDays: 5, oldestDate: '2026-07-29', items: [{}] }])
  );
  assert.equal(debtAlerts(alerts).length, 1);
  assert.equal(debtAlerts(alerts)[0].level, 'warn');
});

test('không truyền debt → hành vi y như cũ, không nổ', () => {
  const alerts = buildAlerts(stateWith({ phase: 'coding', milestones: { html: '2026-08-04' } }), TODAY, {});
  assert.equal(debtAlerts(alerts).length, 0);
  assert.equal(milestoneAlerts(alerts).length, 1);
});

test('nợ trải NHIỀU board: text không được nói như thể tất cả từ một board', () => {
  // Ca thật GW-654: 11 mục trải 6 board khác nhau. Text cũ ghi `11 việc từ board 30/7` đọc thành
  // "board 30/7 có 11 việc" — sai. Phải nói rõ là từ nhiều board, mốc cũ nhất là ngày nào.
  const alerts = buildAlerts(
    { issues: { 'GW-1': { phase: 'coding', milestones: {} } } },
    TODAY,
    {},
    debtWith([
      {
        key: 'GW-1',
        offMyPlate: false,
        staleDays: 4,
        oldestDate: '2026-07-30',
        items: [{ date: '2026-07-30' }, { date: '2026-08-01' }, { date: '2026-08-02' }],
      },
    ])
  );
  const t = debtAlerts(alerts)[0].text;
  assert.ok(t.includes('3 việc'), `phải nói số việc: "${t}"`);
  assert.ok(/3 board|nhiều board/.test(t), `phải nói việc trải nhiều board: "${t}"`);
  assert.ok(t.includes('2026-07-30'), `phải nói mốc cũ nhất: "${t}"`);
});

test('nợ dồn từ ĐÚNG một board: vẫn phải nói đúng "1 board"', () => {
  const alerts = buildAlerts(
    { issues: { 'GW-1': { phase: 'coding', milestones: {} } } },
    TODAY,
    {},
    debtWith([
      {
        key: 'GW-1',
        offMyPlate: false,
        staleDays: 2,
        oldestDate: '2026-08-01',
        items: [{ date: '2026-08-01' }, { date: '2026-08-01' }],
      },
    ])
  );
  const t = debtAlerts(alerts)[0].text;
  assert.ok(t.includes('2 việc'), `phải nói số việc: "${t}"`);
  assert.ok(t.includes('1 board'), `2 mục cùng ngày = 1 board, không được đếm thành 2: "${t}"`);
  assert.ok(t.includes('2026-08-01'), `phải nói ngày board: "${t}"`);
});
