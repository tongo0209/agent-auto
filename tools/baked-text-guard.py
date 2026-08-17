#!/usr/bin/env python3
"""baked-text-guard — bắt lỗi CHỮ LỒNG CHỮ: text vừa bake trong ảnh, vừa render bằng HTML.

Lỗi này build PASS, console sạch, checker cũng qua — chỉ mắt người nhìn kỹ mới thấy hai lớp chữ
chồng nhau (thường lệch vài px nên trông như bóng đổ / chữ nhoè). Đã gặp ở GW-760: dòng subtitle
"Hoàn thành tân thủ và khảo sát trên server test" bake trong textmain*.png đồng thời được render
lại ở .header__sub, cả 4 ngôn ngữ.

Nguyên nhân gốc: spec liệt kê một chuỗi ở mục "render bằng HTML" trong khi job cắt ảnh cũng gom
layer chữ đó vào. Hai nguồn sự thật, không ai đối chiếu.

    python3 baked-text-guard.py --job <job.json> [--job ...] --dist <thư mục dist>

--job = chính file job đã đưa cho psd-export.py, nên danh sách "đã bake" luôn khớp ảnh thật,
không phải khai lại bằng tay. State "_control" bị bỏ qua (nó bật mọi layer, không phải ảnh giao).

Exit 0 = sạch · 1 = có chuỗi lồng 2 lớp.
"""
import argparse
import glob
import html
import json
import os
import re
import sys

from psd_tools import PSDImage

MIN_LEN = 12
CONTAIN_RATIO = 0.6


def index_tree(node, name_path, nodes):
    """Khoá đường dẫn tên → layer, đánh #i khi trùng tên cùng cấp (giống psd-export.py)."""
    for i, lyr in enumerate(node):
        key = "/".join(name_path + [lyr.name])
        if key in nodes:
            key = "/".join(name_path + [f"{lyr.name}#{i}"])
        nodes[key] = lyr
        if lyr.is_group():
            index_tree(lyr, name_path + [lyr.name], nodes)


def texts_under(layer):
    if layer.kind == "type":
        yield layer.text or ""
    if layer.is_group():
        for child in layer:
            yield from texts_under(child)


def baked_strings(job_path):
    job = json.load(open(job_path, encoding="utf-8"))
    nodes = {}
    index_tree(PSDImage.open(job["psd"]), [], nodes)
    out = set()
    for state in job["states"]:
        if state["name"].startswith("_"):
            continue
        for path in state["show"]:
            if path == "*":
                continue
            layer = nodes.get(path)
            if layer is None:
                print(f"  ⚠ job trỏ layer không có thật: {path}", file=sys.stderr)
                continue
            out.update(texts_under(layer))
    return out


def normalize(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip().lower()


def html_text_nodes(path):
    raw = open(path, encoding="utf-8").read()
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.S)
    return [n for n in (normalize(t) for t in re.split(r"<[^>]+>", raw)) if n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", action="append", required=True)
    ap.add_argument("--dist", required=True)
    ap.add_argument("--min-len", type=int, default=MIN_LEN)
    args = ap.parse_args()

    baked = set()
    for job in args.job:
        baked |= baked_strings(job)
    baked = {normalize(b) for b in baked}
    baked = {b for b in baked if len(b) >= args.min_len}

    pages = sorted(glob.glob(os.path.join(args.dist, "*.html")))
    if not pages:
        print(f"✗ không thấy file .html nào trong {args.dist}")
        return 1

    hits = []
    for page in pages:
        for node in html_text_nodes(page):
            for b in baked:
                if b in node and len(b) / len(node) >= CONTAIN_RATIO:
                    hits.append((os.path.basename(page), b, node))

    print(f"baked-text-guard: {len(baked)} chuỗi đã bake · {len(pages)} trang")
    if not hits:
        print("✓ PASS — không có chuỗi nào vừa bake vừa render HTML")
        return 0

    print(f"✗ FAIL — {len(hits)} chỗ chữ lồng chữ:")
    for page, b, node in hits:
        print(f"  [{page}] bake: \"{b[:70]}\"")
        print(f"           HTML: \"{node[:70]}\"")
    print("\nSửa: chọn ĐÚNG MỘT tầng cho mỗi chuỗi — gỡ khỏi HTML, hoặc cắt lại ảnh không kèm layer chữ đó.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
