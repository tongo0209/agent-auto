#!/usr/bin/env node
/**
 * state-doctor — soi state.json/config.json theo hợp đồng schema/vocab.json.
 *
 * Vì sao cần: `state.json` do LLM (skill /daily) ghi, nên nó có thể sinh key/giá trị mới bất
 * cứ lúc nào. Ngày 3/8 skill ghi `phase: "reassigned"` — console không biết từ đó nên ticket
 * vừa lọt timeline vừa mất khỏi bảng. Sai hợp đồng phải ỒN ÀO, không được im lặng.
 *
 * Doctor CHỈ ĐỌC — không sửa state.json/config.json/vocab.json, không auto-fix gì cả.
 *
 * Chạy: node tools/state-doctor.mjs [--json knowledge/doctor.json] [--root <dir>]
 * Exit ≠ 0 khi còn ERROR (giống tools/fe-gate.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const tryRead = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const readJSON = (p, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

/**
 * Tên icon đã khai trong core/icons.js — dùng cho luật E7.
 *
 * icons.js khai icon trong `const RAW = { ... }` với 2 dạng key:
 *   - bare identifier:  `wait,` `ready,` `coding,`
 *   - quoted vì có dấu gạch ngang: `'design-local': designLocal,`
 * Regex bóc cả hai: `\s*` đầu dòng, `'?` quote tuỳ chọn, `([\w-]+)` tên, `'?` quote đóng tuỳ
 * chọn, rồi bắt buộc gặp `:` hoặc `,` ngay sau — nhờ vậy dòng `const RAW = {` không khớp
 * (sau "RAW" là khoảng trắng rồi "=", không phải : hay ,), chỉ các dòng entry mới khớp.
 *
 * `--root` trỏ vào root tự dựng (fixture, snapshot state ở /tmp) thì thường KHÔNG mang theo
 * bản sao icons.js. Đọc thẳng sẽ ném ENOENT chết ngang, mất luôn report của 11 luật còn lại.
 * Lùi về icons.js của REPO_ROOT — cùng nếp với vocab ở runDoctor(). Cả hai đều không đọc được
 * thì trả `null` để bỏ qua E7: không có phía nào của hợp đồng để đối chiếu thì im lặng còn
 * đúng hơn là báo oan mọi phase.
 */
function iconNames(root) {
  const src =
    tryRead(path.join(root, 'console/src/core/icons.js')) ??
    tryRead(path.join(REPO_ROOT, 'console/src/core/icons.js'));
  if (src === null) return null;
  const start = src.indexOf('const RAW = {');
  const block = src.slice(start, src.indexOf('};', start));
  return new Set(
    [...block.matchAll(/^\s*'?([\w-]+)'?\s*[:,]/gm)].map((m) => m[1]).filter((n) => n !== 'RAW')
  );
}

