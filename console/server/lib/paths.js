const path = require('path');

const HOME = process.env.HOME;
const CONSOLE_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_AUTO = path.resolve(CONSOLE_ROOT, '..');
const VNG_ROOT = path.join(HOME, 'VNG');

module.exports = {
  HOME,
  CONSOLE_ROOT,
  AGENT_AUTO,
  VNG_ROOT,
  DIST: path.join(CONSOLE_ROOT, 'dist'),
  PTY_CWD: VNG_ROOT,
  /** Chỉ cho phép mở Finder/VS Code trong các gốc này */
  OPEN_WHITELIST: [VNG_ROOT, AGENT_AUTO],
  file: {
    config: path.join(AGENT_AUTO, 'config.json'),
    state: path.join(AGENT_AUTO, 'state.json'),
    metrics: path.join(AGENT_AUTO, 'knowledge', 'metrics.jsonl'),
    lessons: path.join(AGENT_AUTO, 'knowledge', 'lessons.md'),
    months: path.join(AGENT_AUTO, 'history', 'months.json'),
    /** Vòng học: 1 dòng mỗi lần phase của 1 ticket đổi (skill ghi + console tự quan sát) */
    phases: path.join(AGENT_AUTO, 'history', 'phases.jsonl'),
    issues: path.join(AGENT_AUTO, 'history', 'issues.jsonl'),
    /** Log alert crit đã nhắc qua notification macOS — chống spam lặp trong 12h (lib/notify.js) */
    notified: path.join(AGENT_AUTO, 'history', 'notified.jsonl'),
    /** Sổ radar nền: 1 dòng mỗi lượt tick (tools/radar-tick.mjs ghi, console chỉ đọc) */
    radar: path.join(AGENT_AUTO, 'history', 'radar.jsonl'),
  },
  dir: {
    boards: path.join(AGENT_AUTO, 'boards'),
    tasks: path.join(AGENT_AUTO, 'tasks'),
    designs: path.join(AGENT_AUTO, 'designs'),
    /** Báo cáo fe-gate theo ticket (tools/fe-gate.mjs --json ghi vào đây) */
    gates: path.join(AGENT_AUTO, 'knowledge', 'gates'),
    backups: path.join(AGENT_AUTO, '.backups'),
  },
};
