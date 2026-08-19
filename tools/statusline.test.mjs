import { test } from 'node:test';
import assert from 'node:assert';
import { statusLine } from './statusline.mjs';

const TODAY = '2026-08-18';
const SESSION = { workspace: { current_dir: '/Users/x/VNG/agent-auto' } };

test('state sạch — vẫn hiện tên folder, không bịa cảnh báo', () => {
  const s = statusLine({ state: { issues: {} }, today: TODAY, session: SESSION });
  assert.match(s, /agent-auto/);
  assert.doesNotMatch(s, /chờ duyệt|quá mốc/);
});

test('bug chờ duyệt hiện số, tách rổ đã verify và chưa verify', () => {
  const state = {
    issues: {},
    bugWatch: {
      s1: { pendingSheetWrite: [{ bugId: '3', grade: 'verified' }, { bugId: '4' }] },
    },
  };
  assert.match(statusLine({ state, today: TODAY, session: SESSION }), /1 gật · 1 cần mắt/);
});

test('quá mốc là thứ chen lên statusline, kèm đúng tên ticket', () => {
  const state = {
    issues: { 'GW-760': { phase: 'coding', milestones: { html: '2026-08-17' } } },
  };
  const s = statusLine({ state, today: TODAY, session: SESSION });
  assert.match(s, /GW-760/);
  assert.match(s, /quá mốc/);
});

test('nhiều cảnh báo crit thì hiện cái gấp nhất + đếm phần còn lại, không tràn dòng', () => {
  const state = {
    issues: {
      'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' } },
      'GW-2': { phase: 'coding', milestones: { html: '2026-08-16' } },
      'GW-3': { phase: 'waiting-design', milestones: { design: '2026-08-11' } },
    },
  };
  const s = statusLine({ state, today: TODAY, session: SESSION });
  assert.match(s, /GW-1/);
  assert.match(s, /\+2/);
});

test('đếm buglist ĐANG theo dõi, không đếm sheet đã tắt/nghỉ/không phải buglist', () => {
  const state = {
    issues: {},
    bugWatch: {
      a: { follow: true },
      b: { follow: false },
      c: { follow: true, retired: true },
      d: { follow: true, notBugSheet: true },
      e: { follow: true },
    },
  };
  assert.match(statusLine({ state, today: TODAY, session: SESSION }), /2 buglist/);
});

test('state hỏng không được làm vỡ statusline', () => {
  assert.doesNotThrow(() => statusLine({ state: null, today: TODAY, session: {} }));
  assert.ok(statusLine({}).length > 0);
});
