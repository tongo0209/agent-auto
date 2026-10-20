import fs from 'node:fs';
import path from 'node:path';
import { loadFlow } from './flows.mjs';

const RULES_FILE = path.resolve(import.meta.dirname, '../../../flows/router.json');

export const loadRules = () => JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')).rules;

function holds(cond, signals) {
  if (cond.startsWith('!')) return !signals[cond.slice(1)];
  const [field, value] = cond.split('=');
  return value === undefined ? Boolean(signals[field]) : signals[field] === value;
}

const fill = (text, signals) => text.replace(/\{(\w+)\}/g, (_, name) => signals[name] ?? '?');

const flowAsk = (id) => loadFlow(id).ask ?? [];

export function route(signals, rules, askOf = flowAsk) {
  const rule = rules.find((r) => r.all.every((cond) => holds(cond, signals)));
  if (!rule) return { flow: 'manual', matched: [], reason: 'không luật nào khớp — chọn tay bằng --flow' };
  const matched = rule.all;
  if (rule.flow === 'manual') return { flow: 'manual', matched, reason: fill(rule.reason, signals) };
  if (rule.flow === 'ask') return { flow: 'ask', matched, reason: fill(rule.reason, signals), questions: rule.questions.map((q) => fill(q, signals)) };
  const unmet = askOf(rule.flow)
    .filter((a) => !(rule.needsCampaign === false && a.need.includes('campaignDir')))
    .filter((a) => !a.need.every((cond) => holds(cond, signals)));
  if (unmet.length) {
    const missing = unmet.flatMap((a) => a.need).join(', ');
    return { flow: 'ask', target: rule.flow, matched, reason: `khớp ${rule.flow} nhưng chưa đạt: ${missing}`, questions: unmet.map((a) => a.question) };
  }
  return { flow: rule.flow, matched, reason: `${rule.flow}: ${matched.join(' · ')}` };
}
