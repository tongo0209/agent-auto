#!/usr/bin/env python3
"""Self-test cho baked-text-guard — chạy không cần PSD, không cần Photoshop."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("btg", os.path.join(HERE, "baked-text-guard.py"))
btg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(btg)

FAIL = []


def eq(got, want, what):
    if got != want:
        FAIL.append(f"{what}\n    got  {got!r}\n    want {want!r}")


# ── job đời mới dùng showPath (list segment) — ca làm tool crash KeyError: 'show' ──
eq(btg.show_keys({"name": "title", "showPath": [["F3 BG", "Title F3"]]}), ["F3 BG/Title F3"],
   "showPath phải đổi được thành khoá 'A/B' như index_tree sinh ra")

# ── job đời cũ dùng show (chuỗi sẵn) — không được phá ──
eq(btg.show_keys({"name": "btn", "show": ["popup/btn"]}), ["popup/btn"],
   "job cũ dùng `show` vẫn phải chạy y như trước")

# ── state _control bật cả PSD, không phải ảnh giao ──
eq(btg.show_keys({"name": "_control", "show": ["*"]}), [],
   "'*' không phải path layer, phải bỏ")

# ── bakePath cũng góp pixel vào ảnh nên chữ trong đó cũng bị bake ──
eq(btg.show_keys({"name": "f1", "showPath": [["A"]], "bakePath": [["B", "c"]]}), ["A", "B/c"],
   "bakePath góp pixel vào PNG ⇒ chữ trong đó cũng nằm trong ảnh giao")

print(f"baked-text-guard: 4 nhóm — {len(FAIL)} khẳng định sai")
for f in FAIL:
    print("  ✗ " + f)
sys.exit(1 if FAIL else 0)
