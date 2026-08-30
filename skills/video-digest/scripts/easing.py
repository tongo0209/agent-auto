"""Fit quỹ đạo chuyển động về cubic-bezier của CSS/GSAP. Toán thuần, không AI, không token."""

UNFIT_RMSE = 0.03
MIN_SAMPLES = 4

CANDIDATES = {
    "linear":          (0.0, 0.0, 1.0, 1.0),
    "ease":            (0.25, 0.1, 0.25, 1.0),
    "ease-in":         (0.42, 0.0, 1.0, 1.0),
    "ease-out":        (0.0, 0.0, 0.58, 1.0),
    "ease-in-out":     (0.42, 0.0, 0.58, 1.0),
    "easeInQuad":      (0.11, 0.0, 0.5, 0.0),
    "easeOutQuad":     (0.5, 1.0, 0.89, 1.0),
    "easeInOutQuad":   (0.45, 0.0, 0.55, 1.0),
    "easeInCubic":     (0.32, 0.0, 0.67, 0.0),
    "easeOutCubic":    (0.33, 1.0, 0.68, 1.0),
    "easeInOutCubic":  (0.65, 0.0, 0.35, 1.0),
    "easeInQuart":     (0.5, 0.0, 0.75, 0.0),
    "easeOutQuart":    (0.25, 1.0, 0.5, 1.0),
    "easeInOutQuart":  (0.76, 0.0, 0.24, 1.0),
    "easeInQuint":     (0.64, 0.0, 0.78, 0.0),
    "easeOutQuint":    (0.22, 1.0, 0.36, 1.0),
    "easeInOutQuint":  (0.83, 0.0, 0.17, 1.0),
    "easeInExpo":      (0.7, 0.0, 0.84, 0.0),
    "easeOutExpo":     (0.16, 1.0, 0.3, 1.0),
    "easeInOutExpo":   (0.87, 0.0, 0.13, 1.0),
    "easeInCirc":      (0.55, 0.0, 1.0, 0.45),
    "easeOutCirc":     (0.0, 0.55, 0.45, 1.0),
    "easeInOutCirc":   (0.85, 0.0, 0.15, 1.0),
    "easeInBack":      (0.36, 0.0, 0.66, -0.56),
    "easeOutBack":     (0.34, 1.56, 0.64, 1.0),
    "easeInOutBack":   (0.68, -0.6, 0.32, 1.6),
}


def _axis(a1, a2, s):
    r = 1.0 - s
    return 3.0 * r * r * s * a1 + 3.0 * r * s * s * a2 + s * s * s


def bezier_y(params, t):
    """y tại thời điểm t của cubic-bezier(x1,y1,x2,y2). Chia đôi 40 vòng: chậm chán nhưng
    không bao giờ phân kỳ như Newton khi control point nằm ngoài [0,1] (các easing overshoot)."""
    x1, y1, x2, y2 = params
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2.0
        if _axis(x1, x2, mid) < t:
            lo = mid
        else:
            hi = mid
    return _axis(y1, y2, (lo + hi) / 2.0)


def rmse_against(times, progress, params):
    total = sum((bezier_y(params, t) - p) ** 2 for t, p in zip(times, progress))
    return (total / len(times)) ** 0.5


def fit(times, progress):
    """Trả (tên, params, rmse) của easing khớp nhất. Ít hơn MIN_SAMPLES mẫu thì trả None —
    thà không biết còn hơn đoán từ 2 điểm."""
    if len(times) < MIN_SAMPLES:
        return None, None, float("inf")
    best = min(CANDIDATES.items(), key=lambda kv: rmse_against(times, progress, kv[1]))
    return best[0], best[1], rmse_against(times, progress, best[1])


def is_unfit(rmse):
    return not (rmse <= UNFIT_RMSE)


# Tên tương đương bên GSAP — để khỏi phải nạp CustomEase chỉ vì một cái bezier.
GSAP_NAME = {
    "linear": "none", "ease": "power1.inOut",
    "ease-in": "power1.in", "ease-out": "power1.out", "ease-in-out": "power1.inOut",
    "easeInQuad": "power1.in", "easeOutQuad": "power1.out", "easeInOutQuad": "power1.inOut",
    "easeInCubic": "power2.in", "easeOutCubic": "power2.out", "easeInOutCubic": "power2.inOut",
    "easeInQuart": "power3.in", "easeOutQuart": "power3.out", "easeInOutQuart": "power3.inOut",
    "easeInQuint": "power4.in", "easeOutQuint": "power4.out", "easeInOutQuint": "power4.inOut",
    "easeInExpo": "expo.in", "easeOutExpo": "expo.out", "easeInOutExpo": "expo.inOut",
    "easeInCirc": "circ.in", "easeOutCirc": "circ.out", "easeInOutCirc": "circ.inOut",
    "easeInBack": "back.in(1.7)", "easeOutBack": "back.out(1.7)",
    "easeInOutBack": "back.inOut(1.7)",
}