export function runDoctor({ root = REPO_ROOT, skipIcons = false } = {}) {
  const vocab = readJSON(path.join(root, 'schema/vocab.json')) || readJSON(path.join(REPO_ROOT, 'schema/vocab.json'));
  const state = readJSON(path.join(root, 'state.json'), {});
  const config = readJSON(path.join(root, 'config.json'), {});
  const errors = [];
  const warns = [];
  const err = (code, key, text) => errors.push({ code, key, text });
  const warn = (code, key, text) => warns.push({ code, key, text });

  const phaseIds = new Set(vocab.phases.map((p) => p.id));
  const milestoneIds = new Set(vocab.milestones.map((m) => m.id));
  const designIds = new Set(vocab.designStatus.map((d) => d.id));
  // W2/W3 trước đây hardcode danh sách phase ngay trong doctor — 3/8 lộ ra chính kiểu lỗi
  // doctor được tạo ra để bắt (skill ghi phase mới, doctor không biết): `['coding','deliver']`
  // thiếu `bugfix` (cũng có cờ `active` trong vocab), và id `'reassigned'` hardcode thẳng thay
  // vì đọc cờ nghiệp vụ. Đổi sang đọc cờ từ schema/vocab.json — thêm phase mới có cờ đúng thì
  // doctor tự nhận, không phải sửa file .mjs này lần nữa.
  const activePhaseIds = new Set(vocab.phases.filter((p) => p.active).map((p) => p.id));
  const needsHandoffIds = new Set(vocab.phases.filter((p) => p.needsHandoff).map((p) => p.id));

  // E5: state.json phải khai đúng schemaVersion hiện dùng (2) — sai/thiếu nghĩa là state cũ
  // hoặc ghi tay, console có thể đọc sai cấu trúc.
  if (state.schemaVersion !== 2) err('E5', '(state)', `schemaVersion phải là 2, đang là ${state.schemaVersion}`);

  // W8/W9: bug-radar im lặng là kiểu hỏng tệ nhất — sheet không gắn ticket thì không kiểm được
  // cổng G1/G2 nên không bao giờ tự fix, còn hàng đợi ghi sheet thì chỉ phiên CLI mới xả được.
  for (const [sheetId, entry] of Object.entries(state.bugWatch || {})) {
    const label = entry.title || sheetId.slice(0, 12);
    if (!entry.keys?.length) warn('W8', label, 'sheet buglist chưa gắn ticket nào — cổng G1/G2 không kiểm được');
    const queued = entry.pendingSheetWrite?.length || 0;
    if (queued) warn('W9', label, `${queued} dòng chờ ghi ngược sheet — mở phiên CLI chạy /daily bugwrite`);
  }

  // E10 (+W7): CỔNG CÀI ĐẶT. Trước 14/8 doctor chỉ soi state, nên chạy trên một máy vừa cài
  // xong — config.json còn nguyên placeholder của config.example.json — nó vẫn trả
  // "✓ 0 ERROR · 0 WARN". Mà README bảo member dùng đúng lệnh này để nghiệm thu cài đặt.
  // Báo xanh sai tệ hơn báo đỏ: member tin đã xong, rồi chết ở bước quét Jira mà không biết
  // vì sao. E10 chỉ bắt thứ CHẮC CHẮN sai (thiếu file, để trống, còn `<...>`), không đoán.
  const configPath = path.join(root, 'config.json');
  const isPlaceholder = (v) => /^<.*>$/.test(String(v).trim());
  const unset = (v) => v == null || String(v).trim() === '' || isPlaceholder(v);
  if (!fs.existsSync(configPath)) {
    err('E10', '(config)', 'chưa có config.json — chạy `bash tools/install-skills.sh` để tạo từ config.example.json');
  } else {
    if (unset(config.cloudId))
      err('E10', '(config)', 'cloudId chưa đặt — hỏi Claude "cho tôi cloudId Jira" (MCP Atlassian getAccessibleAtlassianResources) rồi điền vào config.json');
    if (unset(config.gitAuthor))
      err('E10', '(config)', 'gitAuthor chưa đặt — điền email git của bạn (`git config user.email`) để lọc đúng commit của mình');
    const repos = config.repos || {};
    if (!Object.keys(repos).length) {
      err('E10', '(config)', 'config.repos rỗng — /daily không biết tìm code ở đâu');
    } else {
      for (const [name, p] of Object.entries(repos)) {
        // Placeholder = chưa sửa file mẫu ⇒ chắc chắn sai ⇒ ERROR.
        if (unset(p)) err('E10', '(config)', `repos["${name}"] còn nguyên mẫu, chưa trỏ vào repo thật trên máy bạn`);
        // Path thật nhưng không tồn tại thì chỉ WARN: có người cố tình chưa clone vportal2view
        // (37.718 file) mà vẫn dùng /daily cho cdn-source bình thường — chặn cứng là chặn oan.
        else if (!fs.existsSync(p)) warn('W7', '(config)', `repos["${name}"] trỏ "${p}" — không có trên đĩa`);
      }
    }
  }

  // E7: mỗi phase khai icon trong vocab phải thực sự tồn tại trong core/icons.js, nếu không
  // panel render ra icon rỗng mà không ai biết.
  const icons = skipIcons ? null : iconNames(root);
  if (icons) {
    for (const p of vocab.phases) {
      if (p.icon && !icons.has(p.icon)) {
        err('E7', '(vocab)', `phase "${p.id}" khai icon "${p.icon}" mà core/icons.js không có`);
      }
    }
  }

  for (const [key, issue] of Object.entries(state.issues || {})) {
    // E1: phase phải nằm trong enum vocab — đây chính là lỗi 3/8 (skill ghi "reassigned" lạ).
    if (!phaseIds.has(issue.phase)) {
      err('E1', key, `phase "${issue.phase}" không có trong vocab (${[...phaseIds].join(' · ')})`);
    }

    const ms = issue.milestones || {};
    for (const [name, date] of Object.entries(ms)) {
      if (name.startsWith('_')) continue; // key mở đầu bằng "_" là GHI CHÚ của skill, không phải mốc — bỏ qua E2/E3
      if (!milestoneIds.has(name)) err('E2', key, `key mốc "${name}" không có trong vocab`);
      if (!ISO_DATE.test(String(date))) err('E3', key, `mốc "${name}" = "${date}" không phải YYYY-MM-DD`);
    }
    if (Object.keys(ms).filter((n) => !n.startsWith('_')).length === 0) {
      warn('W4', key, 'không có mốc nào — không biết deadline');
    }
    // W5: ngược với E2/E3, `_conflict` LÀ đáng cảnh báo — mốc còn tranh chấp chưa ai hỏi lại,
    // khác với "ghi chú lạ nên bỏ qua" của E2/E3.
    if (Object.keys(ms).includes('_conflict')) {
      warn('W5', key, 'mốc còn tranh chấp (_conflict) — chưa hỏi lại ai');
    }

    if (issue.design?.status && !designIds.has(issue.design.status)) {
      err('E4', key, `design.status "${issue.design.status}" ngoài enum`);
    }

    // E8: có bằng chứng design ĐÃ GIAO (link trong ticket, hoặc subtask "Design" trên Jira đã
    // Done) mà design.status vẫn nói "chưa-có-link"/bỏ trống → state đang phủ nhận thứ user
    // nhìn thấy bằng mắt trên ticket. Đây là họ lỗi đã trả giá 2 lần: 31/7 GW-477 (link nằm
    // trong description mà báo "chưa xác nhận design"), 10/8 GW-627 (subtask GW-628 Done).
    const designDelivered = Boolean(issue.designLink || issue.design?.link)
      || issue.design?.subtask?.status === 'Done';
    if (designDelivered && (!issue.design?.status || issue.design.status === 'chưa-có-link')) {
      err('E8', key, 'design đã giao (có designLink/subtask Done) mà design.status = "'
        + (issue.design?.status || '(trống)') + '" — phải là một mức "đã-giao-*"');
    }

    // E9: `design.gaps` do /check-design ghi (soát design có ĐỦ so với yêu cầu chưa). Console
    // và báo cáo đọc thẳng mấy con số này để nói "còn thiếu N hạng mục" — field mới mà không
    // ai canh thì sai kiểu sẽ trôi im lặng, đúng họ lỗi doctor sinh ra để chặn.
    const gaps = issue.design?.gaps;
    if (gaps) {
      if (!ISO_DATETIME.test(String(gaps.checkedAt || ''))) {
        err('E9', key, `design.gaps.checkedAt = "${gaps.checkedAt}" không phải thời điểm ISO`);
      }
      for (const n of ['ok', 'missing', 'unsure', 'na', 'ask']) {
        const v = gaps.counts?.[n];
        if (v !== undefined && typeof v !== 'number') {
          err('E9', key, `design.gaps.counts.${n} = "${v}" không phải số`);
        }
      }
      // W6: đang code trong khi design còn thiếu — KHÔNG chặn (user có quyền dựng phần đủ
      // trước), nhưng phải nói ra để không dựng nhầm rồi đập đi.
      if (activePhaseIds.has(issue.phase) && Number(gaps.counts?.missing) > 0) {
        warn('W6', key, `đang "${issue.phase}" mà design còn thiếu ${gaps.counts.missing} hạng mục`
          + (gaps.missingTop?.length ? `: ${gaps.missingTop.join(' · ')}` : ''));
      }
    }

    const paths = issue.paths || [];
    for (const p of paths) {
      if (!config.repos?.[p.repo]) err('E6', key, `paths.repo "${p.repo}" không có trong config.repos`);
      else if (!fs.existsSync(path.join(config.repos[p.repo], p.path))) {
        warn('W1', key, `paths "${p.repo}/${p.path}" không tồn tại trên đĩa`);
      }
    }
    if (!paths.length && activePhaseIds.has(issue.phase)) {
      warn('W2', key, `phase "${issue.phase}" mà chưa gắn paths — không đo được effort`);
    }
    if (needsHandoffIds.has(issue.phase) && !fs.existsSync(path.join(root, 'tasks', key, 'handoff.md'))) {
      warn('W3', key, 'đã chuyển người mà chưa có tasks/' + key + '/handoff.md');
    }
  }

  return { at: new Date().toISOString(), errors, warns };
}

/* ── CLI ── */
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : null;
  };
  const report = runDoctor({ root: arg('--root') || REPO_ROOT });
  for (const e of report.errors) console.log(`✖ ${e.code} ${e.key}: ${e.text}`);
  for (const w of report.warns) console.log(`⚠ ${w.code} ${w.key}: ${w.text}`);
  console.log(`\n${report.errors.length ? '✖' : '✓'} ${report.errors.length} ERROR · ${report.warns.length} WARN\n`);
  const json = arg('--json');
  if (json) fs.writeFileSync(path.resolve(json), JSON.stringify(report, null, 1));
  process.exit(report.errors.length ? 1 : 0);
}
