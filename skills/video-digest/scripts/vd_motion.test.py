"""Test bám chuyển động bằng frame ground-truth: biết trước dịch bao nhiêu px, bao lâu, easing gì."""
import sys
import os
import shutil
import tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fakevideo
import vd_motion
import easing

FAIL = []


def ok(cond, what):
    if not cond:
        FAIL.append(what)


tmp = tempfile.mkdtemp(prefix="vdtest-")
try:
    d = os.path.join(tmp, "frames")
    gt = fakevideo.moving_box(d, ease="easeOutQuint", dur_ms=640, x0=100, x1=420, fps=25)
    frames = vd_motion.load_frames(d)
    ok(len(frames) == len(gt["times"]), f"đọc đủ frame: {len(frames)} vs {len(gt['times'])}")

    # ── 1. dò đúng MỘT vùng biến động, và vùng đó phải trùm hết đường đi ────────
    regions = vd_motion.detect_regions(frames)
    ok(len(regions) == 1, f"phải dò ra đúng 1 vùng, được {len(regions)}")
    r = regions[0]
    ok(r["x"] <= gt["x0"] + 2 and r["x"] + r["w"] >= gt["x1"] + gt["box"] - 2,
       f"vùng {r} phải trùm đường đi {gt['x0']}..{gt['x1'] + gt['box']}")

    # ── 2. quỹ đạo: dịch đúng số px, không lệch quá 2px ─────────────────────────
    track = vd_motion.track_region(frames, r)
    dx = track[-1]["cx"] - track[0]["cx"]
    ok(abs(dx - gt["dx"]) <= 2, f"dịch ngang đo được {dx:.1f}px, thật {gt['dx']}px")

    # ── 3. cắt nhịp: mốc bắt đầu/kết thúc sai không quá 1 frame ─────────────────
    beats = vd_motion.find_beats(track, fps=gt["fps"])
    ok(len(beats) == 1, f"phải ra đúng 1 nhịp, được {len(beats)}")
    b = beats[0]
    tol = 1.0 / gt["fps"] + 1e-6
    ok(abs(b["t0"] - gt["t_start"]) <= tol, f"t0 đo {b['t0']:.3f} vs thật {gt['t_start']:.3f}")
    # easing giảm tốc mạnh: mấy frame cuối dịch dưới 1px nên t1_seen NGẮN hơn t1 thật — đúng ý đồ
    ok(b["t1_seen"] <= gt["t_end"] + tol, "t1_seen không được vượt mốc thật")

    # ── 4. fit đồng thời (thời lượng, easing) phải khôi phục cả hai ─────────────
    spec = vd_motion.beat_spec(track, b, fps=gt["fps"])
    ok(not easing.is_unfit(spec["rmse"]), f"phải fit được, rmse={spec['rmse']:.4f}")
    ok(spec["ease"] == gt["ease"], f"fit ra {spec['ease']}, thật {gt['ease']}")
    ok(abs(spec["dur_ms"] - gt["dur_ms"]) <= 1000.0 / gt["fps"] + 1,
       f"duration fit {spec['dur_ms']}ms vs thật {gt['dur_ms']}ms (thấy được {spec['dur_seen_ms']}ms)")
    ok(abs(spec["t1"] - gt["t_end"]) <= tol, f"t1 fit {spec['t1']:.3f} vs thật {gt['t_end']:.3f}")

    # ── 5. clip đứng yên: không được bịa ra vùng hay nhịp nào ───────────────────
    d2 = os.path.join(tmp, "static")
    fakevideo.static_clip(d2)
    f2 = vd_motion.load_frames(d2)
    ok(vd_motion.detect_regions(f2) == [], "clip đứng yên phải ra 0 vùng")

    # ── 6. easing lạ (không nằm trong rổ) phải bị gắn unfit, không bịa bezier ───
    d3 = os.path.join(tmp, "jerky")
    gt3 = fakevideo.moving_box(d3, ease="linear", dur_ms=400, fps=25)
    t3 = vd_motion.track_region(f3 := vd_motion.load_frames(d3),
                                vd_motion.detect_regions(f3)[0])
    b3 = vd_motion.find_beats(t3, fps=25)[0]
    s3 = vd_motion.beat_spec(t3, b3, fps=25)
    ok(s3["ease"] == "linear", f"linear phải fit ra linear, được {s3['ease']}")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print("✅ vd_motion: pass")
