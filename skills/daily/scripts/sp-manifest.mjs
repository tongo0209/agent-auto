import { readFileSync } from "node:fs";
import { basename } from "node:path";

/* File ẩn (.DS_Store) scan local luôn bỏ, file 0 byte là placeholder designer upload dở — không có gì để tải.
 * Giữ 2 loại này trong tập so khớp thì coverage không bao giờ ĐỦ. */
export function loadManifest(manPath) {
  const man = JSON.parse(readFileSync(manPath, "utf8"));
  const visible = man.files.filter(f => !basename(f.rel).startsWith("."));
  const emptyAtSource = visible.filter(f => f.length === 0);
  return { ...man, files: visible.filter(f => f.length > 0), emptyAtSource };
}
