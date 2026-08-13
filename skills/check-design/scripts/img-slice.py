#!/usr/bin/env python3
"""Cắt ảnh design dài thành lát đọc được, giữ đường về tọa độ ảnh GỐC.

Vì sao: design landing hay là ảnh 2000×5300. Đọc thẳng vừa tốn context vừa mất nét chi tiết
(nút, popup, chữ nhỏ) — mà chi tiết mới là thứ /check-design cần nhìn. Cắt lát + hạ bề rộng
xong vẫn phải truy ngược được "cái này nằm ở y≈2400 của ảnh gốc" để ghi bằng chứng.

Dùng: img-slice.py <ảnh> [--outdir DIR] [--max-width 900] [--slice-h 1400] [--overlap 100] [--json]
"""
import argparse
import json
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # design PC dài 5000px+ vượt ngưỡng cảnh báo mặc định


def slice_image(src: Path, outdir: Path, max_width: int, slice_h: int, overlap: int):
    img = Image.open(src)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    scale = min(1.0, max_width / w)
    if scale < 1.0:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    W, H = img.size

    outdir.mkdir(parents=True, exist_ok=True)
    stem = src.stem.replace(" ", "-")
    slices, top, idx = [], 0, 1
    step = max(1, slice_h - overlap)
    while True:
        bottom = min(top + slice_h, H)
        out = outdir / f"{stem}-{idx:02d}.jpg"
        img.crop((0, top, W, bottom)).save(out, "JPEG", quality=82)
        slices.append({
            "file": str(out),
            "yTop": top, "yBottom": bottom,
            "yTopSrc": round(top / scale), "yBottomSrc": round(bottom / scale),
        })
        if bottom >= H:
            break
        top += step
        idx += 1
    return {"src": str(src), "size": [w, h], "scale": round(scale, 4), "slices": slices}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--outdir", default=None)
    ap.add_argument("--max-width", type=int, default=900)
    ap.add_argument("--slice-h", type=int, default=1400)
    ap.add_argument("--overlap", type=int, default=100)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    src = Path(a.image)
    outdir = Path(a.outdir) if a.outdir else src.parent / "_slices"
    res = slice_image(src, outdir, a.max_width, a.slice_h, a.overlap)
    if a.json:
        print(json.dumps(res, ensure_ascii=False))
    else:
        print(f"{src.name}: {res['size'][0]}x{res['size'][1]} → {len(res['slices'])} lát trong {outdir}")
        for s in res["slices"]:
            print(f"  {Path(s['file']).name}  y gốc {s['yTopSrc']}–{s['yBottomSrc']}")


if __name__ == "__main__":
    main()
