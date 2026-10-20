// Mọi tab claude của panel chạy kèm đoạn dặn ở panel-prompt.md; claude ở terminal ngoài không bị ảnh hưởng
import path from 'node:path';

export const PANEL_PROMPT = path.join(import.meta.dirname, 'panel-prompt.md');

export const shQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

export const panelClaude = (args = []) => ['claude', '--append-system-prompt', `"$(cat ${shQuote(PANEL_PROMPT)})"`, ...args.map(shQuote)].join(' ');

export function launchCommand({ cwd, args, env }) {
  const envPrefix = Object.entries(env).map(([k, v]) => `${k}=${shQuote(v)} `).join('');
  return `cd ${shQuote(cwd)} && ${envPrefix}${panelClaude(args)}`;
}
