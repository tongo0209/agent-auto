// Hợp đồng pm__ của 1 gameplay: AI-RULES + MASTER của ai-template-kit, đã áp override production.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scanHtml, ancestorsOf, tokensOf, isPattern, matcherFor } from './scan.mjs';
import { placementViolations, MODULE_MARKER, POPUP_ID, FIELD_TAGS } from './checks.mjs';

export const GAMEPLAYS = ['luckydraw-gift-exchange', 'payment', 'none'];
const KIT_GAMEPLAYS = GAMEPLAYS.filter((g) => g !== 'none');
const HOOK_TOKEN = /^[\w-]+\*?$/;
const REF_SKIP_DIRS = new Set(['node_modules', 'dist', 'html-pro', 'optimized', '.git']);
const PLACEHOLDER_HINT = 'mẫu của kit — thay N / * bằng giá trị thật (vd pm__group-1)';

const rulesPath = (kitDir, g) => join(kitDir, 'gameplays', g, `AI-RULES-${g}.md`);
const masterPath = (kitDir, g) => join(kitDir, 'gameplays', g, `MASTER-${g}.html`);

export function kitFileFor(kitDir, gameplay) {
  return gameplay === 'none' ? join(kitDir, 'components', 'common', 'popups') : rulesPath(kitDir, gameplay);
}

export function loadContract(gameplay, { kitDir, overridesPath, refDir }) {
  const overrides = readOverrides(overridesPath, gameplay);
  const aliases = overrides.alias;
  const read = (path) => applyAliases(readFileSync(path, 'utf8'), aliases);
  const rules = gameplay === 'none' ? '' : read(rulesPath(kitDir, gameplay));
  const master = scanHtml(gameplay === 'none' ? commonPopups(kitDir, read) : read(masterPath(kitDir, gameplay))).elements;

  const catalog = withProductionSiblings(parseCatalog(rules), overrides.allow);
  const dropped = new Set(overrides.drop.filter(([kit, production]) => production === '-' && !kit.includes('@')).map(([kit]) => kit));
  const allowed = (aspect) => new Set(overrides.allow.filter(([, production]) => production === aspect).map(([kit]) => kit));
  const alternatives = overrides.anyof.flatMap(([kit]) => kit.split(/\s+/));
  const h5Tokens = new Set(overrides.drop.filter(([, production]) => production === 'h5').map(([kit]) => kit));
  const sharedHooks = new Set([...allowed('gameplay'), ...alternatives]);

  // Popup dùng chung cho cả 2 gameplay → khối lặp lấy từ AI-RULES của cả hai.
  const lists = gameplay === 'none'
    ? {
      singletons: master.map((el) => el.id).filter(Boolean),
      repeatable: [...new Set(KIT_GAMEPLAYS.flatMap((g) => parseSingletonLists(read(rulesPath(kitDir, g))).repeatable))],
      perPopup: [],
    }
    : parseSingletonLists(rules);
  const bareJs = backticked(rules.split('\n').find((l) => l.includes('Class/id "trần"')) || '');
  const openers = new Set([
    ...catalog.filter((row) => row.opener).flatMap((row) => row.tokens),
    ...master.filter((el) => POPUP_ID.test(el.id)).flatMap((el) => [el.id, ...el.classes]),
  ].filter((t) => t !== MODULE_MARKER));
  const platformPopups = new Set(KIT_GAMEPLAYS.flatMap((g) => scanHtml(read(masterPath(kitDir, g))).elements.map((el) => el.id))
    .concat(master.map((el) => el.id), alternatives).filter((id) => POPUP_ID.test(id)));
  const refHooks = refDir ? hooksOfRef(refDir, platformPopups) : [];
  const vocabulary = [
    ...master.flatMap(tokensOf), ...catalog.flatMap((row) => row.tokens), ...lists.singletons, ...lists.repeatable, ...lists.perPopup,
    ...bareJs, ...overrides.fix.map(([kit]) => kit.split('@')[0]), ...sharedHooks, ...refHooks,
  ];
  const kitCatalogs = gameplay === 'none'
    ? KIT_GAMEPLAYS.flatMap((g) => withProductionSiblings(parseCatalog(read(rulesPath(kitDir, g))), overrides.allow))
    : catalog;
  const idHooks = new Set([...master.map((el) => el.id).filter(Boolean), ...catalog.filter((row) => row.kind === 'id').flatMap((row) => row.tokens)]);

  return {
    gameplay,
    catalog,
    ...lists,
    singletons: lists.singletons.filter((t) => !allowed('repeat').has(t)),
    required: requiredGroups(catalog, dropped, h5Tokens, overrides),
    dont: parseDont(rules, catalog),
    textLeaf: backticked(between(rules, '### 3.2.', '```')),
    moduleWith: tableRows(between(rules, '### 3.4.', '\n## 4.')).filter((cells) => cells[2].includes('luôn kèm')).flatMap((cells) => backticked(cells[1])),
    nest: withProductionPlacements(nestRules(catalog, master, openers, dropped, idHooks), overrides.allow),
    ...masterFields(master, lists.repeatable, dropped),
    pairs: withoutDroppedPairs(masterPairs(master, bareJs), overrides.drop),
    openers,
    idHooks,
    retired: dropped,
    foreign: gameplay === 'none'
      ? new Set()
      : new Set([...foreignHooks(rules, master, scanHtml(read(masterPath(kitDir, KIT_GAMEPLAYS.find((g) => g !== gameplay)))).elements)].filter((t) => !sharedHooks.has(t))),
    aliases,
    known: new Set(vocabulary.filter((t) => !isPattern(t))),
    patterns: [...new Set(vocabulary.filter(isPattern))].map(matcherFor),
    refHooks,
    // Trang H5 được miễn cả dòng catalog chứa token drop/h5 (popup_login kéo theo pm__login-module).
    h5Exempt: new Set(kitCatalogs.filter((row) => row.tokens.some((t) => h5Tokens.has(t))).flatMap((row) => row.tokens)),
  };
}

