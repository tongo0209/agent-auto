import fs from 'node:fs';
import path from 'node:path';

const RULES_FILE = path.resolve(import.meta.dirname, '../../../flows/router.json');

export const loadRules = () => JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')).rules;

function holds(cond, signals) {
  if (cond.startsWith('!')) return !signals[cond.slice(1)];
  const [field, value] = cond.split('=');
  return value === undefined ? Boolean(signals[field]) : signals[field] === value;
}

export function route(signals, rules) {
  const rule = rules.find((r) => r.all.every((cond) => holds(cond, signals)));
  if (!rule) return { flow: null, matched: [], reason: 'không luật nào khớp — chọn tay bằng --flow' };
  if (rule.needsCampaign !== false && !signals.campaignDir) {
    return { flow: null, matched: rule.all, reason: `khớp ${rule.flow} nhưng thiếu campaignDir (state.issues.${signals.key}.paths) — chọn tay bằng --flow --campaign` };
  }
  return { flow: rule.flow, matched: rule.all, reason: `${rule.flow}: ${rule.all.join(' · ')}` };
}
