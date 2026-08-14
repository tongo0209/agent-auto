#!/usr/bin/env node
/* gap-store.mjs — nơi CHỐT con số của /check-design.
 *
 * Model nộp JSON thô (nó là bên "nhìn" design). Script này mới là chỗ quyết định verdict cuối,
 * vì hai luật dưới đây là loại luật model rất dễ tự bẻ khi thấy "hiển nhiên quá rồi":
 *
 *   1. LUẬT BẰNG CHỨNG — chưa soi cây layer PSD/PSB thì không ai được nói THIẾU. Ca GW-713:
 *      popup content frame 2/4 không có trong 3 ảnh JPG preview, nhưng rất có thể nằm trong
 *      layer ẩn của PSB 237MB. Báo THIẾU lúc đó là báo oan designer.
 *   2. LUẬT HAI RỔ — chỉ cái NGUỒN có đòi mới được gọi là thiếu. Checklist của nghề (mobile,
 *      hover, popup, ảnh share...) chỉ được sinh CÂU HỎI cho PM. Bài học đã trả giá: "đủ" phải
 *      đo theo nguồn, cấm tự định nghĩa tập kiểm.
 *
 * Dùng: gap-store.mjs --root <agent-auto> --key GW-713 --in run.json [--now <ISO>] [--json]
 * Exit: 0 = không thiếu gì · 1 = có mục THIẾU · 2 = sai tham số.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERDICTS = ['ĐỦ', 'THIẾU', 'CHƯA-CHẮC', 'KHÔNG-ÁP-DỤNG'];
const PSD_RE = /\.(psd|psb)\b/i;

/** Cưỡng chế 2 luật + đếm. Không đụng đĩa nên test được thẳng. */
export function normalize(run) {
  const items = [];
  const asks = [...(run.asks || [])];

  for (const raw of run.items || []) {
    const it = { ...raw, evidence: { looked: [], found: null, blockedBy: null, ...(raw.evidence || {}) } };
    if (!VERDICTS.includes(it.verdict)) it.verdict = 'CHƯA-CHẮC';

    // Luật hai rổ: không có nguồn đòi ⇒ không phải thiếu, chỉ là câu hỏi cho PM.
    if (!it.source || !it.source.quote) {
      if (it.verdict === 'THIẾU' || it.verdict === 'CHƯA-CHẮC') {
        asks.push({ id: it.id, label: it.label, why: 'nguồn không đòi mục này — hỏi PM cho chắc' });
        continue;
      }
    }

    // Luật bằng chứng: THIẾU chỉ hợp lệ khi đã soi cả ảnh lẫn cây layer PSD/PSB.
    if (it.verdict === 'THIẾU') {
      const looked = it.evidence.looked || [];
      const sawPsd = looked.some((f) => PSD_RE.test(f));
      if (!looked.length || !sawPsd) {
        it.verdict = 'CHƯA-CHẮC';
        it.evidence.blockedBy = it.evidence.blockedBy
          || 'chưa soi PSD/PSB — dump cây layer (tools/psd-tree.py) rồi mới được kết luận THIẾU';
      }
    }

    // ĐỦ phải chỉ được ra chỗ thấy, không thì cũng chỉ là phỏng đoán.
    if (it.verdict === 'ĐỦ' && !it.evidence.found) {
      it.verdict = 'CHƯA-CHẮC';
      it.evidence.blockedBy = it.evidence.blockedBy || 'nói ĐỦ mà không chỉ được ra file/vùng/layer nào';
    }

    items.push(it);
  }

  const counts = {
    ok: items.filter((i) => i.verdict === 'ĐỦ').length,
    missing: items.filter((i) => i.verdict === 'THIẾU').length,
    unsure: items.filter((i) => i.verdict === 'CHƯA-CHẮC').length,
    na: items.filter((i) => i.verdict === 'KHÔNG-ÁP-DỤNG').length,
    ask: asks.length,
  };
  return { items, asks, counts };
}

const MISSINGISH = new Set(['THIẾU', 'CHƯA-CHẮC']);
const dayOf = (iso) => String(iso).slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Gắn firstSeenMissing cho item hiện tại, thừa kế từ run trước nếu vẫn đang thiếu. */
function carryFirstSeen(prevItems, items, today) {
  const prev = new Map((prevItems || []).map((i) => [i.id, i]));
  for (const it of items) {
    if (!MISSINGISH.has(it.verdict)) { delete it.firstSeenMissing; continue; }
    const p = prev.get(it.id);
    it.firstSeenMissing = p && MISSINGISH.has(p.verdict) && p.firstSeenMissing ? p.firstSeenMissing : today;
  }
  return items;
}

