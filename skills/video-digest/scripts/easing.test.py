"""Test fit easing bằng quỹ đạo sinh từ bezier đã biết trước — ground truth tự sinh."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import easing

FAIL = []


def ok(cond, what):
    if not cond:
        FAIL.append(what)


def eq(got, want, what):
    if got != want:
        FAIL.append(f"{what}\n    got  {got!r}\n    want {want!r}")


# ── 1. bezier_y ở 2 đầu mút phải đúng tuyệt đối ──────────────────────────────
for name, p in easing.CANDIDATES.items():
    eq(round(easing.bezier_y(p, 0.0), 6), 0.0, f"{name}: y(0) phải = 0")
    eq(round(easing.bezier_y(p, 1.0), 6), 1.0, f"{name}: y(1) phải = 1")

# ── 2. linear là đường thẳng ─────────────────────────────────────────────────
for t in (0.1, 0.25, 0.5, 0.75, 0.9):
    ok(abs(easing.bezier_y(easing.CANDIDATES["linear"], t) - t) < 1e-4,
       f"linear tại t={t} phải bằng chính t")

# ── 3. ease-out đi nhanh lúc đầu, ease-in đi chậm lúc đầu ────────────────────
ok(easing.bezier_y(easing.CANDIDATES["ease-out"], 0.25) > 0.25, "ease-out phải vọt trước")
ok(easing.bezier_y(easing.CANDIDATES["ease-in"], 0.25) < 0.25, "ease-in phải ì lúc đầu")

# ── 4. easeOutBack phải vượt 1 rồi quay lại (overshoot) ──────────────────────
peak = max(easing.bezier_y(easing.CANDIDATES["easeOutBack"], t / 100) for t in range(101))
ok(peak > 1.0, f"easeOutBack phải overshoot >1, đo được {peak:.3f}")

# ── 5. fit khôi phục lại ĐÚNG bezier đã dùng để sinh mẫu ─────────────────────
for name, p in easing.CANDIDATES.items():
    times = [i / 40 for i in range(41)]
    prog = [easing.bezier_y(p, t) for t in times]
    got, params, rmse = easing.fit(times, prog)
    ok(rmse < 0.01, f"fit({name}) rmse={rmse:.4f} phải < 0.01")
    ok(easing.rmse_against(times, prog, easing.CANDIDATES[got]) <= rmse + 1e-9,
       f"fit({name}) trả {got} nhưng không phải cái rmse nhỏ nhất")

# ── 6. quỹ đạo rác (nhiễu ngẫu nhiên) phải bị xử unfit, KHÔNG bịa bezier ─────
import random
random.seed(7)
times = [i / 40 for i in range(41)]
noise = sorted(random.random() for _ in range(41))
noise = [(v - noise[0]) / (noise[-1] - noise[0]) for v in noise]
jag = [min(1.0, max(0.0, v + random.uniform(-0.35, 0.35))) for v in noise]
name, params, rmse = easing.fit(times, jag)
ok(easing.is_unfit(rmse), f"quỹ đạo nhiễu phải unfit (rmse={rmse:.4f} > {easing.UNFIT_RMSE})")

# ── 7. mẫu quá ít frame thì không được phép đoán ─────────────────────────────
name, params, rmse = easing.fit([0.0, 1.0], [0.0, 1.0])
eq(name, None, "chỉ 2 mẫu thì fit phải trả None")

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print(f"✅ easing: pass ({len(easing.CANDIDATES)} candidate)")
