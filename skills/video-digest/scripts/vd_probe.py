"""Chặng probe: metadata + tín hiệu cơ học để TỰ PHÂN LOẠI video, không cần AI."""
import sys
import numpy as np
import vdav

PROBE_FPS = 4
PROBE_SCALE = 3
TEXT_EDGE = 30
CUT_PIXEL = 25
CUT_FRACTION = 0.12
# Ngưỡng ĐO THẬT 30/8: màn chữ density 0.031 vs animation 0.002; energy 0.0022 vs 0.018.
DENSITY_TEXT = 0.012
ENERGY_MOVING = 0.008


def _text_density(g):
    """Đo 'độ nhiều chữ' bằng mật độ cạnh dọc — chữ tạo rất nhiều chuyển sáng-tối theo chiều
    ngang. Thay cho việc OCR thử vài frame: nhanh hơn nhiều và không cần tesseract."""
    return float((np.abs(np.diff(g.astype(np.int16), axis=1)) > TEXT_EDGE).mean())


def signals(video):
    """Cắt cảnh nhận bằng TỈ LỆ pixel đổi (đổi khắp màn = cut) chứ không bằng độ lệch trung bình
    (một phần tử to chạy cũng đội số đó lên). Năng lượng chuyển động loại bỏ các frame cut,
    nếu không thì video lắm cảnh nào cũng bị chấm là 'nhiều chuyển động'."""
    prev, cuts, diffs, densities = None, [], [], []
    for t, g in vdav.frames(video, max_fps=PROBE_FPS, scale=PROBE_SCALE):
        densities.append(_text_density(g))
        if prev is not None:
            delta = np.abs(g.astype(np.int16) - prev.astype(np.int16))
            if float((delta > CUT_PIXEL).mean()) > CUT_FRACTION:
                cuts.append(round(t, 3))
            else:
                diffs.append(float(delta.mean()))
        prev = g
    return {"motion_energy": round(float(np.mean(diffs)) / 255.0, 4) if diffs else 0.0,
            "text_density": round(float(np.mean(densities)), 3) if densities else 0.0,
            "scene_cuts": len(cuts), "cut_times": cuts}


def classify(energy, cuts, density, has_subs, duration):
    """4 tín hiệu cơ học → đoán loại video. Chỉ để chọn lens mặc định, luôn ép tay được.

    Chấm theo TỈ LỆ so với ngưỡng đo thật, không cộng điểm thưởng tuỳ tiện — cách cũ cho màn
    chữ tĩnh 0.35 điểm 'motion' chỉ vì nó ít chuyển động.
    """
    texty = density / DENSITY_TEXT
    cut_rate = len(cuts) / max(1.0, duration / 60.0)
    scores = {
        "screencast": texty,
        "motion": energy / ENERGY_MOVING,
        "walkthrough": (cut_rate / 6.0) * min(1.0, texty),
        "talking": 1.2 if (has_subs and energy < ENERGY_MOVING) else 0.0,
    }
    total = sum(scores.values()) or 1.0
    scores = {k: round(v / total, 3) for k, v in scores.items()}
    return max(scores, key=scores.get), scores


def probe(video, has_subs=False):
    info = vdav.info(video)
    if info["duration"] <= 0:
        raise ValueError("G-VD-2 thời lượng video = 0")
    sig = signals(video)
    sig["subs"] = has_subs
    guess, scores = classify(sig["motion_energy"], sig["cut_times"], sig["text_density"],
                             has_subs, info["duration"])
    return {"media": info, "signals": sig, "classify": {"guess": guess, "scores": scores}}


if __name__ == "__main__":
    import json
    print(json.dumps(probe(sys.argv[1]), ensure_ascii=False, indent=2))
