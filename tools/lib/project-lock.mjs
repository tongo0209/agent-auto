// Đường dẫn file dự án của một campaign cdn-source + đọc mục "1. Khoá" (gameplay/type/ref).
// File dự án nằm ở agent-auto/projects/<game>/<slug>.md — gitignore vì repo public.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_AUTO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CAMPAIGN = /\/products\/([^/]+)\/landing\/([^/]+)(?:\/|$)/;
const LOCK_KEYS = ['gameplay', 'type', 'ref'];

export function projectsRoot() {
  return process.env.PM_PROJECTS_DIR || join(AGENT_AUTO, 'projects');
}

export function campaignOf(fileOrDir) {
  const m = resolve(fileOrDir).match(CAMPAIGN);
  return m ? { game: m[1], slug: m[2], dir: resolve(fileOrDir).slice(0, m.index + m[0].replace(/\/$/, '').length) } : null;
}

export function notePathFor(fileOrDir) {
  const c = campaignOf(fileOrDir);
  return c ? join(projectsRoot(), c.game, `${c.slug}.md`) : null;
}

export function readLock(notePath) {
  if (!notePath || !existsSync(notePath)) return null;
  const section = readFileSync(notePath, 'utf8').split(/^## 1\. Khoá\s*$/m)[1]?.split(/^## /m)[0] || '';
  const lock = Object.fromEntries(LOCK_KEYS.map((k) => [k, (section.match(new RegExp(`^- ${k}:\\s*(.+)$`, 'm'))?.[1] || '').trim()]));
  if (!lock.gameplay || lock.gameplay === 'CHƯA KHOÁ') return null;
  return lock;
}
