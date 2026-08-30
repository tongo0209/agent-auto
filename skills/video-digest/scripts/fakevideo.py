"""Sinh frame có ĐÁP ÁN BIẾT TRƯỚC để test động cơ — không cần quay video thật."""
import os
from PIL import Image, ImageDraw
import easing

BG = (18, 18, 22)
FG = (240, 90, 60)


def frame_name(t):
    return f"t{t:08.3f}.png"


def moving_box(outdir, x0=100, x1=420, y=200, box=80, w=640, h=360,
               fps=25, dur_ms=640, hold_ms=240, ease="easeOutQuint"):
    """Ô vuông dịch từ x0 sang x1 trong dur_ms theo easing cho trước, đứng yên hold_ms hai đầu.
    Trả về dict ground truth để test đối chiếu."""
    os.makedirs(outdir, exist_ok=True)
    params = easing.CANDIDATES[ease]
    n_hold = round(hold_ms / 1000 * fps)
    n_move = round(dur_ms / 1000 * fps)
    frames, i = [], 0
    for phase in ("pre", "move", "post"):
        count = n_move if phase == "move" else n_hold
        for k in range(count):
            if phase == "pre":
                p = 0.0
            elif phase == "post":
                p = 1.0
            else:
                p = easing.bezier_y(params, k / n_move)
            x = x0 + (x1 - x0) * p
            img = Image.new("RGB", (w, h), BG)
            ImageDraw.Draw(img).rectangle([x, y, x + box, y + box], fill=FG)
            t = i / fps
            img.save(os.path.join(outdir, frame_name(t)))
            frames.append(t)
            i += 1
    return {"fps": fps, "x0": x0, "x1": x1, "dx": x1 - x0, "box": box, "y": y,
            "ease": ease, "dur_ms": dur_ms, "n_hold": n_hold, "n_move": n_move,
            "t_start": n_hold / fps, "t_end": (n_hold + n_move) / fps, "times": frames}


def static_clip(outdir, w=320, h=180, fps=25, secs=4):
    """Frame y hệt nhau — dùng để chắc dedupe không giữ lại rác."""
    os.makedirs(outdir, exist_ok=True)
    img = Image.new("RGB", (w, h), BG)
    ImageDraw.Draw(img).rectangle([40, 40, 120, 120], fill=FG)
    for i in range(fps * secs):
        img.save(os.path.join(outdir, frame_name(i / fps)))
    return {"fps": fps, "count": fps * secs}
