"""Test OCR trên frame chữ nền tối — thứ khó nhất của screencast. Bỏ qua nếu máy chưa có backend."""
import os
import sys
import difflib
import shutil
import tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vd_text
import fakevideo

be = vd_text.backend()
if be is None:
    print("⏭  ocr: SKIP — chưa có backend OCR nào")
    sys.exit(0)

FAIL = []
LINES = ["const total = items.length;", "gsap.from('.card', { y: 40 });"]

tmp = tempfile.mkdtemp(prefix="vdocr-t-")
try:
    p = fakevideo.text_frame(os.path.join(tmp, "t0000.000.png"), LINES)
    rows = vd_text.ocr_frames([{"t": 0.0, "path": p}])
    got = rows[0]["text"]
    want = "\n".join(LINES)
    ratio = difflib.SequenceMatcher(None, "".join(want.split()), "".join(got.split())).ratio()
    if ratio < 0.8:
        FAIL.append(f"OCR ({be}) chỉ khớp {ratio:.0%}, cần ≥80%\n  muốn: {want!r}\n  được: {got!r}")

    # G-VD-4: frame trắng trơn thì OCR rỗng là ĐÚNG, không được cảnh báo nhầm
    blank = fakevideo.text_frame(os.path.join(tmp, "t0001.000.png"), [], dark=False)
    warn = vd_text.gate_ocr([{"t": 1.0, "text": ""}], [{"t": 1.0, "path": blank}])
    if warn:
        FAIL.append(f"frame trống mà lại cảnh báo: {warn}")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print(f"✅ ocr: pass (backend {be}, khớp ≥80%)")