export function computeDelta(prevRun, curRun, now) {
  const today = dayOf(now);
  const prev = new Map((prevRun?.items || []).map((i) => [i.id, i]));
  const resolved = [];
  const stillMissing = [];
  const fresh = [];

  for (const it of curRun.items) {
    const p = prev.get(it.id);
    if (MISSINGISH.has(it.verdict)) {
      if (!p || !MISSINGISH.has(p.verdict)) fresh.push({ id: it.id, label: it.label });
      else stillMissing.push({
        id: it.id,
        label: it.label,
        firstSeenMissing: it.firstSeenMissing,
        days: daysBetween(it.firstSeenMissing, today),
      });
    }
  }
  for (const [id, p] of prev) {
    if (!MISSINGISH.has(p.verdict)) continue;
    const c = curRun.items.find((i) => i.id === id);
    if (c && !MISSINGISH.has(c.verdict)) resolved.push({ id, label: p.label });
  }
  return { resolved, stillMissing, fresh };
}

const BEGIN = '<!-- check-design:begin -->';
const END = '<!-- check-design:end -->';

function briefBlock(items, asks, now) {
  const lines = [BEGIN, `<!-- soát design ${dayOf(now)} — khối này do /check-design quản, sửa tay sẽ bị ghi đè -->`];
  const missing = items.filter((i) => i.verdict === 'THIẾU');
  const unsure = items.filter((i) => i.verdict === 'CHƯA-CHẮC');
  for (const i of missing) lines.push(`- [ ] ❌ THIẾU design: **${i.label}** — nguồn đòi: "${i.source?.quote || ''}" (${i.source?.ref || ''})`);
  for (const i of unsure) lines.push(`- [ ] ❓ CHƯA CHẮC: **${i.label}** — ${i.evidence?.blockedBy || 'cần soi thêm'}`);
  for (const a of asks) lines.push(`- [ ] 💬 Hỏi PM: **${a.label}** — ${a.why}`);
  if (lines.length === 2) lines.push('- ✅ Soát design: không thiếu gì so với nguồn.');
  lines.push(END);
  return lines.join('\n');
}

