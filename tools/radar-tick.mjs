#!/usr/bin/env node
/**
 * radar-tick — MỘT lượt radar nền: gọi `/daily delta` trong phiên headless (`claude -p`).
 *
 * Vì sao tồn tại: trước đây muốn radar chạy nền phải mở console → mở tab → bấm `claude` →
 * bấm `radar 30m`. Mỗi phiên làm việc phải click lại từ đầu, và radar chết theo tab.
 *
 * Vì sao dám chạy nền — chỗ này từng bị cấm nhầm: ghi chú cũ trong SKILL.md nói phiên nền
 * không có token connector Jira nên cấm cron. Đo thật 13/8: `claude -p` gọi được
 * `searchJiraIssuesUsingJql` (OK GW-720, 16.6s) và gọi được cả skill (`/daily status`, 47s).
 * Giả định cũ SAI. Thiết kế: docs/specs/2026-08-13-radar-auto-design.md
 *
 * Chạy: node tools/radar-tick.mjs [--force] [--dry]
 *   --force  bỏ qua cổng giờ (để nghiệm thu ngoài khung 8-18h)
 *   --dry    qua hết các cổng nhưng KHÔNG gọi claude, không ghi sổ
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DEFAULTS = {
  enabled: true,
  days: [1, 2, 3, 4, 5], // 0=CN … 6=T7, theo Date.getDay()
  hours: [8, 18],
  graceMin: 3,
  lockStaleMin: 15,
  timeoutMin: 5,
};

/**
 * Cổng ①. Mép phải TÍNH THEO PHÚT chứ không theo giờ: `hours:[8,18]` nghĩa là chạy tới đúng
 * 18:00, 18:01 là nghỉ. So bằng `getHours() <= 18` sẽ lỡ chạy tới tận 18:59.
 */
export function shouldRunNow(date, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  if (c.enabled === false) return { run: false, why: 'disabled' };
  if (!c.days.includes(date.getDay())) return { run: false, why: 'off-day' };
  const cur = date.getHours() * 60 + date.getMinutes();
  if (cur < c.hours[0] * 60 || cur > c.hours[1] * 60) return { run: false, why: 'off-hours' };
  return { run: true, why: null };
}

/**
 * Cổng ②. File lock hỏng/không đọc được → 'stale' chứ không 'busy': một lần ghi lỗi mà coi là
 * bận thì radar kẹt vĩnh viễn và im lặng — đúng kiểu hỏng khó thấy nhất.
 */
export function lockState(lockPath, nowMs = Date.now(), staleMs = DEFAULTS.lockStaleMin * 60e3) {
  let atMs;
  try {
    atMs = JSON.parse(fs.readFileSync(lockPath, 'utf8')).atMs;
  } catch (err) {
    return err.code === 'ENOENT' ? 'free' : 'stale';
  }
  if (!Number.isFinite(atMs)) return 'stale';
  return nowMs - atMs >= staleMs ? 'stale' : 'busy';
}

/** Cổng ③. File không tồn tại KHÔNG phải "bận" — board hôm nay có thể chưa được tạo. */
export function humanBusy(paths, nowMs = Date.now(), graceMs = DEFAULTS.graceMin * 60e3) {
  return paths.some((p) => {
    try {
      return nowMs - fs.statSync(p).mtimeMs < graceMs;
    } catch {
      return false;
    }
  });
}

/** Đếm dòng thật của .jsonl (dòng trống không tính) — để so trước/sau một lượt delta */
export function countLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * "Có thay đổi thật không" = có dòng MỚI trong sổ nhật ký, chứ không hỏi lại LLM.
 * Chỉ đếm phần TĂNG: file bị dọn bớt không được tính thành thay đổi.
 */
export function diffCounts(before, after) {
  const newRows = {};
  for (const k of Object.keys(after)) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d > 0) newRows[k] = d;
  }
  return { changed: Object.keys(newRows).length > 0, newRows };
}

