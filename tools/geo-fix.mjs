#!/usr/bin/env node
// geo-fix plan|diff|apply — so vị trí asset trong dist với coords.json rồi sửa left/top trong SCSS. Xem docs/specs/2026-09-15-ui-check-autofix-design.md
import fs from 'node:fs';
import path from 'node:path';

const MOBILE_MAX_WIDTH = 768;
const POSITION_PROPS = ['left', 'top', 'right', 'bottom'];
const UNIFORM_MIN_ASSETS = 4;
const UNIFORM_MIN_SHARE = 0.5;
const PARENT_SAME_DELTA_TOLERANCE = 1;

function parseArgs(argv) {
  const o = { coords: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'coords') o.coords.push(argv[i + 1]);
    else o[key] = argv[i + 1];
  }
  return o;
}

function listFiles(dir, exts) {
  const found = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (exts.includes(path.extname(ent.name))) found.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found;
}

function plan({ campaign, coords }) {
  const assetsDir = path.join(campaign, 'assets');
  const pngByName = {};
  for (const p of listFiles(assetsDir, ['.png', '.webp', '.jpg']))
    pngByName[path.basename(p)] ??= path.relative(campaign, p);
  const twig = listFiles(assetsDir, ['.twig', '.html']).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  const rules = listFiles(assetsDir, ['.scss'])
    .filter((p) => !p.endsWith('generated.scss'))
    .flatMap((p) => parseScss(fs.readFileSync(p, 'utf8'), path.relative(campaign, p)));

  const groups = coords.map((coordsFile) => {
    const { canvas, assets } = JSON.parse(fs.readFileSync(coordsFile, 'utf8'));
    const root = assets.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)).name;
    return { coords: coordsFile, canvas, viewport: canvas[0] <= MOBILE_MAX_WIDTH ? 'mb' : 'pc', root, assets: dropSharedRules(assets.map((a) => mapAsset(a, pngByName, twig, rules))) };
  });
  const unmapped = groups.flatMap((g) => g.assets.filter((a) => !a.selectors.length).map((a) => a.name));
  return { campaign: path.resolve(campaign), groups, unmapped };
}

function mapAsset(a, pngByName, twig, rules) {
  const png = pngByName[a.file] ?? Object.values(pngByName).find((p) => path.basename(p).endsWith('-' + a.file)) ?? null;
  const spriteVar = png ? path.basename(png).replace(/\.\w+$/, '') : null;
  const imgClasses = imgClassesFor(twig, a.file);
  const candidates = rules.filter((r) => (spriteVar && r.includes.includes(spriteVar)) || r.urls.includes(a.file) || imgClasses.some((c) => selectorTargets(r.selector, c)));
  const rule = candidates.find((r) => hasPosition(r.pc) || hasPosition(r.mb)) ?? candidates[0] ?? null;
  const selectors = [];
  if (spriteVar && twig.includes(`MS__sprite-${spriteVar}`)) selectors.push(`.MS__sprite-${spriteVar}`);
  if (rule) selectors.push(rule.selector);
  // dist đổi đuôi (png → optimized/….webp) nên so theo stem `/<tên>.`
  const stem = a.file.replace(/\.\w+$/, '');
  if (png || rule?.urls.includes(a.file)) selectors.push(`img[src*="/${stem}."],img[data-src*="/${stem}."]`);
  return { ...a, png, selectors, rule: rule && { file: rule.file, selector: rule.selector, pc: rule.pc, mb: rule.mb } };
}

const hasPosition = (decls) => POSITION_PROPS.some((p) => decls[p]);

// 1 rule mà ≥2 asset cùng nhận (4 <img class="mh-art">) → đo asset này bằng phần tử asset kia rồi sửa sai; gỡ rule, chỉ giữ selector img
function dropSharedRules(assets) {
  const owners = {};
  for (const a of assets) if (a.rule) (owners[`${a.rule.file}|${a.rule.selector}`] ??= []).push(a);
  for (const group of Object.values(owners)) {
    if (group.length < 2) continue;
    for (const a of group) {
      a.selectors = a.selectors.filter((sel) => sel !== a.rule.selector);
      a.rule = null;
    }
  }
  return assets;
}

function imgClassesFor(twig, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tags = twig.matchAll(new RegExp(`<img[^>]*(?:src|data-src)=["'][^"']*/${escaped}["'][^>]*>`, 'g'));
  return [...tags].flatMap((t) => (t[0].match(/class=["']([^"']+)["']/)?.[1] ?? '').split(/\s+/)).filter((c) => c && !/^M[SJ]__/.test(c));
}

