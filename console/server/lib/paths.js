const path = require('path');
const fs = require('fs');

const HOME = process.env.HOME;
const CONSOLE_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_AUTO = path.resolve(CONSOLE_ROOT, '..');
const VNG_ROOT = path.join(HOME, 'VNG');
// Worktree lab chỉ có code — dữ liệu thật (state, config, history, boards…) nằm ở repo chính
const DATA_ROOT = process.env.CONSOLE_DATA_ROOT ? path.resolve(process.env.CONSOLE_DATA_ROOT) : AGENT_AUTO;

/** Trỏ state/config sang cảnh dựng sẵn (console/fixtures) để kiểm cảnh báo bằng máy */
const overridable = (envName, realPath) =>
  process.env[envName] ? path.resolve(process.env[envName]) : realPath;

module.exports = {
  HOME,
  CONSOLE_ROOT,
  AGENT_AUTO,
  DATA_ROOT,
  VNG_ROOT,
  DIST: path.join(CONSOLE_ROOT, 'dist'),
  // máy cài ngoài ~/VNG thì rơi về AGENT_AUTO — không có fallback là pty chết, mất tab terminal
  PTY_CWD: fs.existsSync(VNG_ROOT) ? VNG_ROOT : AGENT_AUTO,
  /** Chỉ cho phép mở Finder/VS Code trong các gốc này */
  OPEN_WHITELIST: [VNG_ROOT, AGENT_AUTO],
  file: {
    config: overridable('CONSOLE_CONFIG', path.join(DATA_ROOT, 'config.json')),
    state: overridable('CONSOLE_STATE', path.join(DATA_ROOT, 'state.json')),
    metrics: path.join(DATA_ROOT, 'knowledge', 'metrics.jsonl'),
    lessons: path.join(DATA_ROOT, 'knowledge', 'lessons.md'),
    months: path.join(DATA_ROOT, 'history', 'months.json'),
    /** Vòng học: 1 dòng mỗi lần phase của 1 ticket đổi (skill ghi + console tự quan sát) */
    phases: overridable('CONSOLE_PHASES', path.join(DATA_ROOT, 'history', 'phases.jsonl')),
    issues: path.join(DATA_ROOT, 'history', 'issues.jsonl'),
    /** Log alert crit đã nhắc qua notification macOS — chống spam lặp trong 12h (lib/notify.js) */
    notified: path.join(DATA_ROOT, 'history', 'notified.jsonl'),
    snooze: overridable('CONSOLE_SNOOZE', path.join(DATA_ROOT, 'history', 'snooze.json')),
    /** Sổ radar nền: 1 dòng mỗi lượt tick (tools/radar-tick.mjs ghi, console chỉ đọc) */
    radar: path.join(DATA_ROOT, 'history', 'radar.jsonl'),
  },
  dir: {
    boards: path.join(DATA_ROOT, 'boards'),
    tasks: path.join(DATA_ROOT, 'tasks'),
    designs: path.join(DATA_ROOT, 'designs'),
    /** Báo cáo fe-gate theo ticket (tools/fe-gate.mjs --json ghi vào đây) */
    gates: path.join(DATA_ROOT, 'knowledge', 'gates'),
    backups: overridable('CONSOLE_BACKUPS', path.join(DATA_ROOT, '.backups')),
  },
};