// Cột kind của pm-kit-overrides.tsv → { alias: [[kit, production]], drop: …, when: …, anyof: …, allow: …, fix: … }.
function readOverrides(path, gameplay) {
  const byKind = { alias: [], drop: [], when: [], anyof: [], allow: [], fix: [] };
  readFileSync(path, 'utf8').trim().split('\n').slice(1)
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split('\t'))
    .filter(([scope]) => scope === '*' || scope === gameplay)
    .forEach(([, kit, production, kind]) => {
      if (!byKind[kind]) throw new Error(`rules/pm-kit-overrides.tsv: kind lạ "${kind}" ở dòng ${kit} — dùng ${Object.keys(byKind).join('|')}`);
      byKind[kind].push([kit, production]);
    });
  return byKind;
}

// Mỗi nhóm = "cần ít nhất 1 token"; when = chỉ bắt khi trang có hook đó; webOnly = trang H5 được miễn.
function requiredGroups(catalog, dropped, h5Tokens, overrides) {
  let groups = catalog.filter((row) => row.required === 'yes' && !row.tokens.some((t) => dropped.has(t))).flatMap((row) => {
    const tokens = row.tokens.filter((t) => t !== MODULE_MARKER);
    // data-* sống trên thẻ chủ (data-value trên pm__rut): không có thẻ chủ thì không đòi.
    const host = row.kind === 'data' && row.placement.type === 'inside' ? row.placement.containers[0] : '';
    const sets = row.kind === 'mixed' || tokens.length === 1 ? tokens.map((t) => [t]) : [tokens];
    return sets.map((set) => ({ tokens: set, when: host, webOnly: row.tokens.some((t) => h5Tokens.has(t)) }));
  });
  for (const [token, when] of overrides.when) groups.filter((g) => g.tokens.includes(token)).forEach((g) => { g.when = when; });
  for (const [kit] of overrides.anyof) {
    const members = kit.split(/\s+/);
    const merged = groups.filter((g) => g.tokens.some((t) => members.includes(t)));
    groups = [...groups.filter((g) => !merged.includes(g)), { tokens: members, when: '', webOnly: merged.some((g) => g.webOnly) }];
  }
  return groups;
}

function applyAliases(text, aliases) {
  return aliases.reduce((t, [kit, production]) => t.replace(new RegExp(`\\b${kit}\\b`, 'g'), production), text);
}

function commonPopups(kitDir, read) {
  const dir = kitFileFor(kitDir, 'none');
  return readdirSync(dir).filter((n) => n.endsWith('.html')).map((n) => read(join(dir, n))).join('\n');
}

function between(text, from, to) {
  const start = text.indexOf(from);
  if (start < 0) return '';
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start + from.length, end < 0 ? undefined : end);
}

const tableRows = (section) => section.split('\n').filter((l) => l.startsWith('|')).map((l) => l.split('|').map((c) => c.trim()));

