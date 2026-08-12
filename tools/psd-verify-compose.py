#!/usr/bin/env python3
"""Ghép các PNG full-canvas vừa xuất theo z-order rồi so với PNG designer.

Đây là phép thử DUY NHẤT có giá trị: ảnh bóc ra chỉ "dùng được luôn" nếu dán lại
dựng đúng bản design. Xuất được file ≠ file đúng.

Dùng: verify-compose.py <design.png> <nhãn> <lop1.png> [lop2.png ...]
"""
import sys
import numpy as np
from PIL import Image

design = Image.open(sys.argv[1]).convert("RGB")
label = sys.argv[2]
W, H = design.size

canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for p in sys.argv[3:]:
    im = Image.open(p).convert("RGBA")
    if im.size != (W, H):
        print(f"  ⚠ {p} cỡ {im.size} ≠ canvas {(W,H)} — dán ở 0,0")
    canvas.alpha_composite(im, (0, 0))

flatw = Image.new("RGB", (W, H), (255, 255, 255))
flatw.paste(canvas, (0, 0), canvas.split()[-1])

a = np.asarray(flatw).astype(np.int16)
b = np.asarray(design).astype(np.int16)
d = np.abs(a - b).mean(axis=2)
print(f"{label:26s} mean={d.mean():6.3f}  p95={np.percentile(d,95):6.1f}  max={d.max():3.0f}  "
      f">8={(d>8).mean()*100:5.2f}%  >32={(d>32).mean()*100:5.2f}%")
out = f"vc-{label}"
flatw.save(f"{out}.png")
Image.fromarray(np.clip(d * 6, 0, 255).astype(np.uint8)).save(f"{out}-diff.png")
