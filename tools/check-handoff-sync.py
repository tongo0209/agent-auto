#!/usr/bin/env python3
"""check-handoff-sync — so text 2 nửa bàn giao `Promotion/` ↔ `mainsite/` trong gt-promotion-template.

Cùng một trang nằm ở 2 thư mục (R-HO-5); người này sửa nửa này, đồng nghiệp sửa nửa kia, không ai
soát cặp. GW-525 phân kỳ 2 lần trong 2 tuần: marker `data-tt-boost-line` chỉ có ở `mainsite/`, rồi
số lượng quà `Chòm Sao Tiểu Hùng ×20` (Promotion) ↔ `x1` (mainsite). Message commit không đáng tin
(`update gunny pc` mà sửa folder LAN) nên phải so bằng máy.

Hai nửa KHÔNG giống từng byte theo thiết kế: `Promotion/` mang hook `pm__` của platform, `mainsite/`
có block riêng, block xếp thứ tự khác, thẻ ngắt đoạn đặt khác chỗ (đo 26 request ngày 9/9/2026). Vì vậy
chỉ so CHỮ NHÌN THẤY theo từ (bỏ markup), căn 2 dòng chữ bằng difflib: chỗ lệch có chữ ở cả 2 bên in
thành cặp "P ↔ M"; chỗ chỉ 1 bên có thì thử ghép với chỗ chỉ-bên-kia gần giống (block bị dời đi rồi
sửa) — ghép ra mà chữ y nhau nghĩa là chỉ đổi thứ tự, không tính lệch.

    python3 tools/check-handoff-sync.py [<gt-promotion-root>] [--folder <game>/<request>]

Root mặc định đọc `config.json` → `repos["gt-promotion-template"]`.
Exit 0 = mọi cặp khớp · 1 = có lệch · 2 = sai tham số / không thấy root.
"""
import argparse
import difflib
import html
import json
import os
import re
import sys
from collections import namedtuple

HERE = os.path.dirname(os.path.abspath(__file__))
GLUE_WORDS = 3
NEAR = 0.6
SHOW_MAX = 12
CUT = 70

Compare = namedtuple("Compare", "pairs only_p only_m differs")
Folders = namedtuple("Folders", "pairs only_p only_m")


def tokens(src):
    s = re.sub(r"<(script|style)\b.*?</\1\s*>", " ", src, flags=re.S | re.I)
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s).split()


def hunks(a, b):
    out, cur = [], None
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag != "equal":
            cur = [cur[0], i2, cur[2], j2] if cur else [i1, i2, j1, j2]
        elif cur and i2 - i1 > GLUE_WORDS:
            out.append(cur)
            cur = None
    if cur:
        out.append(cur)
    return out


def compare(a, b):
    pairs, only_a, only_b = [], [], []
    for i1, i2, j1, j2 in hunks(a, b):
        pa, pb = " ".join(a[i1:i2]), " ".join(b[j1:j2])
        if pa and pb:
            pairs.append((pa, pb))
        elif pa:
            only_a.append(pa)
        else:
            only_b.append(pb)
    rest_a, rest_b = [], list(only_b)
    for s in only_a:
        hit = difflib.get_close_matches(s, rest_b, n=1, cutoff=NEAR)
        if not hit:
            rest_a.append(s)
            continue
        rest_b.remove(hit[0])
        if hit[0] != s:
            pairs.append((s, hit[0]))
    return Compare(pairs, rest_a, rest_b, bool(pairs or rest_a or rest_b))


def focus(pa, pb):
    a, b = pa.split(), pb.split()
    k = 0
    while k < min(len(a), len(b)) and a[k] == b[k]:
        k += 1
    start = max(0, k - 3)
    lead = "…" if start else ""
    return lead + short(" ".join(a[start:])), lead + short(" ".join(b[start:]))


def stem(name):
    return os.path.splitext(name)[0]


def pair_files(p_names, m_names):
    pairs, rest_p, rest_m = [], [], list(m_names)
    for name in p_names:
        if name in rest_m:
            pairs.append((name, name))
            rest_m.remove(name)
        else:
            rest_p.append(name)
    still_p = []
    for name in rest_p:
        hit = difflib.get_close_matches(stem(name), [stem(m) for m in rest_m], n=1, cutoff=NEAR)
        if hit:
            m_name = next(m for m in rest_m if stem(m) == hit[0])
            pairs.append((name, m_name))
            rest_m.remove(m_name)
        else:
            still_p.append(name)
    if len(still_p) == 1 and len(rest_m) == 1:
        pairs.append((still_p[0], rest_m[0]))
        return pairs, [], []
    return pairs, still_p, rest_m


