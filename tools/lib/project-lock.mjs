// Đường dẫn file dự án của một campaign cdn-source + đọc mục "1. Khoá" (gameplay/type/ref/hooks-at).
// File dự án nằm ở agent-auto/projects/<game>/<slug>.md — gitignore vì repo public.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_AUTO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CAMPAIGN = /\/products\/([^/]+)\/landing\/([^/]+)(?:\/|$)/;
export const HOOKS_AT = ['handoff', 'source'];
export const HOOKS_AT_DEFAULT = 'handoff';

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

// File bàn giao (gt-promotion, Twig new-mainsite) không mang tên campaign → dò mục "2. Nơi code" của mọi note.
export function noteForAnyFile(file) {
  const direct = notePathFor(file);
  if (direct) return direct;
  const target = resolve(file);
  const root = projectsRoot();
  if (!existsSync(root)) return null;
  for (const game of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const name of readdirSync(join(root, game.name)).filter((n) => n.endsWith('.md'))) {
      const note = join(root, game.name, name);
      const places = readFileSync(note, 'utf8').split(/^## 2\. Nơi code\s*$/m)[1]?.split(/^## /m)[0] || '';
      const dirs = [...places.matchAll(/^- [^:]+:\s*(\/\S+)\s*$/gm)].map(([, d]) => resolve(d));
      if (dirs.some((d) => target === d || target.startsWith(d + sep))) return note;
    }
  }
  return null;
}

export function readLock(notePath) {
  if (!notePath || !existsSync(notePath)) return null;
  const section = readFileSync(notePath, 'utf8').split(/^## 1\. Khoá\s*$/m)[1]?.split(/^## /m)[0] || '';
  const field = (key) => (section.match(new RegExp(`^- ${key}:[ \\t]*(.+)$`, 'm'))?.[1] || '').trim();
  const gameplay = field('gameplay');
  if (!gameplay || gameplay === 'CHƯA KHOÁ') return null;
  return { gameplay, type: field('type'), ref: field('ref'), hooksAt: field('hooks-at') || HOOKS_AT_DEFAULT };
}