function backticked(text) {
  return [...text.matchAll(/`([^`]+)`/g)].flatMap(([, t]) => t.split(/\s+/)).map((t) => t.replace(/^#/, '')).filter((t) => HOOK_TOKEN.test(t));
}

// AI-RULES §2: Hook | Loại | Bắt buộc | Đặt vào | Phải nằm trong | Số lần | …
function parseCatalog(rules) {
  return tableRows(between(rules, '\n## 2.', '\n## 3.'))
    .filter((cells) => cells.length >= 9 && cells[1].startsWith('`'))
    .map(([, hook, type, required, element, inside]) => ({
      tokens: backticked(hook),
      kind: hook.includes('+') ? 'mixed' : type.split(/\s/)[0],
      pattern: type.includes('pattern'),
      required: required.includes('✅') ? 'yes' : required.includes('🔸') ? 'extra' : 'no',
      opener: element.includes('thẻ mở popup'),
      sameAs: element.match(/cùng thẻ `([^`]+)`/)?.[1] || '',
      placement: placementOf(inside),
    }));
}

function placementOf(cell) {
  if (cell.includes('ngoài popup')) return { type: 'outside-popup', containers: [] };
  const containers = backticked(cell);
  if (!containers.length) return { type: 'any', containers };
  return { type: cell.startsWith('cha của') ? 'contains' : 'inside', containers };
}

function parseSingletonLists(rules) {
  const lines = between(rules, '\n## 4.', '\n## 5.').split('\n');
  const tokensOnLine = (marker) => backticked(lines.find((l) => l.includes(marker)) || '');
  const repeatable = tokensOnLine('KHÔNG thuộc nhóm singleton');
  const perPopup = tokensOnLine('[1/popup]');
  const singletons = lines.filter((l) => l.startsWith('- [ ]'))
    .flatMap((l) => backticked(l.split(' — ')[0]))
    .filter((t) => !repeatable.includes(t) && !perPopup.includes(t));
  return { singletons, repeatable, perPopup };
}

function parseDont(rules, catalog) {
  const fromTable = tableRows(between(rules, '\n## 5.', '')).flatMap(([, bad = '', good = '']) => {
    const hint = good.replace(/[`*]/g, '');
    const invented = bad.match(/Tự thêm `([^`]+)`/);
    const combo = bad.match(/Thêm `([^`]+)` cho `([^`]+)`/);
    return [...(invented ? [{ classes: [invented[1]], hint }] : []), ...(combo ? [{ classes: [combo[1], combo[2]], hint }] : [])];
  });
  const placeholders = catalog.filter((row) => row.pattern).flatMap((row) => row.tokens).map((t) => ({ classes: [t], hint: PLACEHOLDER_HINT }));
  return [...fromTable, ...placeholders];
}

// MASTER thắng cột "Phải nằm trong" (pm__text_agree); data-* là attr chung, để PG-PAIR.
// Container production bỏ (mto-login-form) → hook con chỉ cần nằm trong container của nó (pm__login-module).
function nestRules(catalog, master, openers, dropped, idHooks) {
  const placementByToken = new Map(catalog.flatMap((row) => row.tokens.map((t) => [t, row.placement])));
  const lift = (placement) => ({
    ...placement,
    containers: placement.containers.flatMap((c) => (dropped.has(c) ? placementByToken.get(c)?.containers ?? [] : [c])),
  });
  return catalog
    .filter((row) => row.kind !== 'data')
    .flatMap((row) => (row.kind === 'mixed' ? row.tokens.slice(0, 1) : row.tokens).map((token) => ({ token, placement: lift(row.placement) })))
    .filter(({ placement }) => placement.type === 'outside-popup' || placement.containers.length)
    .filter(({ token, placement }) => placement.type !== 'any' && !placementViolations(master, token, placement, openers, idHooks).length);
}

function masterFields(master, repeatable, dropped) {
  const inputs = [];
  const labels = [];
  master.forEach((el, i) => {
    const up = [...ancestorsOf(master, i)];
    const scope = up.map((a) => master[a].id).find(Boolean);
    const insideRepeatedBlock = [i, ...up].some((a) => master[a].classes.some((c) => repeatable.includes(c)));
    if (!scope || insideRepeatedBlock) return;
    if (FIELD_TAGS.has(el.tag) && el.attrs.has('name')) inputs.push({ scope, name: el.attrs.get('name'), type: el.attrs.get('type') || '', id: dropped.has(el.id) ? '' : el.id });
    if (el.attrs.has('for')) labels.push({ scope, for: el.attrs.get('for') });
  });
  return { inputs, labels };
}

// Cặp = class/data-* có trên MỌI phần tử MASTER mang hook (pm__rut → data-value).
function masterPairs(master, bareJs) {
  const seen = new Map();
  for (const el of master) {
    const data = [...el.attrs.keys()].filter((a) => a.startsWith('data-'));
    const classes = el.classes.filter((c) => (c.startsWith('pm__') || bareJs.includes(c)) && c !== MODULE_MARKER);
    const hooks = [...el.classes.filter((c) => c.startsWith('pm__') && c !== MODULE_MARKER), ...(el.id ? [el.id] : [])];
    for (const hook of hooks) {
      const partners = hook.startsWith('pm__') ? [...classes, ...data].filter((p) => p !== hook) : [...classes.filter((c) => bareJs.includes(c)), ...data];
      seen.set(hook, [...(seen.get(hook) || []), partners]);
    }
  }
  return new Map([...seen]
    .map(([hook, lists]) => [hook, lists.reduce((common, list) => common.filter((p) => list.includes(p)))])
    .filter(([, common]) => common.length));
}

// allow like:<token>: hook production dùng như token kit cùng dòng catalog (pm__playnow ~ pm__zing).
function withProductionSiblings(catalog, allows) {
  for (const [kit, production] of allows.filter(([, p]) => p.startsWith('like:'))) {
    catalog.filter((row) => row.tokens.includes(production.slice(5))).forEach((row) => row.tokens.push(kit));
  }
  return catalog;
}

// allow popup: bỏ luật "ngoài popup"; allow in:<container>: thêm container production dùng.
function withProductionPlacements(rules, allows) {
  const insidePopupAllowed = new Set(allows.filter(([, production]) => production === 'popup').map(([kit]) => kit));
  const extraContainers = (token) => allows.filter(([kit, production]) => kit === token && production.startsWith('in:')).map(([, production]) => production.slice(3));
  return rules
    .filter(({ token, placement }) => !(placement.type === 'outside-popup' && insidePopupAllowed.has(token)))
    .map(({ token, placement }) => ({ token, placement: { ...placement, containers: [...placement.containers, ...extraContainers(token)] } }));
}

// Dòng drop `partner@hook`: production không đặt partner cạnh hook (pm__anchor@pm__login).
function withoutDroppedPairs(pairs, drops) {
  for (const [partner, hook] of drops.filter(([kit]) => kit.includes('@')).map(([kit]) => kit.split('@'))) {
    const rest = (pairs.get(hook) || []).filter((p) => p !== partner);
    if (rest.length) pairs.set(hook, rest);
    else pairs.delete(hook);
  }
  return pairs;
}

// AI-RULES tự liệt kê hook cấm mượn (payment §2d) thì dùng list đó, không thì diff MASTER.
function foreignHooks(rules, master, otherMaster) {
  const declared = backticked(rules.split('\n').find((l) => l.includes('KHÔNG có') && l.includes('các hook sau')) || '');
  const borrowedIds = [...rules.matchAll(/Dùng `id="([^"]+)"` như bản/g)].map(([, id]) => id);
  if (declared.length) return new Set([...declared, ...borrowedIds]);
  const hooks = (els) => new Set(els.flatMap((el) => [...el.classes.filter((c) => c.startsWith('pm__')), ...(el.id ? [el.id] : [])]));
  const own = hooks(master);
  return new Set([...hooks(otherMaster)].filter((t) => !own.has(t)));
}

// Ref đã build thì đọc dist/ (trang thật); source còn popup thư viện chưa include (libraryMainsite-t-popup/html/module).
// Popup riêng của ref (popup_chucmung) là UI tự do — chỉ id popup platform (kit + override) mới là hợp đồng.
function hooksOfRef(dir, platformPopups) {
  const built = join(dir, 'dist');
  const files = existsSync(built) ? pageFiles(built, new Set()).filter((f) => readFileSync(f, 'utf8').includes('pm__')) : [];
  const hooks = new Set();
  for (const path of files.length ? files : pageFiles(dir, REF_SKIP_DIRS)) {
    for (const el of scanHtml(readFileSync(path, 'utf8')).elements) {
      el.classes.filter((c) => c.startsWith('pm__') && HOOK_TOKEN.test(c)).forEach((c) => hooks.add(c));
      if (platformPopups.has(el.id)) hooks.add(el.id);
    }
  }
  return [...hooks];
}

function pageFiles(dir, skipDirs) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return skipDirs.has(entry.name) ? [] : pageFiles(path, skipDirs);
    return ['.html', '.twig'].includes(extname(entry.name)) ? [path] : [];
  });
}