// rule "nhắm" class khi compound cuối của selector có .class đó (`#a .b .badge`, `.badge.on` — không phải `.badge .x`)
const selectorTargets = (selector, cls) => selector.split(',').some((s) => new RegExp(`(^|[\\s>+~])[^\\s>+~]*\\.${cls}(?![\\w-])[^\\s>+~]*$`).test(s.trim()));

function parseScss(src, file) {
  const rules = [];
  const stack = [];
  let buf = '';
  let line = 1;
  let stmtLine = 0;
  const ruleFrame = () => [...stack].reverse().find((f) => f.kind === 'rule');
  const inMobile = () => stack.some((f) => f.kind === 'mobile');

  const flush = () => {
    const stmt = buf.trim();
    buf = '';
    const rule = ruleFrame();
    if (!stmt || !rule) return;
    const inc = stmt.match(/^@include\s+sprite\(\s*\$([\w-]+)/);
    const url = stmt.match(/url\(\s*['"]?([^'")]+)/);
    const decl = stmt.match(/^(left|top|right|bottom)\s*:\s*(-?\d+(?:\.\d+)?)(px)?\s*(?:!important)?$/);
    if (inc) rule.includes.push(inc[1]);
    if (url) rule.urls.push(path.basename(url[1]));
    if (decl) rule[inMobile() ? 'mb' : 'pc'][decl[1]] = { line: stmtLine, value: Number(decl[2]) };
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; line++; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); line += (src.slice(i, end).match(/\n/g) || []).length; i = end + 1; continue; }
    if (c === '\n') line++;
    if (c === '{') {
      const header = buf.trim();
      buf = '';
      const parent = ruleFrame();
      if (/^@include\s+mobile\b/.test(header)) stack.push({ kind: 'mobile' });
      else if (/^@include\s+pc\b/.test(header)) stack.push({ kind: 'pc' });
      else if (header.startsWith('@')) stack.push({ kind: 'other' });
      else {
        const selector = header.split(',').map((s) => joinSelector(parent?.selector, s.trim())).join(', ');
        const frame = { kind: 'rule', file, selector, includes: [], urls: [], pc: {}, mb: {} };
        stack.push(frame);
        rules.push(frame);
      }
      continue;
    }
    if (c === ';') { flush(); continue; }
    if (c === '}') { flush(); stack.pop(); continue; }
    if (!buf.trim() && !/\s/.test(c)) stmtLine = line;
    buf += c;
  }
  return rules.map(({ kind, ...r }) => r);
}

// `&` = nối thẳng vào cha (`.title` + `&.active` → `.title.active`), không có `&` = con cháu
const joinSelector = (parent, own) => (!parent ? own : own.includes('&') ? own.replaceAll('&', parent) : `${parent} ${own}`);

function diff({ plan: planFile, measure: measureFile, threshold = 2, waivers }) {
  const planData = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const measure = JSON.parse(fs.readFileSync(measureFile, 'utf8'));
  const thr = Number(threshold);
  const waiverFile = waivers ?? path.join(planData.campaign, '.claude/knowledge/waivers.md');
  const waiverText = fs.existsSync(waiverFile) ? fs.readFileSync(waiverFile, 'utf8') : '';
  const isWaived = (name) => new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`, 'm').test(waiverText);
  const measured = Object.fromEntries(measure.assets.map((m) => [m.name, m]));
  const round1 = (v) => Math.round(v * 10) / 10;

  const findings = [];
  const deltas = {};
  for (const g of planData.groups) {
    const rootAsset = g.assets.find((a) => a.name === g.root);
    const rm = measured[g.root];
    const ref = rm && rm.matches === 1
      ? { s: rm.w / rootAsset.w, x: rm.x, y: rm.y, ex: rootAsset.x, ey: rootAsset.y }
      : { s: measure.wrapper.w / g.canvas[0], x: measure.wrapper.x, y: measure.wrapper.y, ex: 0, ey: 0 };

    for (const a of g.assets) {
      if (a.name === g.root) continue;
      const m = measured[a.name];
      if (!m || m.matches !== 1) continue;
      deltas[a.name] = {
        dx: round1((m.x - ref.x) / ref.s - (a.x - ref.ex)),
        dy: round1((m.y - ref.y) / ref.s - (a.y - ref.ey)),
        dw: round1(m.w / ref.s - a.w),
        dh: round1(m.h / ref.s - a.h),
      };
    }

    for (const a of g.assets) {
      if (a.name === g.root) continue;
      const base = { name: a.name, group: g.coords, viewport: g.viewport, fix: null };
      const m = measured[a.name];
      if (isWaived(a.name)) { findings.push({ ...base, type: 'waived' }); continue; }
      if (!a.selectors.length) { findings.push({ ...base, type: 'unmapped' }); continue; }
      if (!m) { findings.push({ ...base, type: 'not-measured' }); continue; }
      if (m.matches !== 1) { findings.push({ ...base, type: 'ambiguous', matches: m.matches }); continue; }
      const d = deltas[a.name];
      const positionOff = Math.abs(d.dx) > thr || Math.abs(d.dy) > thr;
      const sizeOff = Math.abs(d.dw) > thr || Math.abs(d.dh) > thr;
      if (!positionOff) { if (sizeOff) findings.push({ ...base, ...d, type: 'size-mismatch' }); continue; }
      const pd = m.parent && deltas[m.parent];
      if (pd && Math.abs(pd.dx - d.dx) <= PARENT_SAME_DELTA_TOLERANCE && Math.abs(pd.dy - d.dy) <= PARENT_SAME_DELTA_TOLERANCE) {
        findings.push({ ...base, ...d, type: 'skipped-parent', parent: m.parent });
        continue;
      }
      const fix = buildFix(a, g.viewport, d, thr, planData.campaign);
      findings.push({ ...base, ...d, type: fix ? 'position' : 'no-declaration', fix });
    }
  }

  const abort = uniformOffset(Object.values(deltas), thr) ? 'uniform-offset' : null;
  if (abort) findings.forEach((f) => { f.fix = null; });
  return { campaign: planData.campaign, threshold: thr, abort, findings };
}

// left lệch +dx → left giảm dx; right là chiều ngược nên cộng. top/bottom tương tự
function buildFix(a, viewport, d, thr, campaign) {
  const decls = a.rule?.[viewport] ?? {};
  const fix = {};
  const axis = (delta, near, far) => {
    if (Math.abs(delta) <= thr) return true;
    const prop = decls[near] ? near : decls[far] ? far : null;
    if (!prop) return false;
    const sign = prop === near ? -1 : 1;
    fix[prop] = { file: path.join(campaign, a.rule.file), line: decls[prop].line, from: decls[prop].value, to: Math.round(decls[prop].value + sign * delta) };
    return true;
  };
  return axis(d.dx, 'left', 'right') && axis(d.dy, 'top', 'bottom') ? fix : null;
}

// ≥50% asset (và ≥4) lệch cùng một vector = sai quy đổi canvas, không phải hàng loạt bug thật
function uniformOffset(deltas, thr) {
  const clusters = {};
  for (const d of deltas) {
    const key = `${Math.round(d.dx)},${Math.round(d.dy)}`;
    clusters[key] = (clusters[key] || 0) + 1;
  }
  const [key, count] = Object.entries(clusters).sort((a, b) => b[1] - a[1])[0] ?? ['0,0', 0];
  const [dx, dy] = key.split(',').map(Number);
  return count >= UNIFORM_MIN_ASSETS && count / deltas.length >= UNIFORM_MIN_SHARE && (Math.abs(dx) > thr || Math.abs(dy) > thr);
}

function apply({ findings: findingsFile }) {
  const { findings } = JSON.parse(fs.readFileSync(findingsFile, 'utf8'));
  const files = {};
  const edits = [];
  const skipped = [];
  for (const f of findings) {
    if (f.type !== 'position' || !f.fix) { skipped.push({ name: f.name, type: f.type }); continue; }
    for (const [prop, e] of Object.entries(f.fix)) {
      files[e.file] ??= fs.readFileSync(e.file, 'utf8').split('\n');
      const lines = files[e.file];
      lines[e.line - 1] = lines[e.line - 1].replace(/(-?\d+(?:\.\d+)?)(px)?/, `${e.to}px`);
      edits.push({ name: f.name, file: e.file, line: e.line, prop, from: e.from, to: e.to });
    }
  }
  for (const [file, lines] of Object.entries(files)) fs.writeFileSync(file, lines.join('\n'));
  return { edits, skipped };
}

const [cmd, ...rest] = process.argv.slice(2);
const opts = parseArgs(rest);
const out = { plan, diff, apply }[cmd];
if (!out) {
  console.error('geo-fix <plan|diff|apply> --out <json> … (plan: --campaign --coords…; diff: --plan --measure [--threshold] [--waivers]; apply: --findings)');
  process.exit(2);
}
fs.writeFileSync(opts.out, JSON.stringify(out(opts), null, 2));
