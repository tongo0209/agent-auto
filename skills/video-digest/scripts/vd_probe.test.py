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


# Số dưới đây lấy từ ĐO THẬT (xem DENSITY_TEXT / ENERGY_MOVING trong vd_probe),
# không phải số ước chừng: màn chữ density≈0.031, animation density≈0.002.
ok(guess(0.018, 0, 0.002, False) == "motion", "chuyển động mạnh + ít chữ → motion")
ok(guess(0.002, 0, 0.031, False) == "screencast", "nhiều chữ + ít động → screencast")
ok(guess(0.002, 20, 0.020, False) == "walkthrough", "cắt cảnh dày + có chữ → walkthrough")
ok(guess(0.001, 0, 0.005, True) == "talking", "có phụ đề + gần như tĩnh → talking")

# cắt cảnh KHÔNG được tính là chuyển động: video lắm cảnh mà tĩnh vẫn phải ra walkthrough
ok(guess(0.002, 30, 0.020, False) != "motion", "nhiều cut không được biến thành motion")
# không phụ đề thì không bao giờ là talking, dù đứng im
ok(guess(0.0005, 0, 0.030, False) != "talking", "không phụ đề thì không phải talking")

g, scores = vd_probe.classify(0.018, [], 0.002, False, 60.0)
ok(abs(sum(scores.values()) - 1.0) < 0.005,
   f"điểm phải chuẩn hoá về 1 (sai số làm tròn), được {sum(scores.values())}")
ok(all(v >= 0 for v in scores.values()), "không được có điểm âm")

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print("✅ vd_probe: pass")
