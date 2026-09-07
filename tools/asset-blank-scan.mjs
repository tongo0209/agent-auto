// Dò asset "trắng trơn / gần như không có nội dung" — loại mà naturalWidth>0 nên không bị tính là ảnh vỡ.
// Dùng: node asset-blank-scan.mjs <thư mục assets>
import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { execFileSync } from 'child_process';

const root = process.argv[2] || '.';
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase())) files.push(p);
  }
})(root);

const py = `
import sys
from PIL import Image
import numpy as np
for p in sys.argv[1:]:
    try:
        im = Image.open(p).convert('RGBA'); a = np.array(im)
        vis = a[:, :, 3] > 16
        if vis.sum() < 16: print(f'RỖNG|{p}|alpha gần như trống'); continue
        rgb = a[:, :, :3][vis].astype(float)
        sd = rgb.std(0).mean()
        if sd < 6: print(f'TRƠN|{p}|độ lệch màu {sd:.2f} (gần như 1 màu) {im.size[0]}x{im.size[1]}')
    except Exception as e: print(f'LỖI|{p}|{e}')
`;
const out = execFileSync('python3', ['-c', py, ...files], { encoding: 'utf8', maxBuffer: 1 << 26 });
const rows = out.trim() ? out.trim().split('\n') : [];
console.log(`quét ${files.length} ảnh · nghi vấn ${rows.length}`);
for (const r of rows) { const [k, p, why] = r.split('|'); console.log(`  [${k}] ${p} — ${why}`); }
process.exit(rows.length ? 1 : 0);
