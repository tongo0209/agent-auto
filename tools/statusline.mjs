#!/usr/bin/env node
/**
 * Statusline cho mọi phiên Claude Code: cảnh báo mốc + hàng bug chờ duyệt hiện ngay trên
 * thanh trạng thái, khỏi phải mở console mới biết. Chạy mỗi lần harness vẽ lại thanh này nên
 * TUYỆT ĐỐI không được gọi git/mạng — chỉ đọc state.json rồi tính bằng hàm thuần.
 */
import fs from 'node:fs';
import path from 'node:path';
import { countPending, isWatched } from './bug-radar.mjs';
import alerts from '../console/server/lib/alerts.js';

const ROOT = path.resolve(import.meta.dirname, '..');

export function statusLine({ state, today, session = {} } = {}) {
  const safe = state && typeof state === 'object' ? state : { issues: {} };
  const dir = session.workspace?.current_dir || session.cwd || ROOT;
  const parts = [path.basename(dir)];

  const { verified, unverified } = countPending(safe);
  if (verified || unverified) parts.push(`🐞 ${verified} gật · ${unverified} cần mắt`);

  const watching = Object.values(safe.bugWatch || {}).filter(isWatched).length;
  if (watching) parts.push(`👀 ${watching} buglist`);

  const crits = alerts.buildAlerts(safe, today, {}, []).filter((a) => a.level === 'crit');
  if (crits.length) {
    const rest = crits.length > 1 ? ` +${crits.length - 1}` : '';
    parts.push(`⏰ ${crits[0].key} ${crits[0].text}${rest}`);
  }
  return parts.join('  ·  ');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const readAll = async () => {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return chunks.join('');
  };
  const parse = (raw, fb) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fb;
    }
  };
  const session = parse(await readAll(), {});
  const state = parse(fs.readFileSync(path.join(ROOT, 'state.json'), 'utf8'), null);
  process.stdout.write(statusLine({ state, today: new Date().toISOString().slice(0, 10), session }));
}