/** Đếm ngược số lượt hỏng liên tiếp gần nhất. Lượt bị bỏ (skipped) không phải hỏng, bỏ qua. */
export function failStreak(rows = []) {
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].skipped) continue;
    if (rows[i].ok) break;
    n++;
  }
  return n;
}

/**
 * Hết hạn đăng nhập là ca NGUY HIỂM NHẤT nên báo ngay: radar vẫn chạy đều, vẫn ghi sổ, chỉ có
 * điều lượt nào cũng "không có gì mới" — im lặng đúng kiểu làm user tin nhầm là mọi thứ yên.
 * Lỗi khác (timeout, mạng) đợi 3 lượt (~1h30) mới báo để khỏi spam.
 */
const AUTH_ERR = /invalid api key|\/login|unauthor|authenticat|credential|token.*expir/i;

export function decideNotify({ ok, err = '', changed = false, streak = 0 }) {
  if (!ok && AUTH_ERR.test(err)) return { send: true, kind: 'auth' };
  if (!ok) return streak >= 3 ? { send: true, kind: 'dead' } : { send: false, kind: null };
  return changed ? { send: true, kind: 'change' } : { send: false, kind: null };
}

/**
 * Phiên nền không có ai bấm "Allow" — tool nằm ngoài danh sách này làm tick chết CÂM.
 * Vì vậy thà liệt kê tường minh rồi nới theo sổ, còn hơn mở toang bằng skip-permissions.
 * `Skill` là tool nạp `/daily`: thiếu nó thì prompt chạy như văn bản thường, không ra radar.
 */
export const ALLOWED_TOOLS = [
  'Skill',
  'Read',
  'Write',
  'Edit',
  'ToolSearch',
  'Glob',
  'Grep',
  'Bash(git:*)',
  'Bash(node:*)',
  'Bash(cp:*)',
  'Bash(mkdir:*)',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(date:*)',
  'mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql',
  'mcp__claude_ai_Atlassian__getJiraIssue',
  'mcp__claude_ai_Atlassian__getAccessibleAtlassianResources',
].join(',');

/**
 * `model` để trống = dùng model mặc định của phiên. Đặt được vì radar chạy 20 lượt/ngày:
 * đo thật 13/8 một lượt mặc định tốn ~$1.0, nên đây là nút vặn chi phí duy nhất đáng có
 * (hạ nhịp là mất độ nhạy, còn hạ model thì việc của delta phần lớn là cơ học).
 */
export function buildArgs(prompt = '/daily delta', model = null) {
  const args = ['-p', prompt, '--allowedTools', ALLOWED_TOOLS, '--output-format', 'json'];
  return model ? [...args, '--model', model] : args;
}

