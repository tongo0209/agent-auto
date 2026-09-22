// Luật của pm-gate: mỗi mã PG-* một hàm, soi phần tử đã quét theo hợp đồng từ contract.mjs.
import { ancestorsOf, tokensOf, matcherFor, isPattern } from './scan.mjs';

export const WARN_CODES = new Set(['PG-TEXT', 'PG-MODULE', 'PG-UNKNOWN']);
export const MODULE_MARKER = 'pm__module';
export const POPUP_ID = /^popup/;
export const FIELD_TAGS = new Set(['input', 'select', 'textarea']);
const LUCKY = 'luckydraw-gift-exchange';
const PAYMENT = 'payment';
const CLAIM_DASH = 'pm__btn-claim';
const CLAIM_UNDERSCORE = 'pm__btn_claim';
const PAYMENT_CONFIRM = 'pm__popup-confirm';
const MIN_TYPO_LENGTH = 6;
// Chỉ id ghép (sso-login-form) mới soi gõ nhầm; id 1 từ (Email) để PG-INPUT giữ.
const COMPOUND_ID = /[-_]/;
// popup_reward2 / popup_reward_2: popup thứ 2 cùng loại (14 campaign production), không phải gõ nhầm popup_reward.
const NUMBERED = /^(.+?)[-_]?\d+$/;

function elementsWith(els, token) {
  const match = matcherFor(token);
  return els.flatMap((el, i) => (tokensOf(el).some(match) ? [i] : []));
}

function popupOf(els, index, openers) {
  return [index, ...ancestorsOf(els, index)].find((i) => POPUP_ID.test(els[i].id) || els[i].classes.some((c) => openers.has(c))) ?? -1;
}

// Hook là id (form-profile) chỉ tính phần tử mang id đó — class trùng tên là CSS riêng, JS dò #id.
function carriersOf(els, token, idHooks) {
  return idHooks.has(token) ? els.flatMap((el, i) => (el.id === token ? [i] : [])) : elementsWith(els, token);
}

export function placementViolations(els, token, placement, openers, idHooks = new Set()) {
  const found = carriersOf(els, token, idHooks);
  const carriesContainer = (i) => placement.containers.some((c) => tokensOf(els[i]).some(matcherFor(c)));
  if (placement.type === 'outside-popup') return found.filter((i) => popupOf(els, i, openers) >= 0);
  if (placement.type === 'inside') return found.filter((i) => ![i, ...ancestorsOf(els, i)].some(carriesContainer));
  if (placement.type === 'contains') return found.filter((i) => !els.some((_, j) => carriesContainer(j) && [...ancestorsOf(els, j)].includes(i)));
  return [];
}

// elsewhere = token của các trang cùng bộ (--page): hook bắt buộc chỉ cần có ở một trang.
// hasBody = file là gốc cây DOM (tổ tiên mọi hook ở đây); fullDocument = thêm cả mọi hook của trang ở đây.
export function runChecks(scan, contract, { fullDocument, hasBody, h5 = false, elsewhere = [] }) {
  const findings = [];
  const ctx = { els: scan.elements, anyCount: scan.anyCount, contract, fullDocument, hasBody, h5, elsewhere, explained: new Set() };
  ctx.add = (code, token, msg, indexes = []) => findings.push({ code, msg, token, lines: indexes.map((i) => scan.elements[i].line) });
  for (const check of CHECKS) check(ctx);
  return findings;
}

function collect(els, pick) {
  const byToken = new Map();
  els.forEach((el, i) => pick(el, i).forEach((t) => byToken.set(t, [...(byToken.get(t) || []), i])));
  return byToken;
}

// Mỗi {% if %} chỉ render 1 nhánh: lấy nhánh nhiều phần tử nhất, cộng các khối if đứng cạnh nhau.
function maxRenderedTogether(els, indexes, depth = 0) {
  let count = 0;
  const armsByIf = new Map();
  for (const i of indexes) {
    const step = els[i].branch.split('/').filter(Boolean)[depth];
    if (!step) {
      count++;
      continue;
    }
    const [ifId, arm] = step.split(':');
    const arms = armsByIf.get(ifId) || new Map();
    arms.set(arm, [...(arms.get(arm) || []), i]);
    armsByIf.set(ifId, arms);
  }
  for (const arms of armsByIf.values()) count += Math.max(...[...arms.values()].map((inArm) => maxRenderedTogether(els, inArm, depth + 1)));
  return count;
}

