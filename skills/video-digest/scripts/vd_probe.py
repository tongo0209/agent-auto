"""Chặng probe: metadata + tín hiệu cơ học để TỰ PHÂN LOẠI video, không cần AI."""
import os
import re
import sys
import tempfile
import numpy as np
from PIL import Image
import vdlib

PROBE_FPS = 4
PROBE_WIDTH = 480
SCENE_CUT = 0.30
OCR_SAMPLES = 5


def media_info(video):
    vdlib.gate_binaries("ffprobe")
    rc, out, err = vdlib.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,codec_name",
        "-show_entries", "format=duration", "-of", "json", video])
    if rc != 0:
        raise vdlib.Gate(f"G-VD-2 không decode được video:\n{err.strip()[:300]}")
    import json
    d = json.loads(out)
    if not d.get("streams"):
        raise vdlib.Gate("G-VD-2 file không có luồng video nào")
    s = d["streams"][0]
    num, den = (s["r_frame_rate"].split("/") + ["1"])[:2]
    dur = float(d.get("format", {}).get("duration") or 0)
    if dur <= 0:
        raise vdlib.Gate("G-VD-2 thời lượng video = 0")
    rc2, out2, _ = vdlib.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                              "-show_entries", "stream=codec_type", "-of", "csv=p=0", video])
    return {"w": int(s["width"]), "h": int(s["height"]),
            "fps": round(float(num) / float(den or 1), 3),
            "codec": s.get("codec_name"), "duration": round(dur, 3),
            "has_audio": bool(out2.strip())}


def _probe_frames(video, outdir):
    vdlib.gate_binaries("ffmpeg")
    os.makedirs(outdir, exist_ok=True)
    rc, _, err = vdlib.run(["ffmpeg", "-v", "error", "-i", video,
                            "-vf", f"fps={PROBE_FPS},scale={PROBE_WIDTH}:-1",
                            os.path.join(outdir, "p%05d.png")])
    if rc != 0:
        raise vdlib.Gate(f"G-VD-2 tách frame thất bại:\n{err.strip()[:300]}")
    return sorted(os.path.join(outdir, f) for f in os.listdir(outdir) if f.endswith(".png"))


def _lavfi_path(path):
    """movie= của lavfi coi \\ : , ' [ ] là ký tự điều khiển — đường dẫn Downloads có dấu cách
    và dấu phẩy là vỡ filter, nên phải thoát trước khi nhét vào."""
    out = path.replace("\\", "\\\\")
    for ch in ":,'[]":
        out = out.replace(ch, "\\" + ch)
    return out


def scene_cuts(video):
    """Số lần cắt cảnh — ffmpeg tự chấm điểm, mình chỉ đếm dòng."""
    rc, out, _ = vdlib.run([
        "ffprobe", "-v", "error", "-f", "lavfi",
        "-i", f"movie={_lavfi_path(video)},select=gt(scene\\,{SCENE_CUT})",
        "-show_entries", "frame=pkt_pts_time", "-of", "csv=p=0"])
    return [round(float(x), 3) for x in out.split() if x.strip().replace(".", "", 1).isdigit()]


def _energy_and_text(paths):
    grays = [np.asarray(Image.open(p).convert("L"), dtype=np.float32) for p in paths]
    diffs = [np.abs(grays[i] - grays[i - 1]).mean() for i in range(1, len(grays))]
    energy = float(np.mean(diffs) / 255.0) if diffs else 0.0
    density = 0.0
    if vdlib.have("tesseract"):
        idx = np.linspace(0, len(paths) - 1, min(OCR_SAMPLES, len(paths))).astype(int)
        chars = 0
        for i in idx:
            rc, out, _ = vdlib.run(["tesseract", paths[i], "-", "--psm", "6"])
            chars += len(re.sub(r"\s", "", out))
        density = round(chars / max(1, len(idx)) / 400.0, 3)
    return round(energy, 4), min(1.0, density)


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
    info = media_info(video)
    tmp = tempfile.mkdtemp(prefix="vdprobe-")
    try:
        paths = _probe_frames(video, tmp)
        energy, density = _energy_and_text(paths)
    finally:
        import shutil as _sh
        _sh.rmtree(tmp, ignore_errors=True)
    cuts = scene_cuts(video)
    guess, scores = classify(energy, cuts, density, has_subs, info["duration"])
    return {"media": info,
            "signals": {"motion_energy": energy, "text_density": density,
                        "scene_cuts": len(cuts), "cut_times": cuts, "subs": has_subs},
            "classify": {"guess": guess, "scores": scores}}


if __name__ == "__main__":
    import json
    print(json.dumps(probe(sys.argv[1]), ensure_ascii=False, indent=2))
