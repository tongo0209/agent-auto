// Quét HTML/Twig thành danh sách phần tử: tag, class, id, thuộc tính, dòng, cha, nhánh {% if %}.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const TAG_OR_TWIG_BRANCH = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|{%-?\s*(if|elseif|else|endif)\b[\s\S]*?%}/g;
const ATTR = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
// Nội dung không thành phần tử DOM: <template> trơ, <noscript> là chữ khi trình duyệt bật JS.
const RAW_TEXT = /(<(script|style|template|noscript)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi;
const COMMENTS = [/<!--[\s\S]*?-->/g, /{#[\s\S]*?#}/g];

const blank = (text) => text.replace(/[^\n]/g, ' ');

export function scanHtml(text) {
  const withoutRawText = text.replace(RAW_TEXT, (_, open, _tag, body, close) => open + blank(body) + close);
  const source = COMMENTS.reduce((t, re) => t.replace(re, blank), withoutRawText);
  const elements = [];
  const open = [];
  const branches = [];
  let ifCount = 0;
  let anyCount = 0;
  let line = 1;
  let scanned = 0;
  for (const m of source.matchAll(TAG_OR_TWIG_BRANCH)) {
    for (; scanned < m.index; scanned++) if (source.charCodeAt(scanned) === 10) line++;
    const [, closing, name, attrText, twig] = m;
    if (twig === 'if') branches.push({ id: ++ifCount, arm: 0, depth: open.length });
    else if (twig === 'endif') branches.pop();
    else if (twig && branches.length) {
      // Nhánh mới của {% if %}: thẻ mở dở ở nhánh trước không là cha nhánh này.
      const branch = branches.at(-1);
      branch.arm++;
      open.length = branch.depth;
    }
    if (twig) continue;
    const tag = name.toLowerCase();
    if (closing) {
      const at = open.findLastIndex((i) => elements[i].tag === tag);
      if (at >= 0) open.length = at;
      continue;
    }
    if (tag === 'any') anyCount++;
    const attrs = new Map([...attrText.matchAll(ATTR)].map(([, key, dq, sq, bare]) => [key.toLowerCase(), dq ?? sq ?? bare ?? '']));
    elements.push({
      tag,
      classes: (attrs.get('class') || '').split(/\s+/).filter(Boolean),
      id: attrs.get('id') || '',
      attrs,
      line,
      parent: open.at(-1) ?? -1,
      branch: branches.map((b) => `${b.id}:${b.arm}`).join('/'),
    });
    if (!VOID.has(tag) && !attrText.trimEnd().endsWith('/')) open.push(elements.length - 1);
  }
  return { elements, anyCount };
}

export function* ancestorsOf(elements, index) {
  for (let p = elements[index].parent; p >= 0; p = elements[p].parent) yield p;
}

export function tokensOf(el) {
  return [...el.classes, ...(el.id ? [el.id] : []), ...[...el.attrs.keys()].filter((a) => a.startsWith('data-'))];
}

export const isPattern = (token) => token.endsWith('-N') || token.includes('*');

// `pm__group-N` / `pm__remain-*` / `pm__text_*` trong kit là mẫu: N, * = giá trị thật của campaign.
export function matcherFor(token) {
  if (!isPattern(token)) return (t) => t === token;
  const re = new RegExp(`^${token.replace(/-N$/, '-\\w+').replace(/\*/g, '[\\w-]+')}$`);
  return (t) => re.test(t);
}