function oneEditApart(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const restEqual = (x, y) => a.slice(x) === b.slice(y);
  const swapped = a[i] === b[i + 1] && a[i + 1] === b[i] && restEqual(i + 2, i + 2);
  return restEqual(i + 1, i + 1) || restEqual(i + 1, i) || restEqual(i, i + 1) || swapped;
}

function looselyEqual(a, b) {
  const normal = (t) => t.toLowerCase().replaceAll('-', '_');
  return a !== b && (normal(a) === normal(b) || (a.length >= MIN_TYPO_LENGTH && oneEditApart(a, b)));
}

function checkAny({ els, anyCount, add }) {
  if (anyCount) add('PG-ANY', 'any', `còn ${anyCount} thẻ <any> chưa thay bằng tag thật`, els.flatMap((el, i) => (el.tag === 'any' ? [i] : [])));
}

function checkOverrides({ els, contract, add, explained }) {
  for (const [kit, production] of contract.aliases) {
    const found = elementsWith(els, kit);
    if (!found.length) continue;
    add('PG-OVR', kit, `\`${kit}\` là tên trong kit — production dùng \`${production}\` (rules/pm-kit-overrides.tsv)`, found);
    explained.add(kit).add(production);
  }
}

function checkClaim({ els, contract, add, explained }) {
  const inConfirm = (i) => [i, ...ancestorsOf(els, i)].some((a) => els[a].classes.includes(PAYMENT_CONFIRM));
  const report = (token, found, msg) => {
    if (!found.length) return;
    add('PG-CLAIM', token, msg, found);
    explained.add(token);
  };
  if (contract.gameplay === LUCKY) {
    report(CLAIM_UNDERSCORE, elementsWith(els, CLAIM_UNDERSCORE), 'Lucky Draw dùng `pm__btn-claim` (gạch NGANG) — `pm__btn_claim` là của Payment');
  }
  if (contract.gameplay === PAYMENT) {
    report(CLAIM_DASH, elementsWith(els, CLAIM_DASH).filter((i) => !inConfirm(i)), 'khu chính Payment dùng `pm__btn_claim` (gạch DƯỚI) — gạch ngang chỉ trong `pm__popup-confirm`');
    report(CLAIM_UNDERSCORE, elementsWith(els, CLAIM_UNDERSCORE).filter(inConfirm), 'nút trong `pm__popup-confirm` của Payment dùng `pm__btn-claim` (gạch NGANG)');
  }
}

function checkForeign({ els, contract, add, explained }) {
  const isForeign = (t) => contract.foreign.has(t) && t !== CLAIM_DASH && t !== CLAIM_UNDERSCORE;
  for (const [token, found] of collect(els, (el) => tokensOf(el).filter(isForeign))) {
    add('PG-GAME', token, `\`${token}\` là hook của gameplay kia — cấm trộn 2 gameplay (AI-GUIDE §4)`, found);
    explained.add(token);
  }
}

function checkDont({ els, contract, add, explained }) {
  for (const { classes, hint } of contract.dont) {
    const found = els.flatMap((el, i) => (classes.every((c) => el.classes.includes(c)) ? [i] : []));
    if (!found.length) continue;
    add('PG-DONT', classes.join(' + '), `\`${classes.join(' + ')}\` — ${hint}`, found);
    classes.forEach((c) => explained.add(c));
  }
}

function checkFormIds({ els, contract, add, explained }) {
  for (const id of contract.idHooks) {
    const usedAsClass = els.flatMap((el, i) => (el.classes.includes(id) ? [i] : []));
    if (!usedAsClass.length || els.some((el) => el.id === id)) continue;
    add('PG-FORM', id, `\`${id}\` là id — JS tìm theo #${id}, đổi sang class là mất (§3.3)`, usedAsClass);
    explained.add(id);
  }
}

function checkNames({ els, contract, add, explained }) {
  const isHookElement = (el) => el.classes.some((c) => c.startsWith('pm__')) || contract.known.has(el.id);
  const candidates = collect(els, (el) => [
    ...el.classes.filter((c) => c.startsWith('pm__')),
    ...(POPUP_ID.test(el.id) || COMPOUND_ID.test(el.id) ? [el.id] : []),
    ...(isHookElement(el) ? [...el.attrs.keys()].filter((a) => a.startsWith('data-')) : []),
  ]);
  for (const [token, found] of candidates) {
    if (contract.known.has(token) || explained.has(token)) continue;
    const numberedPopup = POPUP_ID.test(token) && contract.known.has(token.match(NUMBERED)?.[1]);
    const near = !numberedPopup && [...contract.known].find((k) => !contract.retired.has(k) && looselyEqual(token, k));
    if (near) {
      add('PG-TYPO', token, `\`${token}\` gần trùng \`${near}\` — lệch 1 ký tự / gạch / hoa-thường là nút chết`, found);
      explained.add(near);
      continue;
    }
    const looksLikeHook = token.startsWith('pm__') || token.startsWith('data-') || POPUP_ID.test(token);
    if (looksLikeHook && !contract.patterns.some((match) => match(token))) {
      add('PG-UNKNOWN', token, `hook lạ \`${token}\` — không có trong MASTER/AI-RULES/override; production có thể dùng, kiểm lại`, found);
    }
  }
}

