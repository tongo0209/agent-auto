import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffIssues } from './jira-diff.mjs';

const TODAY = '2026-10-14';

const node = (key, f = {}) => ({
	key,
	fields: { summary: 'Landing A', status: { name: 'In Progress' }, updated: '2026-10-13T10:00:00.000+0700', duedate: '2026-10-26', ...f },
});

const stateWith = (key, s = {}) => ({
	issues: { [key]: { summary: 'Landing A', status: 'In Progress', lastSeenUpdated: '2026-10-13T10:00:00.000+0700', phase: 'coding', milestones: { duedate: '2026-10-26' }, ...s } },
});

test('key chưa có trong state ⇒ MỚI', () => {
	const [r] = diffIssues([node('GW-900')], { issues: {} }, TODAY);
	assert.equal(r.label, 'MỚI');
});

test('không đổi gì ⇒ GIỮ, không change', () => {
	const [r] = diffIssues([node('GW-1')], stateWith('GW-1'), TODAY);
	assert.equal(r.label, 'GIỮ');
	assert.deepEqual(r.changes, []);
	assert.deepEqual(r.alerts, []);
});

test('ca GW-886: duedate 26/10 → 14/10 ⇒ ĐỔI + due-today', () => {
	const jql = node('GW-886', { duedate: '2026-10-14', updated: '2026-10-14T10:55:00.000+0700' });
	const [r] = diffIssues([jql], stateWith('GW-886'), TODAY);
	assert.equal(r.label, 'ĐỔI');
	assert.deepEqual(r.changes, [{ field: 'duedate', from: '2026-10-26', to: '2026-10-14' }]);
	assert.deepEqual(r.alerts, ['due-today']);
});

test('updated khác lastSeenUpdated dù không field nào đổi ⇒ ĐỔI', () => {
	const [r] = diffIssues([node('GW-1', { updated: '2026-10-14T09:00:00.000+0700' })], stateWith('GW-1'), TODAY);
	assert.equal(r.label, 'ĐỔI');
	assert.deepEqual(r.changes, []);
});

test('duedate quá hạn ⇒ overdue', () => {
	const [r] = diffIssues([node('GW-1', { duedate: '2026-10-10' })], stateWith('GW-1', { milestones: { duedate: '2026-10-10' } }), TODAY);
	assert.deepEqual(r.alerts, ['overdue']);
});

test('phase wait-test thì không bắn due-today', () => {
	const [r] = diffIssues([node('GW-1', { duedate: TODAY })], stateWith('GW-1', { phase: 'wait-test' }), TODAY);
	assert.deepEqual(r.alerts, []);
});

test('status sang COMPLETED ⇒ change status + done-in-jira', () => {
	const [r] = diffIssues([node('GW-1', { status: { name: 'COMPLETED' } })], stateWith('GW-1'), TODAY);
	assert.equal(r.label, 'ĐỔI');
	assert.deepEqual(r.changes, [{ field: 'status', from: 'In Progress', to: 'COMPLETED' }]);
	assert.deepEqual(r.alerts, ['done-in-jira']);
});

test('state đã done thì không bắn done-in-jira', () => {
	const [r] = diffIssues([node('GW-1', { status: { name: 'COMPLETED' } })], stateWith('GW-1', { status: 'COMPLETED' }), TODAY);
	assert.deepEqual(r.alerts, []);
});
