// Bản thử ở worktree lab mượn console của repo chính: dùng chung node_modules và đọc dữ liệu thật
import path from 'node:path';
import { createRequire } from 'node:module';

const MAIN_REPO = path.join(process.env.HOME, 'VNG', 'agent-auto');
export const CONSOLE = process.env.AUTOPILOT_CONSOLE_DIR || path.join(MAIN_REPO, 'console');
// Console lấy từ worktree lab vẫn phải đọc dữ liệu thật — thư mục lab không có state/config/history
process.env.CONSOLE_DATA_ROOT ||= MAIN_REPO;
export const consoleRequire = createRequire(path.join(CONSOLE, 'server', 'index.js'));