def html_files(folder):
    out = []
    for dirpath, _, names in os.walk(folder):
        for n in names:
            if n.lower().endswith((".html", ".htm")):
                out.append(os.path.relpath(os.path.join(dirpath, n), folder))
    return sorted(out)


def find_folders(root):
    pairs, only_p, only_m = [], 0, 0
    for game in sorted(os.listdir(root)):
        game_dir = os.path.join(root, game)
        if game.startswith(".") or not os.path.isdir(game_dir):
            continue
        for req in sorted(os.listdir(game_dir)):
            has_p = os.path.isdir(os.path.join(game_dir, req, "Promotion"))
            has_m = os.path.isdir(os.path.join(game_dir, req, "mainsite"))
            if has_p and has_m:
                pairs.append(f"{game}/{req}")
            elif has_p:
                only_p += 1
            elif has_m:
                only_m += 1
    return Folders(pairs, only_p, only_m)


def default_root():
    cfg = os.path.join(HERE, "..", "config.json")
    if not os.path.isfile(cfg):
        sys.exit("✗ thiếu config.json — truyền thẳng đường dẫn gt-promotion-template làm tham số")
    with open(cfg, encoding="utf-8") as f:
        return json.load(f)["repos"]["gt-promotion-template"]


def read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def short(s):
    return s if len(s) <= CUT else s[: CUT - 1] + "…"


def show_list(label, items):
    if not items:
        return
    shown = " · ".join(f'"{short(s)}"' for s in items[:SHOW_MAX])
    more = f" … +{len(items) - SHOW_MAX}" if len(items) > SHOW_MAX else ""
    print(f"    {label}: {shown}{more}")


def check_folder(root, rel):
    p_dir = os.path.join(root, rel, "Promotion")
    m_dir = os.path.join(root, rel, "mainsite")
    pairs, un_p, un_m = pair_files(html_files(p_dir), html_files(m_dir))
    print(f"── {rel}")
    dirty = False
    for p_name, m_name in pairs:
        r = compare(tokens(read(os.path.join(p_dir, p_name))), tokens(read(os.path.join(m_dir, m_name))))
        label = p_name if p_name == m_name else f"{p_name} ↔ {m_name}"
        if not r.differs:
            print(f"  ✓ {label} — khớp")
            continue
        dirty = True
        print(f"  ✗ {label} — {len(r.pairs)} cặp lệch · {len(r.only_p)} chỉ Promotion/ · {len(r.only_m)} chỉ mainsite/")
        for pa, pb in r.pairs[:SHOW_MAX]:
            fa, fb = focus(pa, pb)
            print(f'    "{fa}"  ↔  "{fb}"')
        if len(r.pairs) > SHOW_MAX:
            print(f"    … +{len(r.pairs) - SHOW_MAX} cặp")
        show_list("chỉ Promotion/", r.only_p)
        show_list("chỉ mainsite/", r.only_m)
    if un_p or un_m:
        print(f"  ? chưa ghép được — Promotion/: {', '.join(un_p) or '—'} · mainsite/: {', '.join(un_m) or '—'}")
    return dirty


def main(argv):
    ap = argparse.ArgumentParser(description="So text 2 nửa Promotion/ ↔ mainsite/ của gt-promotion-template")
    ap.add_argument("root", nargs="?", help="thư mục gt-promotion-template (mặc định: config.json → repos)")
    ap.add_argument("--folder", help="chỉ so 1 request: <game>/<request>")
    args = ap.parse_args(argv)
    root = args.root or default_root()
    if not os.path.isdir(root):
        print(f"✗ không thấy root: {root}", file=sys.stderr)
        return 2
    folders = find_folders(root)
    if args.folder and args.folder not in folders.pairs:
        print(f"✗ {args.folder} không có đủ 2 nửa Promotion/ + mainsite/", file=sys.stderr)
        return 2
    targets = [args.folder] if args.folder else folders.pairs
    dirty = [rel for rel in targets if check_folder(root, rel)]
    print(f"\n{len(targets)} request so · {len(dirty)} lệch · "
          f"{folders.only_m} chỉ có mainsite/ + {folders.only_p} chỉ có Promotion/ không so (không có bản sao)")
    return 1 if dirty else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
