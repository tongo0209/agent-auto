import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/vocab.json'), 'utf8'));
const DONE_STATUSES = new Set(vocab.doneStatuses);
const PHASES_PAST_DUE_CHECK = new Set(['wait-test', 'bugfix', 'done-fe', 'closed']);

const isDone = (status) => DONE_STATUSES.has(String(status).toLowerCase());

export function diffIssues(jqlIssues, state, today) {
	return jqlIssues.map(({ key, fields }) => {
		const seen = state.issues[key];
		const jira = { status: fields.status.name, duedate: fields.duedate ?? null, summary: fields.summary };
		if (!seen) return { key, label: 'MỚI', changes: [], alerts: [] };

		const known = { status: seen.status, duedate: seen.milestones?.duedate ?? null, summary: seen.summary };
		const changes = Object.keys(jira)
			.filter((field) => jira[field] !== known[field])
			.map((field) => ({ field, from: known[field], to: jira[field] }));

		const alerts = [];
		if (jira.duedate && !PHASES_PAST_DUE_CHECK.has(seen.phase)) {
			if (jira.duedate === today) alerts.push('due-today');
			if (jira.duedate < today) alerts.push('overdue');
		}
		if (isDone(jira.status) && !isDone(seen.status)) alerts.push('done-in-jira');

		const label = changes.length || fields.updated !== seen.lastSeenUpdated ? 'ĐỔI' : 'GIỮ';
		return { key, label, changes, alerts };
	});
}

function localToday() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function main() {
	const args = process.argv.slice(2);
	const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
	const raw = JSON.parse(fs.readFileSync(args[0], 'utf8'));
	const state = JSON.parse(fs.readFileSync(option('--state', path.join(ROOT, 'state.json')), 'utf8'));
	const issues = Array.isArray(raw) ? raw : raw.issues.nodes;
	console.log(JSON.stringify(diffIssues(issues, state, option('--today', localToday())), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