function checkRequired({ els, contract, fullDocument, h5, elsewhere, add, explained }) {
  if (!fullDocument) return;
  const present = (t) => explained.has(t) || elementsWith(els, t).length > 0 || elsewhere.some(matcherFor(t));
  for (const { tokens, when, webOnly } of contract.required) {
    if ((webOnly && h5) || (when && !present(when)) || tokens.some(present)) continue;
    const msg = tokens.length > 1 ? `thiếu hook bắt buộc — cần ít nhất 1 trong \`${tokens.join('` `')}\`` : `thiếu hook bắt buộc \`${tokens[0]}\``;
    add('PG-REQ', tokens.join(' / '), msg);
  }
}

function checkOnce({ els, contract, add }) {
  const listedElsewhere = (c) => contract.repeatable.includes(c) || contract.perPopup.includes(c);
  const singletons = new Set(contract.singletons.filter((t) => !isPattern(t)));
  for (const wildcard of contract.singletons.filter(isPattern)) {
    const match = matcherFor(wildcard);
    els.flatMap((el) => el.classes).filter((c) => match(c) && !listedElsewhere(c)).forEach((c) => singletons.add(c));
  }
  for (const token of singletons) {
    const found = carriersOf(els, token, contract.idHooks);
    const count = maxRenderedTogether(els, found);
    if (count > 1) add('PG-ONCE', token, `\`${token}\` là SINGLETON nhưng có ${count} phần tử`, found);
  }
  for (const token of contract.perPopup) {
    const byPopup = collect(els, (el, i) => (el.classes.includes(token) ? [popupOf(els, i, contract.openers)] : []));
    byPopup.delete(-1); // -1 = ngoài mọi popup: [1/popup] không áp
    for (const found of byPopup.values()) {
      const count = maxRenderedTogether(els, found);
      if (count > 1) add('PG-ONCE', token, `\`${token}\` chỉ 1 lần mỗi popup — có ${count} trong cùng popup`, found);
    }
  }
}

function checkNesting({ els, contract, hasBody, add, explained }) {
  const where = { 'outside-popup': () => 'phải nằm NGOÀI mọi popup', inside: (c) => `phải nằm trong \`${c}\``, contains: (c) => `phải là cha của \`${c}\`` };
  // Partial (chưa có <body>) thiếu container thì container ở file cha — không phán.
  const containerAbsent = ({ containers }) => !containers.some((c) => elementsWith(els, c).length);
  for (const { token, placement } of contract.nest) {
    if (explained.has(token) || (!hasBody && placement.containers.length && containerAbsent(placement))) continue;
    const misplaced = placementViolations(els, token, placement, contract.openers, contract.idHooks);
    if (misplaced.length) add('PG-NEST', token, `\`${token}\` ${where[placement.type](placement.containers.join('` / `'))}`, misplaced);
  }
}

function checkOpen({ els, contract, add }) {
  const insidePopup = (i) => !POPUP_ID.test(els[i].id) && [...ancestorsOf(els, i)].some((a) => POPUP_ID.test(els[a].id));
  for (const [cls, found] of collect(els, (el) => el.classes.filter((c) => contract.openers.has(c)))) {
    const onChild = found.filter(insidePopup);
    if (onChild.length) add('PG-OPEN', cls, `class module \`${cls}\` phải ở thẻ MỞ popup (thẻ mang id popup), không ở thẻ con (§3.1)`, onChild);
  }
}

