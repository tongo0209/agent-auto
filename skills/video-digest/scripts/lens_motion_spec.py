"""Lens motion-spec: specs.json → bảng số + snippet dán được vào CSS/GSAP. 0 token."""
import json
import os
import sys
import easing

STAGGER_WINDOW = 0.5


def _mmss(t):
    return f"{int(t) // 60:d}:{t % 60:06.3f}"


def _moves(s):
    m = []
    if abs(s["dx"]) >= 1:
        m.append(f"x {s['dx']:+.0f}px")
    if abs(s["dy"]) >= 1:
        m.append(f"y {s['dy']:+.0f}px")
    if s["scale_from"] and s["scale_to"] and abs(s["scale_to"] - s["scale_from"]) > 2:
        m.append(f"w {s['scale_from']}→{s['scale_to']}px")
    return m


def render(digest_dir):
    p = os.path.join(digest_dir, "motion", "specs.json")
    if not os.path.exists(p):
        return "# Motion spec\n\nDigest này không chạy chặng motion.\n"
    specs = json.load(open(p))
    if not specs:
        return "# Motion spec\n\nKhông dò được chuyển động nào.\n"

    out = ["# Motion spec", "",
           "Số đo từ pixel, không phải cảm nhận. `unfit` = không khớp easing chuẩn nào —",
           "xem filmstrip rồi tự quyết, **đừng lấy đại một bezier**.", "",
           "| # | Mốc | Vùng | Dịch | Thời lượng | Easing | RMSE |",
           "|---|---|---|---|---|---|---|"]
    for i, s in enumerate(specs, 1):
        ease = "**unfit**" if s["unfit"] else f"`{s['bezier']}`<br>{s['ease']}"
        seen = "" if s["dur_ms"] == s["dur_seen_ms"] else \
               f"<br><sub>thấy được {s['dur_seen_ms']}ms</sub>"
        out.append(f"| {i} | {_mmss(s['t0'])} | {s['region']} | {' · '.join(_moves(s)) or '—'} "
                   f"| {s['dur_ms']}ms{seen} | {ease} | {s['rmse']:.4f} |")

    base = specs[0]["t0"]
    group = [s for s in specs if s["t0"] - base < STAGGER_WINDOW]
    if len(group) > 1:
        gaps = [round((group[i]["t0"] - group[i - 1]["t0"]) * 1000) for i in range(1, len(group))]
        out += ["", f"**Stagger** giữa {len(group)} phần tử mở đầu: {gaps} ms"]

    fit = [s for s in specs if not s["unfit"]]
    if fit:
        out += ["", "## CSS", "", "```css"]
        for s in fit:
            out.append(f".{s['region']} {{ transition: transform {s['dur_ms']}ms {s['bezier']} "
                       f"{round((s['t0'] - base) * 1000)}ms; }}")
        out += ["```", "", "## GSAP", "", "```js", "const tl = gsap.timeline();"]
        for s in fit:
            props = []
            if abs(s["dx"]) >= 1:
                props.append(f"x: {s['dx']:+.0f}")
            if abs(s["dy"]) >= 1:
                props.append(f"y: {s['dy']:+.0f}")
            out.append(f"tl.from('.{s['region']}', {{ {', '.join(props)}, "
                       f"duration: {s['dur_ms'] / 1000:.2f}, "
                       f"ease: '{easing.GSAP_NAME.get(s['ease'], 'none')}' }}, "
                       f"{s['t0'] - base:.2f});")
        out += ["```"]

    bad = [s for s in specs if s["unfit"]]
    if bad:
        out += ["", "## Không fit được — phải tự nhìn", ""]
        for s in bad:
            out.append(f"- `{s['region']}` tại {_mmss(s['t0'])} (rmse {s['rmse']:.3f}): "
                       f"{' · '.join(_moves(s)) or 'đổi hình dạng'} — xem `sheets/`")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    print(render(sys.argv[1]))
