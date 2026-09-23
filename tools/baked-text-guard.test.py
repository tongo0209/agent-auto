#!/usr/bin/env python3
"""Self-test cho baked-text-guard — chạy không cần PSD, không cần Photoshop."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "baked-text-guard.py")
spec = importlib.util.spec_from_file_location("btg", TOOL)
btg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(btg)

FAIL = []
TMP = tempfile.mkdtemp(prefix="btg-test-")


def eq(got, want, what):
    if got != want:
        FAIL.append(f"{what}\n    got  {got!r}\n    want {want!r}")


def write(name, data):
    path = os.path.join(TMP, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False))
    return path


def run(*inputs, dist):
    args = [a for p in inputs for a in ("--job", p)]
    r = subprocess.run([sys.executable, TOOL, *args, "--dist", dist], capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


SUBTITLE = "Hoàn thành tân thủ và khảo sát trên server test"
DIST = os.path.dirname(write("dist/index.html", f"<h1>Title</h1><p class=\"header__sub\">{SUBTITLE}</p>"))

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

# ── coords.json mới mang textInside: bắt được lồng chữ KHÔNG cần PSD (ca GW-760) ──
coords_new = write("cut/coords.json", {"runId": "r1", "gateStatus": "PASS", "assets": [
    {"name": "textmain-vi", "file": "textmain-vi.png", "flags": ["TEXT"], "textInside": [SUBTITLE]},
    {"name": "_control", "file": "_control.png", "textInside": ["chữ của tấm tham chiếu không tính"]}]})
code, out = run(coords_new, dist=DIST)
eq(code, 1, "coords mới: chuỗi textInside render lại ở HTML ⇒ exit 1")
eq(SUBTITLE.lower()[:40] in out, True, "coords mới: báo đúng chuỗi lồng")

# ── coords.json đời cũ (mảng, không textInside): báo rõ thiếu field, exit 2 — không PASS câm ──
coords_old = write("old/coords.json", [{"name": "bg", "x": 0, "y": 0, "w": 10, "h": 10, "file": "bg.png"}])
code, out = run(coords_old, dist=DIST)
eq(code, 2, "coords cũ không có textInside ⇒ exit 2 (không chấm được), không phải 0")
eq("textInside" in out and "Traceback" not in out, True, "coords cũ: nêu tên field thiếu, không traceback")

# ── job thiếu `psd` + state thiếu `name` — trước đây chết KeyError ──
job_no_psd = write("job-no-psd.json", {"states": [{"showPath": [["F3", "sub"]]}, {"name": "x", "showPath": [["A"]]}]})
code, out = run(job_no_psd, dist=DIST)
eq(code, 2, "job thiếu psd ⇒ exit 2")
eq("'psd'" in out and "Traceback" not in out, True, "job thiếu psd: nêu field 'psd', không traceback")

# ── job figma (assets[] mang textInside) chấm được, chuỗi không lồng ⇒ PASS ──
job_fig = write("job-fig.json", {"assets": [{"name": "btn", "flags": [], "textInside": ["Nhận thưởng mỗi ngày ngay"]}]})
code, out = run(job_fig, dist=DIST)
eq(code, 0, "job figma có textInside, không trùng HTML ⇒ exit 0")

# ── file không nhận ra dạng (map GW-777) ⇒ exit 2, nói rõ cần states[]/assets[] ──
coords_map = write("map/coords.json", {"assets/bg.png": {"file": "assets/bg.png", "left": 0, "top": 0}})
code, out = run(coords_map, dist=DIST)
eq((code, "states[]" in out and "Traceback" not in out), (2, True), "dạng lạ ⇒ exit 2 + nêu dạng cần")

print(f"baked-text-guard: 9 nhóm — {len(FAIL)} khẳng định sai")
for f in FAIL:
    print("  ✗ " + f)
sys.exit(1 if FAIL else 0)