const readJSON = (p, fb) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fb;
  }
};
const todayStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Gọi claude thật — tách riêng để test tiêm bản giả vào, không phải đốt token mỗi lần chạy test */
function realClaude(root, timeoutMs, model = null) {
  const t0 = Date.now();
  try {
    const out = execFileSync('claude', buildArgs('/daily delta', model), {
      cwd: root,
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const j = JSON.parse(out);
    return {
      ok: !j.is_error,
      ms: j.duration_ms ?? Date.now() - t0,
      costUsd: j.total_cost_usd ?? null,
      err: j.is_error ? String(j.result || '').slice(0, 500) : null,
    };
  } catch (err) {
    // stdout của claude vẫn đáng giá khi nó exit ≠ 0 (chứa lý do thật, vd hết hạn đăng nhập)
    const detail = String(err.stdout || '') + ' ' + err.message;
    return { ok: false, ms: Date.now() - t0, costUsd: null, err: detail.trim().slice(0, 500) };
  }
}

function osaNotify(title, message) {
  try {
    execFileSync('osascript', [
      '-e',
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ]);
  } catch {
    // Báo là best-effort tuyệt đối: chưa cấp quyền Notifications không được làm hỏng lượt quét.
  }
}

const MSG = {
  change: (r) =>
    'Có thay đổi mới: ' +
    Object.entries(r.newRows)
      .map(([k, v]) => `${v} dòng ${k}`)
      .join(' · '),
  auth: () => 'Phiên Claude hết hạn — radar đang quét ra trắng. Chạy /login.',
  dead: (r) => `Radar hỏng ${r.streak} lượt liên tiếp: ${String(r.err).slice(0, 120)}`,
};

/**
 * MỘT lượt. Trả về đúng dòng sẽ ghi vào sổ (test đọc thẳng giá trị trả về, không phải parse
 * file). `runClaude`/`notify` tiêm được để test không gọi ra ngoài.
 */
export function runTick({ root, now = new Date(), argv = [], runClaude, notify = osaNotify } = {}) {
  const cfg = { ...DEFAULTS, ...(readJSON(path.join(root, 'config.json'), {}).radar || {}) };
  const sock = path.join(root, 'history', 'radar.jsonl');
  const lock = path.join(root, '.locks', 'radar.lock');
  const stamp = () => new Date(now).toISOString();
  const write = (row) => {
    fs.mkdirSync(path.dirname(sock), { recursive: true });
    fs.appendFileSync(sock, JSON.stringify(row) + '\n');
    return row;
  };

  // ① Ngoài khung giờ thì im lặng TUYỆT ĐỐI — ghi sổ ở đây là 300 dòng rác mỗi ngày, làm loãng
  // đúng cái sổ mình dựng lên để soi lúc có sự cố.
  const gate = shouldRunNow(now, cfg);
  if (!gate.run && !argv.includes('--force')) return { at: stamp(), skipped: gate.why };

  // ② + ③ thì CÓ ghi sổ: bỏ lượt là chuyện đáng truy ngược khi user hỏi "sao 2 tiếng không quét?"
  if (lockState(lock, Number(now), cfg.lockStaleMin * 60e3) === 'busy') {
    return write({ at: stamp(), skipped: 'locked' });
  }

  const watched = [path.join(root, 'state.json'), path.join(root, 'boards', todayStr(now) + '.md')];
  if (humanBusy(watched, Date.now(), cfg.graceMin * 60e3)) return write({ at: stamp(), skipped: 'human' });

  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, atMs: Number(now) }));
  try {
    const files = {
      issues: path.join(root, 'history/issues.jsonl'),
      phases: path.join(root, 'history/phases.jsonl'),
    };
    const snap = () => Object.fromEntries(Object.entries(files).map(([k, p]) => [k, countLines(p)]));
    const before = snap();
    if (argv.includes('--dry')) return { at: stamp(), skipped: 'dry' };

    const res = (runClaude || (() => realClaude(root, cfg.timeoutMin * 60e3, cfg.model || null)))();
    const { changed, newRows } = diffCounts(before, snap());
    fs.mkdirSync(path.dirname(sock), { recursive: true });
    if (!fs.existsSync(sock)) fs.writeFileSync(sock, ''); // lượt đầu tiên: chưa có sổ để đọc
    const rows = fs
      .readFileSync(sock, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const row = write({
      at: stamp(),
      ok: res.ok,
      skipped: null,
      ms: res.ms,
      changed,
      newRows,
      costUsd: res.costUsd,
      err: res.err,
    });
    const streak = failStreak([...rows, row]);
    const { send, kind } = decideNotify({ ok: res.ok, err: res.err || '', changed, streak });
    if (send) notify('Radar — agent-auto', MSG[kind]({ ...row, streak }));
    return row;
  } catch (err) {
    return write({
      at: stamp(),
      ok: false,
      skipped: null,
      changed: false,
      newRows: {},
      err: String(err.message).slice(0, 500),
    });
  } finally {
    // Nhả lock kể cả khi nổ giữa chừng — không thì phải đợi hết hạn stale mới có lượt kế tiếp.
    try {
      fs.unlinkSync(lock);
    } catch {
      // lock đã bị dọn tay hoặc chưa kịp tạo — không phải lỗi
    }
  }
}

// Chỉ chạy khi gọi thẳng từ CLI (import trong test thì không được tự bắn 1 lượt thật)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const row = runTick({ root: path.resolve(import.meta.dirname, '..'), argv: process.argv.slice(2) });
  console.log(JSON.stringify(row));
}
