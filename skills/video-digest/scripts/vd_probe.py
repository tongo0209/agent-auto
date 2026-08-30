"""Chặng probe: metadata + tín hiệu cơ học để TỰ PHÂN LOẠI video, không cần AI."""
import sys
import numpy as np
import vdav

PROBE_FPS = 4
PROBE_SCALE = 3
SCENE_CUT = 12.0
TEXT_EDGE = 30


def _text_density(g):
    """Đo 'độ nhiều chữ' bằng mật độ cạnh dọc — chữ tạo rất nhiều chuyển sáng-tối theo chiều
    ngang. Thay cho việc OCR thử vài frame: nhanh hơn nhiều và không cần tesseract."""
    return float((np.abs(np.diff(g.astype(np.int16), axis=1)) > TEXT_EDGE).mean())


def signals(video):
    prev, cuts, diffs, densities = None, [], [], []
    for t, g in vdav.frames(video, max_fps=PROBE_FPS, scale=PROBE_SCALE):
        densities.append(_text_density(g))
        if prev is not None:
            d = vdav.mean_abs_diff(g, prev)
            diffs.append(d)
            if d > SCENE_CUT:
                cuts.append(round(t, 3))
        prev = g
    return {"motion_energy": round(float(np.mean(diffs)) / 255.0, 4) if diffs else 0.0,
            "text_density": round(float(np.mean(densities)), 3) if densities else 0.0,
            "scene_cuts": len(cuts), "cut_times": cuts}


def classify(energy, cuts, density, has_subs, duration):
    """4 tín hiệu cơ học → đoán loại video. Chỉ để chọn lens mặc định, luôn ép tay được."""
    cut_rate = len(cuts) / max(1.0, duration / 60.0)
    scores = {
        "screencast": density * 1.6 + (0.2 if energy < 0.05 else 0.0),
        "motion": energy * 2.2 + (0.3 if density < 0.15 else 0.0),
        "walkthrough": min(1.0, cut_rate / 12.0) + density * 0.5,
        "talking": (0.6 if has_subs else 0.0) + (0.3 if energy < 0.02 else 0.0),
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
