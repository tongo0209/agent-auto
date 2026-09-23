#!/usr/bin/env python3
"""baked-text-guard — bắt lỗi CHỮ LỒNG CHỮ: text vừa bake trong ảnh, vừa render bằng HTML.

Lỗi này build PASS, console sạch, checker cũng qua — chỉ mắt người nhìn kỹ mới thấy hai lớp chữ
chồng nhau (thường lệch vài px nên trông như bóng đổ / chữ nhoè). Đã gặp ở GW-760: dòng subtitle
"Hoàn thành tân thủ và khảo sát trên server test" bake trong textmain*.png đồng thời được render
lại ở .header__sub, cả 4 ngôn ngữ.

Nguyên nhân gốc: spec liệt kê một chuỗi ở mục "render bằng HTML" trong khi job cắt ảnh cũng gom
layer chữ đó vào. Hai nguồn sự thật, không ai đối chiếu.

    python3 baked-text-guard.py --job <job.json|coords.json> [--job ...] --dist <thư mục dist>

--job nhận job psd-cut (đọc chữ từ PSD theo showPath), job figma-cut hoặc coords.json đời mới (đọc
`textInside` từng row, không cần PSD). Row/state tên "_…" bị bỏ qua (tấm tham chiếu, không phải ảnh giao).

Exit 0 = sạch · 1 = có chuỗi lồng 2 lớp · 2 = input thiếu field, không chấm đủ.
"""
import argparse
import glob
import html
import json
import os
import re
import sys

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


def show_keys(state):
    """Path của state → khoá "A/B" như index_tree sinh ra, nuốt cả 2 đời schema job.

    Job đời đầu ghi `show` là chuỗi sẵn; psd-plan nay ghi `showPath` là list segment (và
    `bakePath` cho leaf blend-lạ gửi nhờ nướng với nền — cũng góp pixel nên chữ trong đó
    vẫn nằm trong ảnh giao). Chỉ đọc `show` là tool chết KeyError trên mọi job mới.
    """
    raw = list(state.get("showPath") or state.get("show") or []) + list(state.get("bakePath") or [])
    keys = []
    for p in raw:
        if p == "*":
            continue
        keys.append("/".join(p) if isinstance(p, (list, tuple)) else p)
    return keys


def baked_strings(path):
    """→ (chuỗi đã bake, [vì sao không chấm đủ]). Thiếu field thì nói tên field, không chết KeyError."""
    data = json.load(open(path, encoding="utf-8"))
    rows = data if isinstance(data, list) else data.get("states") or data.get("assets")
    if not isinstance(rows, list):
        return set(), [f"{path}: không thấy states[] (job psd) hay assets[] (job figma / coords.json)"]
    rows = [r for r in rows if not r.get("name", "").startswith("_")]
    out = {t for r in rows for t in r.get("textInside") or []}
    need_psd = [r for r in rows if "textInside" not in r and show_keys(r)]
    no_text = [r.get("name", "?") for r in rows if "textInside" not in r and not show_keys(r)]
    problems = []
    if no_text:
        problems.append(f"{path}: {len(no_text)}/{len(rows)} row thiếu field 'textInside' (bản trim đời cũ): "
                        f"{', '.join(no_text[:5])} — chạy lại trim, hoặc đưa --job của psd-cut")
    if not need_psd:
        return out, problems
    psd = data.get("psd") if isinstance(data, dict) else None
    if not psd or not os.path.exists(psd):
        problems.append(f"{path}: {len(need_psd)} state cần đọc chữ từ PSD nhưng field 'psd' "
                        f"{'không có' if not psd else 'trỏ file không tồn tại: ' + psd}")
        return out, problems
    from psd_tools import PSDImage
    nodes = {}
    index_tree(PSDImage.open(psd), [], nodes)
    for state in need_psd:
        for key in show_keys(state):
            layer = nodes.get(key)
            if layer is None:
                problems.append(f"{path}: state \"{state.get('name', '?')}\" trỏ layer không có thật: {key}")
                continue
            out.update(texts_under(layer))
    return out, problems


def normalize(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip().lower()


def html_text_nodes(path):
    raw = open(path, encoding="utf-8").read()
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.S)
    return [n for n in (normalize(t) for t in re.split(r"<[^>]+>", raw)) if n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", "--coords", dest="inputs", action="append", required=True)
    ap.add_argument("--dist", required=True)
    ap.add_argument("--min-len", type=int, default=MIN_LEN)
    args = ap.parse_args()

    baked, problems = set(), []
    for path in args.inputs:
        strings, why = baked_strings(path)
        baked |= strings
        problems += why
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
    for why in problems:
        print(f"  ✗ không chấm đủ: {why}")
    if not hits:
        if problems:
            print("✗ KHÔNG CHẤM ĐỦ — input thiếu field, chưa được coi là sạch")
            return 2
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
