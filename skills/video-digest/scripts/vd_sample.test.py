"""Test cổng G-VD-3 và ghép contact sheet — không cần ffmpeg."""
import os
import sys
import shutil
import tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vdlib
import vd_sample
import fakevideo

FAIL = []


def ok(cond, what):
    if not cond:
        FAIL.append(what)


# ── G-VD-3: 0 frame là hỏng thật → dừng ──────────────────────────────────────
try:
    vd_sample.gate_count([], 0, dense=False)
    FAIL.append("0 frame phải ném Gate")
except vdlib.Gate:
    pass

# ── vượt trần thì CẢNH BÁO chứ không dừng — screencast dày vẫn hợp lệ ────────
warn = vd_sample.gate_count([{"t": 0}], vd_sample.MAX_FRAMES + 500, dense=False)
ok(warn and "G-VD-3" in warn, f"vượt trần phải trả cảnh báo, được {warn!r}")
ok(vd_sample.gate_count([{"t": 0}], 10, dense=False) is None, "dưới trần thì im lặng")
ok(vd_sample.gate_count([{"t": 0}], 99999, dense=True) is None,
   "chế độ dense giữ mọi frame là cố ý, không được cảnh báo")

# ── contact sheet: 20 frame → 2 tấm lưới 4x4, tấm cuối 4 ô ───────────────────
tmp = tempfile.mkdtemp(prefix="vdsheet-")
try:
    d = os.path.join(tmp, "frames")
    fakevideo.static_clip(d, w=160, h=90, fps=5, secs=4)
    frames = vdlib.list_frames(d)[:20]
    sheets = vd_sample.contact_sheets(frames, os.path.join(tmp, "sheets"))
    ok(len(sheets) == 2, f"20 frame phải ra 2 sheet, được {len(sheets)}")
    ok(sheets[0]["count"] == 16 and sheets[1]["count"] == 4,
       f"số ô mỗi sheet sai: {[s['count'] for s in sheets]}")
    ok(os.path.exists(os.path.join(tmp, "sheets", "sheet-02.png")), "phải ghi ra file sheet")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print("✅ vd_sample: pass")
