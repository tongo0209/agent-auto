#!/usr/bin/env python3
"""Ghép ảnh design cạnh ảnh chụp bản build theo từng dải phủ kín trang, để mắt so (Lớp 2 của ui-check).

design-compare.py --design <design.png> --shot <fullpage.png> --out <dir> [--width <viewport>] [--layout stack|side] [--band N]
Design được thu về bề rộng viewport (canvas 2000 chụp ở 1920 ⇒ ×0.96); fullPage có thể rộng hơn viewport nên luôn truyền --width. In JSON {"crops":[{file,y0,y1,diff}]},
diff = chênh lệch xám trung bình 0–255 để biết dải nào cần nhìn kỹ — KHÔNG thay cho việc mở từng ảnh.
"""
import argparse
import json
import os

from PIL import Image, ImageChops, ImageStat

GAP = 8
MAX_OUT_WIDTH = 1600


def bands(height, band):
    return [(y, min(y + band, height)) for y in range(0, height, band)]


def mean_diff(a, b):
    small = (max(1, a.width // 8), max(1, a.height // 8))
    return round(ImageStat.Stat(ImageChops.difference(a.convert("L").resize(small), b.convert("L").resize(small))).mean[0], 1)


def pair(a, b, layout):
    if layout == "side":
        out = Image.new("RGB", (a.width * 2 + GAP, a.height), "white")
        out.paste(a, (0, 0))
        out.paste(b, (a.width + GAP, 0))
    else:
        out = Image.new("RGB", (a.width, a.height * 2 + GAP), "white")
        out.paste(a, (0, 0))
        out.paste(b, (0, a.height + GAP))
    if out.width > MAX_OUT_WIDTH:
        out = out.resize((MAX_OUT_WIDTH, round(out.height * MAX_OUT_WIDTH / out.width)))
    return out


def compare(design_path, shot_path, out_dir, layout="stack", band=600, width=None):
    shot = Image.open(shot_path).convert("RGB")
    if width:
        shot = shot.crop((0, 0, min(width, shot.width), shot.height))
    design = Image.open(design_path).convert("RGB")
    design = design.resize((shot.width, round(design.height * shot.width / design.width)))
    height = min(design.height, shot.height)
    os.makedirs(out_dir, exist_ok=True)
    name = os.path.splitext(os.path.basename(shot_path))[0]
    crops = []
    for i, (y0, y1) in enumerate(bands(height, band)):
        a = design.crop((0, y0, shot.width, y1))
        b = shot.crop((0, y0, shot.width, y1))
        file = os.path.join(out_dir, f"{name}-{i + 1:02d}.png")
        pair(a, b, layout).save(file)
        crops.append({"file": file, "y0": y0, "y1": y1, "diff": mean_diff(a, b)})
    return crops


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--design", required=True)
    ap.add_argument("--shot", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--layout", choices=["stack", "side"], default="stack")
    ap.add_argument("--band", type=int, default=600)
    ap.add_argument("--width", type=int, help="bề rộng viewport lúc chụp")
    args = ap.parse_args()
    print(json.dumps({"crops": compare(args.design, args.shot, args.out, args.layout, args.band, args.width)}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
