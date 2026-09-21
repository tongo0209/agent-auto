/**
 * Hợp nhất-lúc-ghi cho `state.json` — ba đường cùng ghi một file: radar nền (lượt kéo dài nhiều
 * phút), CLI `bug-radar.mjs`, và console. Ai cũng đọc sớm rồi ghi cả file lúc muộn, nên bản ghi
 * sau xoá mất thao tác bật/tắt theo dõi của user (lost update, đo thật 21/9: follow 4 → 1).
 *
 * Luật chung: chỉ ghi phần MÌNH đã đổi so với bản đã đọc (`base`), phần còn lại lấy theo bản trên
 * đĩa NGAY LÚC GHI. Sở hữu trường được suy ra từ "ai đổi nó", không phải danh sách rải 3 file.
 */
import fs from 'node:fs';

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** base = bản đã đọc · mine = bản mình sửa · theirs = bản trên đĩa lúc ghi. */
export function merge3(base = {}, mine = {}, theirs = {}) {
  const out = { ...theirs };
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine)])) {
    if (!(key in mine)) {
      if (key in base) delete out[key];
      continue;
    }
    if (same(mine[key], base[key])) continue;
    if (isPlain(mine[key]) && isPlain(theirs[key])) {
      out[key] = merge3(isPlain(base[key]) ? base[key] : {}, mine[key], theirs[key]);
    } else {
      out[key] = mine[key];
    }
  }
  return out;
}

export function readState(statePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Đọc lại đĩa ngay trước khi ghi, hợp nhất, ghi qua file tạm rồi rename (reader không bao giờ
 * thấy file nửa vời). File trên đĩa hỏng/mất thì lấy `base` làm nền — thà giữ bản mình còn hơn ném.
 */
export function writeMerged(statePath, base, mine) {
  const merged = merge3(base, mine, readState(statePath, base));
  const tmp = `${statePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n');
  fs.renameSync(tmp, statePath);
  return merged;
}
