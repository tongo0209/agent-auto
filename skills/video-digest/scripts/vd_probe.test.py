"""Test bộ tự phân loại — hàm thuần, không cần video."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vd_probe

FAIL = []


def ok(cond, what):
    if not cond:
        FAIL.append(what)


def guess(energy, cuts, density, subs, dur=60.0):
    return vd_probe.classify(energy, [0.0] * cuts, density, subs, dur)[0]


ok(guess(0.45, 2, 0.02, False) == "motion", "chuyển động mạnh + ít chữ → motion")
ok(guess(0.03, 1, 0.85, False) == "screencast", "nhiều chữ + ít động → screencast")
ok(guess(0.10, 20, 0.30, False) == "walkthrough", "cắt cảnh dày → walkthrough")
ok(guess(0.01, 0, 0.01, True) == "talking", "có phụ đề + gần như tĩnh → talking")

g, scores = vd_probe.classify(0.45, [0.0, 1.0], 0.02, False, 60.0)
ok(abs(sum(scores.values()) - 1.0) < 1e-6, f"điểm phải chuẩn hoá về 1, được {sum(scores.values())}")
ok(all(v >= 0 for v in scores.values()), "không được có điểm âm")

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print("✅ vd_probe: pass")
