"""Test ĐẦU-CUỐI trên mp4 thật dựng từ frame ground-truth: chạy trọn run.sh → đọc motion-spec.

Cần ffmpeg. Không có ffmpeg thì bỏ qua (in SKIP) chứ không báo pass giả.
"""
import os
import sys
import shutil
import tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vdlib

try:
    import av  # noqa: F401
except ImportError:
    print("⏭  e2e: SKIP — chưa có PyAV (python3 -m pip install --user av)")
    sys.exit(0)

import fakevideo
import vd_run

FAIL = []


def ok(cond, what):
    if not cond:
        FAIL.append(what)


tmp = tempfile.mkdtemp(prefix="vde2e-")
try:
    src = os.path.join(tmp, "src")
    gt = fakevideo.moving_box(src, ease="easeOutQuint", dur_ms=640, x0=100, x1=420, fps=25)
    mp4 = os.path.join(tmp, "clip.mkv")
    fakevideo.encode_dir(src, mp4, gt["fps"])
    ok(os.path.exists(mp4) and os.path.getsize(mp4) > 1000, "dựng video thất bại")

    d = os.path.join(tmp, "digest")
    rc = vd_run.main([mp4, "--out", d, "--lens", "motion-spec"])
    ok(rc == 0, "vd_run phải trả 0")

    digest = vdlib.jload(os.path.join(d, "digest.json"))
    ok(digest["classify"]["guess"] == "motion",
       f"phải tự phân loại là motion, được {digest['classify']['guess']}")
    ok(abs(digest["media"]["duration"] - len(gt["times"]) / gt["fps"]) < 0.15,
       f"thời lượng lệch: {digest['media']['duration']}")
    ok(len(digest["beats"]) >= 1, "phải ghi được nhịp vào digest.json")

    md = open(os.path.join(d, "out", "motion-spec.md")).read()
    ok("640ms" in md or "600ms" in md or "680ms" in md,
       f"motion-spec phải ra thời lượng quanh 640ms:\n{md[:600]}")
    ok("power4.out" in md or "easeOutQuint" in md or "easeOutQuart" in md,
       f"phải nhận ra easing giảm tốc mạnh:\n{md[:600]}")
    ok(os.path.exists(os.path.join(d, "sheets", "sheet-01.png")), "phải có contact sheet")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print("✅ e2e: pass (mp4 thật → digest → motion-spec)")
