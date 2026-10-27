import { test } from 'node:test';
import assert from 'node:assert';
import { pushCommand, flowShape, groupTracks, trackLinks } from './lib.js';

test('pushCommand: cdn-source chỉ chạy git mr — push trần trước thì MR không được tạo', () => {
  assert.strictEqual(pushCommand('/x/git-vng/cdn-source', 'tont'), 'git -C "/x/git-vng/cdn-source" mr');
});

test('pushCommand: repo khác push đúng nhánh lên origin', () => {
  assert.strictEqual(pushCommand('/x/git-vng/gt-promotion-template', 'master'), 'git -C "/x/git-vng/gt-promotion-template" push origin master');
});

const cell = (id, more = {}) => ({ id, kind: 'claude', state: 'pending', rounds: 0, next: null, back: null, side: false, ...more });

test('flowShape: flow chuỗi đơn giữ nguyên làn + hàng side như cũ', () => {
  const cells = [cell('plan', { next: 'gates' }), cell('gates', { next: 'commit', back: 'fix' }), cell('commit'), cell('fix', { side: true })];
  const { lane, side } = flowShape(cells);
  assert.deepStrictEqual(lane.map((c) => c.id), ['plan', 'gates', 'commit']);
  assert.deepStrictEqual(side.map((c) => c.id), ['fix']);
});

const NEW_FLOW = [
  cell('plan', { next: 'sections' }),
  cell('sections', { kind: 'sections', next: 'implement', roles: { lane: 'implement-section', review: 'section-review', build: 'section-build', ui: 'section-ui', fix: 'fix-section' } }),
  cell('implement-section'), cell('section-review'), cell('section-build', { kind: 'gate' }), cell('section-ui'), cell('fix-section'),
  cell('implement', { next: 'checks' }),
  cell('checks', { kind: 'parallel', next: 'handoff', back: 'fix', branches: [['code-review'], ['gates', ['ui-check', 'design-compare']]] }),
  cell('code-review', { state: 'running' }), cell('gates', { kind: 'gate', state: 'running' }), cell('ui-check'), cell('design-compare'),
  cell('handoff'), cell('fix', { side: true }), cell('stray-old'), cell('member-unknown', { group: 'checks', state: 'running' }),
];

test('flowShape: stage con của nhóm (theo branches/roles hoặc field group) không rơi xuống side, ô lạc chưa chạy bị bỏ', () => {
  const { lane, side } = flowShape(NEW_FLOW);
  assert.deepStrictEqual(lane.map((c) => c.id), ['plan', 'sections', 'implement', 'checks', 'handoff']);
  assert.deepStrictEqual(side.map((c) => c.id), ['fix']);
});

test('groupTracks parallel: mỗi nhánh 1 vệt, bước mảng đứng chồng; trackLinks có tách + hợp', () => {
  const checks = NEW_FLOW.find((c) => c.id === 'checks');
  const tracks = groupTracks(checks, NEW_FLOW);
  assert.deepStrictEqual(tracks.map((t) => t.steps.map((s) => s.map((c) => c.id))), [[['code-review']], [['gates'], ['ui-check', 'design-compare']]]);
  const { links, tails } = trackLinks(checks, tracks);
  assert.deepStrictEqual(links, [['checks', 'code-review'], ['checks', 'gates'], ['gates', 'ui-check'], ['gates', 'design-compare']]);
  assert.deepStrictEqual(tails, ['code-review', 'ui-check', 'design-compare']);
});

test('groupTracks sections: chưa chia section → 1 vệt gộp; có section → mỗi section 1 vệt, fix vòng về lane của nó', () => {
  const sections = NEW_FLOW.find((c) => c.id === 'sections');
  const [merged] = groupTracks(sections, NEW_FLOW);
  assert.deepStrictEqual(merged.steps.map(([c]) => c.id), ['implement-section', 'section-review', 'section-build', 'section-ui']);
  assert.strictEqual(merged.fix.back, 'implement-section');
  const role = (stage, sec) => cell(`${stage}@${sec}`);
  const split = { ...sections, sections: ['hero', 'gift'].map((id) => ({ id, cells: { lane: role('implement-section', id), review: role('section-review', id), build: role('section-build', id), ui: role('section-ui', id), fix: role('fix-section', id) } })) };
  const tracks = groupTracks(split, NEW_FLOW);
  assert.deepStrictEqual(tracks.map((t) => [t.label, t.steps.length, t.fix.id, t.fix.back]), [['hero', 4, 'fix-section@hero', 'implement-section@hero'], ['gift', 4, 'fix-section@gift', 'implement-section@gift']]);
  assert.deepStrictEqual(trackLinks(split, tracks).tails, ['section-ui@hero', 'section-ui@gift']);
});

test('groupTracks: ô thường không phải nhóm → không có vệt', () => {
  assert.deepStrictEqual(groupTracks(cell('plan'), NEW_FLOW), []);
});
