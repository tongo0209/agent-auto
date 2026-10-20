import fs from 'node:fs';
import path from 'node:path';

const HANDOFF_REPO = 'gt-promotion-template';
const SHEET_INPUT = /docs\.google\.com\/spreadsheets|sharepoint\.com|\.xlsx(\?|$)/i;
const RAW_DESIGN = /\.(psd|psb)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).map(String);
}

export function gatherSignals({ input, agentRoot, campaign }) {
  const key = /^[A-Z]+-\d+$/.test(input) ? input : null;
  const state = readJson(path.join(agentRoot, 'state.json'));
  const repos = readJson(path.join(agentRoot, 'config.json')).repos ?? {};
  const issue = state.issues?.[key] ?? {};
  const parent = state.issues?.[issue.parent] ?? {};
  const paths = issue.paths?.length ? issue.paths : parent.paths ?? [];
  const bugSheets = issue.bugSheets?.length ? issue.bugSheets : parent.bugSheets ?? [];
  const inputIsSheet = SHEET_INPUT.test(input);

  const clone = issue.cloneFrom?.find((c) => repos[c.repo]);
  const cloneSourceDir = clone ? path.join(repos[clone.repo], clone.from) : null;
  const known = [...paths, ...(clone ? [{ repo: clone.repo, path: clone.to }] : [])].filter((p) => repos[p.repo]);
  const target = known.find((p) => p.repo !== HANDOFF_REPO);
  const handoff = known.find((p) => p.repo === HANDOFF_REPO);
  const repo = campaign ? Object.values(repos).find((r) => campaign.startsWith(r)) ?? null : target ? repos[target.repo] : null;
  const campaignDir = campaign ?? (target ? path.join(repos[target.repo], target.path) : null);

  const designDir = key ? path.join(agentRoot, 'designs', key) : null;
  const designFiles = designDir ? listFiles(designDir) : [];
  const briefText = key ? readText(path.join(agentRoot, 'tasks', key, 'brief.md')) : '';
  const hasRawDesign = designFiles.some((f) => RAW_DESIGN.test(f)) || /figma\.com\/(design|file)\//.test(briefText);

  return {
    key,
    input,
    inputIsSheet,
    parentKey: issue.parent ?? null,
    hasBugSheet: inputIsSheet || bugSheets.length > 0,
    phase: issue.phase ?? null,
    repo,
    campaignDir,
    campaignExists: Boolean(campaignDir && fs.existsSync(campaignDir)),
    cloneSource: cloneSourceDir ?? issue.cloneRef ?? null,
    cloneSourceDir: cloneSourceDir && fs.existsSync(cloneSourceDir) ? cloneSourceDir : null,
    handoffDir: handoff ? path.join(repos[handoff.repo], handoff.path) : null,
    repos: [...new Set([target, ...known].filter(Boolean).map((p) => repos[p.repo]))],
    designDir,
    hasRawDesign,
    hasDesign: hasRawDesign || designFiles.some((f) => IMAGE.test(f)),
    hasCutAssets: designFiles.some((f) => f.split(path.sep).includes('_auto-export')),
    briefText: briefText.trim(),
  };
}
