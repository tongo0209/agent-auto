import fs from 'node:fs';
import path from 'node:path';
import { campaignOf, readLock } from '../project-lock.mjs';

const HANDOFF_REPO = 'gt-promotion-template';
const MAX_LANES = 5;
const LIVE_SITE = /(^|\/)(skin-[^/]+|[^/]+-mainsite)$/;
const RENEW = /-renew$/;
const IDLE_PHASES = ['wait-test', 'done-fe', 'closed', 'reassigned'];
const ASSIGNEE_UNCLEAR = /Người làm chính:|HTML ghi [A-ZĐ]/;
const SHEET_INPUT = /docs\.google\.com\/spreadsheets|sharepoint\.com|\.xlsx(\?|$)/i;
const GOOGLE_SHEET = /docs\.google\.com\/spreadsheets/i;
const NO_BUG_ID_NOTE = /không có cột BugID/i;
const DESIGN_DOWNLOADED = /^đã-giao-(đã-tải|tải-một-phần)$/;
const GAMEPLAY_CHANGE_NOTE = /đổi cơ chế|đổi gameplay/i;
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
  const sheetUrl = inputIsSheet ? input : bugSheets[0] ?? null;
  // radar đã poll mà không ra dòng nào = sheet không có cột BugID để đọc
  const watch = Object.values(state.bugWatch ?? {}).find((w) => sheetUrl?.startsWith(w.url));
  const radarBlind = Boolean(watch?.lastPollAt && Object.keys(watch.seenBugs ?? {}).length === 0);

  const clone = issue.cloneFrom?.find((c) => repos[c.repo]);
  const cloneSourceDir = clone ? path.join(repos[clone.repo], clone.from) : null;
  const known = [...paths, ...(clone ? [{ repo: clone.repo, path: clone.to }] : [])].filter((p) => repos[p.repo]);
  const code = known.filter((p) => p.repo !== HANDOFF_REPO);
  const target = code[0];
  const campaignDirs = campaign ? [campaign] : code.map((p) => path.join(repos[p.repo], p.path));
  const handoff = known.find((p) => p.repo === HANDOFF_REPO);
  const repo = campaign ? Object.values(repos).find((r) => campaign.startsWith(r)) ?? null : target ? repos[target.repo] : null;
  const campaignDir = campaign ?? (target ? path.join(repos[target.repo], target.path) : null);

  const project = campaignDir ? campaignOf(campaignDir) : null;
  const lock = project ? readLock(path.join(agentRoot, 'projects', project.game, `${project.slug}.md`)) : null;

  const designDir = key ? path.join(agentRoot, 'designs', key) : null;
  const designFiles = designDir ? listFiles(designDir) : [];
  const briefText = key ? readText(path.join(agentRoot, 'tasks', key, 'brief.md')) : '';
  const hasRawDesign = designFiles.some((f) => RAW_DESIGN.test(f)) || /figma\.com\/(design|file)\//.test(briefText);

  return {
    key,
    input,
    inputIsSheet,
    parentKey: issue.parent ?? null,
    hasBugSheet: Boolean(sheetUrl),
    sheetKind: sheetUrl ? (GOOGLE_SHEET.test(sheetUrl) ? 'google' : 'excel') : null,
    sheetNoBugId: NO_BUG_ID_NOTE.test(issue.note ?? '') || radarBlind,
    phase: issue.phase ?? null,
    idlePhase: IDLE_PHASES.includes(issue.phase),
    assigneeUnclear: ASSIGNEE_UNCLEAR.test(issue.note ?? ''),
    repo,
    campaignDir,
    campaignExists: Boolean(campaignDir && fs.existsSync(campaignDir)),
    cloneSource: cloneSourceDir ?? issue.cloneRef ?? null,
    cloneSourceDir: cloneSourceDir && fs.existsSync(cloneSourceDir) ? cloneSourceDir : null,
    campaignDirs,
    campaignCount: campaignDirs.length,
    tooManyCampaigns: campaignDirs.length > MAX_LANES,
    siteClone: known.some((p) => p.repo === 'vportal2view' && p.path.includes('-clone')),
    partnerSource: campaignDirs.some((d) => fs.existsSync(path.join(d, 'pc')) && fs.existsSync(path.join(d, 'mobile', 'dist'))),
    tooling: campaignDirs.some((d) => d.includes(`${path.sep}tontagent`)),
    liveSkin: campaignDirs.some((d) => LIVE_SITE.test(d) && !RENEW.test(d)),
    pathsUnconfirmed: issue.pathsConfirmed === false,
    handoffDir: handoff ? path.join(repos[handoff.repo], handoff.path) : null,
    repos: [...new Set([target, ...known].filter(Boolean).map((p) => repos[p.repo]))],
    designDir,
    hasRawDesign,
    gameplayLocked: Boolean(lock || issue.gameplay),
    gameplayOk: Boolean(lock || issue.gameplay || !project),
    gameplayChanged: GAMEPLAY_CHANGE_NOTE.test(issue.note ?? '') || Boolean(lock && issue.gameplay && issue.gameplay !== lock.gameplay),
    designLinkPending: Boolean(issue.designLink) && !DESIGN_DOWNLOADED.test(issue.design?.status ?? ''),
    hasDesign: hasRawDesign || designFiles.some((f) => IMAGE.test(f)),
    hasCutAssets: designFiles.some((f) => f.split(path.sep).includes('_auto-export')),
    briefText: briefText.trim(),
  };
}