function patchBrief(briefPath, block) {
  if (!fs.existsSync(briefPath)) return false;
  let txt = fs.readFileSync(briefPath, 'utf8');
  if (txt.includes(BEGIN) && txt.includes(END)) {
    const from = txt.indexOf(BEGIN);
    const to = txt.indexOf(END) + END.length;
    txt = txt.slice(0, from) + block + txt.slice(to);
  } else if (/^## Việc còn mở\s*$/m.test(txt)) {
    txt = txt.replace(/^## Việc còn mở\s*$/m, (m) => `${m}\n\n${block}`);
  } else {
    txt = `${txt.replace(/\s*$/, '')}\n\n## Việc còn mở\n\n${block}\n`;
  }
  fs.writeFileSync(briefPath, txt);
  return true;
}

/** Text copy-là-gửi-được cho PM/designer. */
export function askText(key, entry) {
  const d = dayOf(entry.checkedAt);
  const L = [`Chào anh/chị, em soát lại design cho ${key} ngày ${d}, còn mấy mục cần anh/chị bổ sung ạ:`];
  const need = entry.items.filter((i) => i.verdict === 'THIẾU' || i.verdict === 'CHƯA-CHẮC');
  need.forEach((i, n) => {
    const src = i.source ? ` — trong ${i.source.ref} có ghi "${i.source.quote}"` : '';
    const ms = i.milestone ? ` (liên quan mốc ${i.milestone})` : '';
    L.push(`${n + 1}. ${i.label}${src}${ms}`);
  });
  if (!need.length) L.push('(không có mục nào thiếu so với nguồn)');
  if (entry.asks.length) {
    L.push('', 'Mấy mục sau nguồn không nhắc tới, anh/chị xác nhận giúp em có cần không ạ:');
    entry.asks.forEach((a) => L.push(`- ${a.label}`));
  }
  return L.join('\n');
}

function renderMd(key, entry) {
  const c = entry.counts;
  const L = [`# ${key} — soát design ${entry.checkedAt}`, ''];
  L.push(`**ĐỦ ${c.ok} · THIẾU ${c.missing} · CHƯA CHẮC ${c.unsure} · hỏi thêm ${c.ask}**`, '');
  if (entry.files) {
    L.push(`Tầng file: đã tải ${entry.files.downloaded ?? '?'} · nguồn còn thiếu ${entry.files.missingSource ?? '?'}`
      + ` · nguồn mới hơn bản local ${entry.files.newerAtSource ?? '?'}`
      + (entry.files.note ? ` — ${entry.files.note}` : ''), '');
  }
  L.push('| Mức | Hạng mục | Nguồn đòi | Bằng chứng |', '|---|---|---|---|');
  for (const i of entry.items) {
    const src = i.source ? `"${i.source.quote}" (${i.source.ref})` : '—';
    const ev = i.evidence?.found || i.evidence?.blockedBy || `đã soi: ${(i.evidence?.looked || []).join(', ') || '—'}`;
    L.push(`| ${i.verdict} | ${i.label} | ${src} | ${ev} |`);
  }
  if (entry.asks.length) {
    L.push('', '## Nguồn không nói — nên hỏi PM', '');
    for (const a of entry.asks) L.push(`- **${a.label}** — ${a.why}`);
  }
  const d = entry.delta;
  if (d && (d.resolved.length || d.stillMissing.length || d.fresh.length)) {
    L.push('', '## So với lần soát trước', '');
    for (const x of d.resolved) L.push(`- ✅ đã có: ${x.label}`);
    for (const x of d.stillMissing) L.push(`- ⏳ vẫn thiếu sang ngày thứ ${x.days}: ${x.label} (thiếu từ ${x.firstSeenMissing})`);
    for (const x of d.fresh) L.push(`- 🆕 mới phát sinh: ${x.label}`);
  }
  L.push('', '## Gửi PM (copy)', '', '```', askText(key, entry), '```');
  return `${L.join('\n')}\n`;
}

export function applyRun({ root, key, run, now }) {
  const today = dayOf(now);
  const { items, asks, counts } = normalize(run);
  const taskDir = path.join(root, 'tasks', key);
  fs.mkdirSync(taskDir, { recursive: true });
  const gapFile = path.join(taskDir, 'design-gap.json');

  const store = fs.existsSync(gapFile) ? JSON.parse(fs.readFileSync(gapFile, 'utf8')) : { key, runs: [] };
  const prevRun = store.runs[store.runs.length - 1] || null;
  carryFirstSeen(prevRun?.items, items, today);

  const entry = { checkedAt: now, depth: run.depth || 'deep', files: run.files || null, counts, items, asks };
  entry.delta = computeDelta(prevRun, entry, now);
  store.runs.push(entry);
  store.runs = store.runs.slice(-10);
  fs.writeFileSync(gapFile, `${JSON.stringify(store, null, 2)}\n`);

  const mdFile = path.join(taskDir, 'design-gap.md');
  fs.writeFileSync(mdFile, renderMd(key, entry));

  const statePath = path.join(root, 'state.json');
  if (fs.existsSync(statePath)) {
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    st.issues = st.issues || {};
    const issue = (st.issues[key] = st.issues[key] || {});
    issue.design = issue.design || {};
    issue.design.gaps = {
      checkedAt: now,
      depth: entry.depth,
      counts,
      missingTop: items.filter((i) => i.verdict === 'THIẾU').slice(0, 3).map((i) => i.label),
    };
    fs.writeFileSync(statePath, `${JSON.stringify(st, null, 2)}\n`);
  }

  patchBrief(path.join(taskDir, 'brief.md'), briefBlock(items, asks, now));
  return { gapFile, mdFile, counts, delta: entry.delta, items, asks, entry };
}

/* ─────────────────────────── CLI ─────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const get = (f, d = '') => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
  // Mặc định: gốc repo suy từ vị trí script (<root>/skills/check-design/scripts/gap-store.mjs)
  // — không hardcode máy ai, member clone chỗ nào cũng chạy.
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const root = get('--root', defaultRoot);
  const key = get('--key');
  const inFile = get('--in');
  const now = get('--now', new Date().toISOString());
  if (!key || !inFile) {
    console.error('Usage: gap-store.mjs --root <agent-auto> --key <GW-123> --in <run.json> [--now <ISO>] [--json]');
    process.exit(2);
  }
  const run = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const res = applyRun({ root, key, run, now });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ counts: res.counts, delta: res.delta, gapFile: res.gapFile, mdFile: res.mdFile }, null, 2));
  } else {
    const c = res.counts;
    console.log(`${key}: ĐỦ ${c.ok} · THIẾU ${c.missing} · CHƯA CHẮC ${c.unsure} · hỏi thêm ${c.ask}`);
    console.log(`→ ${res.mdFile}`);
  }
  process.exit(res.counts.missing > 0 ? 1 : 0);
}