function checkInputs({ els, contract, add }) {
  const scopeOf = (id) => els.flatMap((el, i) => (el.id === id ? [i] : []));
  const inside = (i, scope) => [i, ...ancestorsOf(els, i)].some((a) => scope.includes(a));
  const typeOf = (el) => el.attrs.get('type') || (el.tag === 'input' ? 'text' : '');
  for (const field of contract.inputs) {
    const scope = scopeOf(field.scope);
    if (!scope.length) continue;
    const fields = els.flatMap((el, i) => (FIELD_TAGS.has(el.tag) && inside(i, scope) ? [i] : []));
    const named = fields.filter((i) => els[i].attrs.get('name') === field.name);
    if (!named.length) {
      const renamed = fields.filter((i) => looselyEqual(els[i].attrs.get('name') || '', field.name));
      if (renamed.length) add('PG-INPUT', field.name, `#${field.scope}: name phải giữ nguyên "${field.name}" — backend đọc theo đó`, renamed);
      continue;
    }
    const input = named.find((i) => els[i].id === field.id) ?? named[0];
    if (field.id && els[input].id !== field.id) add('PG-INPUT', field.name, `ô name="${field.name}" phải giữ id="${field.id}"`, [input]);
    if (field.type && typeOf(els[input]) !== field.type) add('PG-INPUT', field.name, `ô name="${field.name}" phải giữ type="${field.type}"`, [input]);
  }
  for (const label of contract.labels) {
    if (scopeOf(label.scope).length && !els.some((el) => el.attrs.get('for') === label.for)) {
      add('PG-INPUT', label.for, `#${label.scope} mất label for="${label.for}"`, scopeOf(label.scope));
    }
  }
}

function checkPairs({ els, contract, add }) {
  const missingPartners = (el) => [...el.classes, el.id].filter(Boolean).flatMap((hook) => (contract.pairs.get(hook) || [])
    .filter((p) => !el.classes.includes(p) && !el.attrs.has(p))
    .map((p) => `${hook}|${p}`));
  for (const [pair, found] of collect(els, missingPartners)) {
    const [hook, partner] = pair.split('|');
    add('PG-PAIR', hook, `\`${hook}\` phải đi kèm \`${partner}\` trên cùng thẻ`, found);
  }
  // MASTER để data-milestone="" chờ điền; production không trang nào để trống data-* của hook pm__.
  const emptyData = (el) => el.classes.filter((c) => c.startsWith('pm__')).flatMap((hook) => (contract.pairs.get(hook) || [])
    .filter((p) => p.startsWith('data-') && el.attrs.get(p) === '')
    .map((p) => `${hook}|${p}`));
  for (const [pair, found] of collect(els, emptyData)) {
    const [hook, partner] = pair.split('|');
    add('PG-PAIR', hook, `\`${hook}\` có \`${partner}\` rỗng — điền giá trị thật của campaign`, found);
  }
  for (const row of contract.catalog.filter((r) => r.sameAs)) {
    const alone = elementsWith(els, row.sameAs).filter((i) => !row.tokens.some((t) => els[i].classes.includes(t)));
    if (alone.length) add('PG-PAIR', row.sameAs, `\`${row.sameAs}\` phải đi cùng 1 class: \`${row.tokens.join('` `')}\``, alone);
  }
}

function checkTextLeaf({ els, contract, add }) {
  const parents = new Set(els.map((el) => el.parent));
  for (const token of contract.textLeaf) {
    const wrapping = elementsWith(els, token).filter((i) => parents.has(i));
    if (wrapping.length) add('PG-TEXT', token, `\`${token}\` phải ở element con cuối chứa text trực tiếp, không ở thẻ bọc (§3.2)`, wrapping);
  }
}

function checkModuleWith({ els, contract, add }) {
  for (const module of contract.moduleWith) {
    const alone = elementsWith(els, module).filter((i) => !els[i].classes.includes(MODULE_MARKER));
    if (alone.length) add('PG-MODULE', module, `\`${module}\` luôn kèm \`pm__module\` trên cùng thẻ (§3.4)`, alone);
  }
}

function checkRef({ els, contract, fullDocument, h5, elsewhere, add }) {
  if (contract.gameplay !== 'none' || !fullDocument) return;
  contract.refHooks.filter((h) => !elementsWith(els, h).length && !elsewhere.includes(h) && !(h5 && contract.h5Exempt.has(h)))
    .forEach((h) => add('PG-REF', h, `ref có \`${h}\` mà file thiếu — landing ngoài kit bám hợp đồng của ref`));
}

// Thứ tự có nghĩa: lỗi gốc ghi explained trước để PG-REQ/PG-UNKNOWN không báo trùng.
const CHECKS = [checkAny, checkOverrides, checkClaim, checkForeign, checkDont, checkFormIds, checkNames, checkRequired,
  checkOnce, checkNesting, checkOpen, checkInputs, checkPairs, checkTextLeaf, checkModuleWith, checkRef];
