#!/usr/bin/env python3
"""Sinh + soát HTML bàn giao từ dist của cdn-source (R-HO-1,3,4,7,11).

  # soát file bàn giao đã có
  python3 tools/mk-handoff-html.py --check <file.html>
  # sinh từ dist rồi ghi ra file bàn giao
  python3 tools/mk-handoff-html.py --src <dist/index.html> --cdn <prefix> --out <file.html>

Ra đời 10/9/2026: bản index-cos.html bàn giao 8/9 có 64 `srcset` của <source> để
đường dẫn tương đối trong khi src/href đều tuyệt đối — platform resolve theo domain
của nó nên ảnh mobile trong <picture> 404 suốt 2 ngày. Cổng soát tay lúc đó chỉ grep
src|href nên báo "0 URL tương đối" oan.
"""
import argparse
import pathlib
import re
import sys

ABS = re.compile(r"^(https?:|//|#|data:|mailto:|javascript:)")
# data-link giữ tương đối: index-gno/index-zsm chạy production từ 11/8 cũng vậy
PREFIX_ATTRS = re.compile(r'\b(src|href|poster)="([^"]+)"')
SRCSET_ATTRS = re.compile(r'\b(srcset|imagesrcset)="([^"]+)"')
CSS_URL = re.compile(r"url\(([^)]+)\)")
KHUNG = ["MS__layer-loading", "layer-rotate", "MS__wrapper"]
HOOKS = {
    "pm__": r"pm__[a-zA-Z0-9_-]+",
    "MS__": r"MS__[a-zA-Z0-9_-]+",
    "MJ__": r"MJ__[a-zA-Z0-9_-]+",
    "id": r'\bid="([^"]+)"',
    "name": r'\bname="([^"]+)"',
    "data-*": r"\bdata-[a-z-]+",
}


def _srcset_urls(html):
    for m in SRCSET_ATTRS.finditer(html):
        for part in m.group(2).split(","):
            part = part.strip()
            if part:
                yield part.split(None, 1)[0]


def to_handoff(html, pref):
    def attr(m):
        a, v = m.group(1), m.group(2)
        return m.group(0) if ABS.match(v) else f'{a}="{pref}{v}"'

    def srcset(m):
        parts = []
        for part in m.group(2).split(","):
            part = part.strip()
            if not part:
                continue
            bits = part.split(None, 1)
            url = bits[0] if ABS.match(bits[0]) else pref + bits[0]
            parts.append(url + ((" " + bits[1]) if len(bits) > 1 else ""))
        return f'{m.group(1)}="{",".join(parts)}"'

    def cssurl(m):
        v = m.group(1).strip("'\"")
        return m.group(0) if ABS.match(v) else f"url({pref}{v})"

    out = PREFIX_ATTRS.sub(attr, html)
    out = SRCSET_ATTRS.sub(srcset, out)
    return CSS_URL.sub(cssurl, out)


def check(html, name):
    loi = []
    sot = [u for u in _srcset_urls(html) if not ABS.match(u)]
    if sot:
        loi.append(f"R-HO-1 {len(sot)} srcset tương đối, vd {sot[0]}")
    rel = [v for _, v in PREFIX_ATTRS.findall(html) if not ABS.match(v)]
    if rel:
        loi.append(f"R-HO-1 {len(rel)} src/href/poster tương đối, vd {rel[0]}")
    rel_css = [v for v in CSS_URL.findall(html) if not ABS.match(v.strip("'\""))]
    if rel_css:
        loi.append(f"R-HO-1 {len(rel_css)} url() tương đối, vd {rel_css[0]}")
    for k in KHUNG:
        if k not in html:
            loi.append(f"R-HO-3 thiếu khung {k}")
    lib = set(re.findall(r"libraryMainsite-(\d+\.\d+\.\d+)\.(?:css|js)", html))
    if len(lib) > 1:
        loi.append(f"R-HO-4 lẫn nhiều version lib: {sorted(lib)}")
    if "<any" in html:
        loi.append(f"R-HO-7 còn {html.count('<any')} placeholder <any>")
    print(f"{name}: " + ("✗ " + " · ".join(loi) if loi else "✓ đạt R-HO-1,3,4,7"))
    dem = {k: len(set(re.findall(p, html))) for k, p in HOOKS.items()}
    print("  hook (uniq): " + " · ".join(f"{k} {v}" for k, v in dem.items()))
    return not loi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", nargs="+", help="file bàn giao cần soát")
    ap.add_argument("--src", help="dist/index.html nguồn")
    ap.add_argument("--cdn", help="prefix CDN tuyệt đối, có / ở cuối")
    ap.add_argument("--out", help="file bàn giao để ghi ra")
    a = ap.parse_args()

    if a.check:
        ket = [check(pathlib.Path(f).read_text(encoding="utf-8"), f) for f in a.check]
        sys.exit(0 if all(ket) else 1)

    if not (a.src and a.cdn and a.out):
        ap.error("cần --check, hoặc đủ --src --cdn --out")
    if not a.cdn.endswith("/"):
        ap.error("--cdn phải có / ở cuối")
    out = to_handoff(pathlib.Path(a.src).read_text(encoding="utf-8"), a.cdn)
    dest = pathlib.Path(a.out)
    if dest.exists():
        cu = dest.read_text(encoding="utf-8")
        for k, p in HOOKS.items():
            mat = set(re.findall(p, cu)) - set(re.findall(p, out))
            if mat:
                print(f"✗ R-HO-7 bản mới MẤT hook {k}: {sorted(mat)[:6]} — KHÔNG ghi", file=sys.stderr)
                sys.exit(1)
    dest.write_text(out, encoding="utf-8")
    print(f"đã ghi {dest} ({len(out)} bytes)")
    sys.exit(0 if check(out, dest.name) else 1)


if __name__ == "__main__":
    main()
