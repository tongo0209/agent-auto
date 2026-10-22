#!/usr/bin/env python3
"""Self-test cho design-compare — ảnh tổng hợp, không cần browser."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "design-compare.py")
spec = importlib.util.spec_from_file_location("dc", TOOL)
dc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dc)

FAIL = []
TMP = tempfile.mkdtemp(prefix="dc-test-")


def eq(got, want, what):
    if got != want:
        FAIL.append(f"{what}\n    got  {got!r}\n    want {want!r}")


def image(name, size, boxes):
    im = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(im)
    for box in boxes:
        draw.rectangle(box, fill="red")
    path = os.path.join(TMP, name)
    im.save(path)
    return path


eq(dc.bands(1000, 400), [(0, 400), (400, 800), (800, 1000)], "dải phủ kín chiều cao, dải cuối ngắn hơn")
eq(dc.bands(400, 400), [(0, 400)], "vừa đúng 1 dải")

# design canvas 400 rộng, trang chụp ở viewport 200 ⇒ design thu 0.5; build thiếu khối đỏ ở nửa dưới
design = image("design.png", (400, 800), [(40, 40, 120, 120), (40, 600, 200, 700)])
shot = image("shot.png", (200, 400), [(20, 20, 60, 60)])
out = os.path.join(TMP, "out")
crops = dc.compare(design, shot, out, layout="stack", band=200)
eq([(c["y0"], c["y1"]) for c in crops], [(0, 200), (200, 400)], "dải tính theo toạ độ trang chụp")
eq(all(os.path.exists(c["file"]) for c in crops), True, "mỗi dải có file ảnh ghép")
eq(crops[1]["diff"] > crops[0]["diff"], True, "dải thiếu khối đỏ có diff cao hơn")
eq(Image.open(crops[0]["file"]).size, (200, 200 * 2 + dc.GAP), "stack: design trên, build dưới")

side = dc.compare(design, shot, os.path.join(TMP, "side"), layout="side", band=400)
eq(Image.open(side[0]["file"]).size, (200 * 2 + dc.GAP, 400), "side: design trái, build phải")

# ảnh chụp fullPage có thể dài hơn design đã thu (vùng thừa của wrapper) ⇒ chỉ so phần design phủ
long_shot = image("long.png", (200, 500), [(20, 20, 60, 60)])
eq(dc.compare(design, long_shot, os.path.join(TMP, "long"), band=400)[-1]["y1"], 400, "cắt theo chiều cao design")

# fullPage ở viewport 200 mà ảnh rộng 250 (phần tử chưa scale tràn ngang) ⇒ --width 200: design thu theo viewport, cắt bỏ phần thừa
wide_shot = image("wide.png", (250, 400), [(20, 20, 60, 60), (20, 300, 100, 350)])
wide = dc.compare(design, wide_shot, os.path.join(TMP, "wide"), band=400, width=200)
eq(Image.open(wide[0]["file"]).size, (200, 400 * 2 + dc.GAP), "width: thu design và cắt ảnh chụp theo bề rộng viewport")
eq(wide[0]["diff"] < 5, True, "width: khớp tỉ lệ thì diff thấp")

cli = subprocess.run([sys.executable, TOOL, "--design", design, "--shot", shot, "--out", os.path.join(TMP, "cli"), "--band", "200"],
                     capture_output=True, text=True)
eq(cli.returncode, 0, "CLI chạy được")
eq(len(json.loads(cli.stdout)["crops"]), 2, "CLI in JSON danh sách dải")

if FAIL:
    print("FAIL\n" + "\n".join(FAIL))
    sys.exit(1)
print("design-compare: tất cả test qua")
