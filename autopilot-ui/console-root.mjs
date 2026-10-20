// Bản thử ở worktree lab mượn console của repo chính: dùng chung node_modules và đọc dữ liệu thật
import path from 'node:path';
import { createRequire } from 'node:module';

export const CONSOLE = process.env.AUTOPILOT_CONSOLE_DIR || path.join(process.env.HOME, 'VNG', 'agent-auto', 'console');
export const consoleRequire = createRequire(path.join(CONSOLE, 'server', 'index.js'));
