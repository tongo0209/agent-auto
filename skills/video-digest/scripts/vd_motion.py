"""Bám chuyển động trong frame đã tách: dò vùng biến động → quỹ đạo → nhịp → easing.

Nền của vùng ước lượng ở MỨC VÙNG (median gộp toàn bộ pixel × frame) chứ không per-pixel:
per-pixel chết khi phần tử đứng lâu ở một chỗ (easing decelerate) — nó tưởng phần tử là nền.
"""
import os
import re
import numpy as np
from PIL import Image
import easing

MIN_REGION_PX = 8
MIN_ACTIVE_FRAMES = 3      # G-VD-5
DETECT_SCALE = 4
CHANGE_STD = 6.0
BG_SAMPLE_FRAMES = 60
MOVE_EPS_PX = 0.75

_T_RE = re.compile(r"t(\d+\.\d+)\.png$")


def load_frames(d):
    """Chỉ đọc danh sách + mốc giây, chưa nạp pixel — video dài nạp hết là vỡ RAM."""
    out = []
    for name in sorted(os.listdir(d)):
        m = _T_RE.search(name)
        if m:
            out.append({"t": float(m.group(1)), "path": os.path.join(d, name)})
    return out


def _gray(path, scale=1):
    img = Image.open(path).convert("L")
    if scale > 1:
        img = img.resize((max(1, img.width // scale), max(1, img.height // scale)))
    return np.asarray(img, dtype=np.float32)


def _components(mask):
    """Gán nhãn vùng liền nhau bằng BFS 4-hướng. Không dùng scipy để khỏi thêm phụ thuộc."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    boxes = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            stack = [(sy, sx)]
            seen[sy, sx] = True
            x0 = x1 = sx
            y0 = y1 = sy
            while stack:
                y, x = stack.pop()
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            boxes.append((x0, y0, x1, y1))
    return boxes


def detect_regions(frames):
    if len(frames) < 2:
        return []
    stack = np.stack([_gray(f["path"], DETECT_SCALE) for f in frames])
    changing = stack.std(axis=0) > CHANGE_STD
    regions = []
    for i, (x0, y0, x1, y1) in enumerate(_components(changing)):
        x, y = x0 * DETECT_SCALE, y0 * DETECT_SCALE
        w = (x1 - x0 + 1) * DETECT_SCALE
        h = (y1 - y0 + 1) * DETECT_SCALE
        if w < MIN_REGION_PX or h < MIN_REGION_PX:
            continue
        sub = stack[:, y0:y1 + 1, x0:x1 + 1]
        active = int(((sub - np.median(sub)).__abs__().max(axis=(1, 2)) > CHANGE_STD).sum())
        if active < MIN_ACTIVE_FRAMES:
            continue
        regions.append({"id": f"r{len(regions) + 1}", "x": x, "y": y, "w": w, "h": h,
                        "active_frames": active})
    return regions


def _region_bg(frames, region):
    idx = np.linspace(0, len(frames) - 1, min(BG_SAMPLE_FRAMES, len(frames))).astype(int)
    pool = np.concatenate([
        _gray(frames[i]["path"])[region["y"]:region["y"] + region["h"],
                                 region["x"]:region["x"] + region["w"]].ravel() for i in idx])
    bg = float(np.median(pool))
    mad = float(np.median(np.abs(pool - bg)))
    return bg, max(18.0, 4.0 * mad)


def track_region(frames, region):
    """Quỹ đạo từng frame: trọng tâm, khung bao, độ sáng trung bình của phần khác nền."""
    bg, thr = _region_bg(frames, region)
    rows = []
    for f in frames:
        g = _gray(f["path"])[region["y"]:region["y"] + region["h"],
                             region["x"]:region["x"] + region["w"]]
        mask = np.abs(g - bg) > thr
        if mask.sum() < MIN_REGION_PX:
            rows.append({"t": f["t"], "cx": None, "cy": None, "w": 0, "h": 0, "lum": None})
            continue
        ys, xs = np.nonzero(mask)
        rows.append({"t": f["t"],
                     "cx": float(xs.mean()) + region["x"],
                     "cy": float(ys.mean()) + region["y"],
                     "w": int(xs.max() - xs.min() + 1),
                     "h": int(ys.max() - ys.min() + 1),
                     "lum": float(g[mask].mean())})
    return rows


def find_beats(track, fps):
    """Nhịp = chuỗi liên tiếp các bước có dịch chuyển. Mốc lấy ở mẫu TRƯỚC bước động đầu tiên."""
    pts = [r for r in track if r["cx"] is not None]
    beats, start = [], None
    for i in range(1, len(pts)):
        d = ((pts[i]["cx"] - pts[i - 1]["cx"]) ** 2 + (pts[i]["cy"] - pts[i - 1]["cy"]) ** 2) ** 0.5
        moving = d > MOVE_EPS_PX
        if moving and start is None:
            start = i - 1
        elif not moving and start is not None:
            beats.append((start, i - 1))
            start = None
    if start is not None:
        beats.append((start, len(pts) - 1))
    out = []
    for i, (a, b) in enumerate(beats):
        if b - a < 2:
            continue
        t0, t1 = pts[a]["t"], pts[b]["t"]
        rest_after = len(pts) - 1 - b
        out.append({"i": len(out) + 1, "t0": t0, "t1_seen": t1,
                    "dur_seen_ms": (t1 - t0) * 1000.0,
                    "i0": a, "i1": b, "rest_after": rest_after})
    return out


def beat_spec(track, beat, fps):
    """Rút thông số dán được vào GSAP/CSS. Không khớp easing nào thì ghi unfit — cấm bịa.

    Fit ĐỒNG THỜI (thời lượng, easing): easing giảm tốc mạnh có mấy frame cuối dịch dưới 1px,
    nên thời lượng thấy được luôn ngắn hơn thời lượng thật. Hình dạng đoạn đầu suy ngược ra nó.
    """
    pts = [r for r in track if r["cx"] is not None][beat["i0"]:beat["i1"] + 1]
    dx = pts[-1]["cx"] - pts[0]["cx"]
    dy = pts[-1]["cy"] - pts[0]["cy"]
    total = (dx * dx + dy * dy) ** 0.5
    span = pts[-1]["t"] - pts[0]["t"]
    taus, prog = [], []
    for p in pts:
        moved = ((p["cx"] - pts[0]["cx"]) ** 2 + (p["cy"] - pts[0]["cy"]) ** 2) ** 0.5
        taus.append(p["t"] - pts[0]["t"])
        prog.append(moved / total if total else 0.0)

    # chỉ được kéo dài trong phần clip mà phần tử đã đứng yên — không suy diễn ra ngoài dữ liệu
    max_extra = min(beat["rest_after"], round(span * fps * 0.6)) / fps
    best = (None, None, float("inf"), span)
    if len(taus) >= easing.MIN_SAMPLES:
        steps = int(round(max_extra * fps)) + 1
        for k in range(steps):
            d = span + k / fps
            scaled = [min(1.0, tau / d) for tau in taus]
            for nm, prm in easing.CANDIDATES.items():
                e = easing.rmse_against(scaled, prog, prm)
                if e < best[2]:
                    best = (nm, prm, e, d)
    name, params, rmse, dur = best
    unfit = easing.is_unfit(rmse)
    return {"dx": round(dx, 1), "dy": round(dy, 1),
            "t0": pts[0]["t"], "t1": pts[0]["t"] + dur, "dur_ms": round(dur * 1000.0),
            "dur_seen_ms": round(span * 1000.0),
            "ease": None if unfit else name,
            "bezier": None if unfit else "cubic-bezier(%g,%g,%g,%g)" % params,
            "rmse": rmse, "unfit": unfit,
            "scale_from": pts[0]["w"], "scale_to": pts[-1]["w"],
            "lum_from": pts[0]["lum"], "lum_to": pts[-1]["lum"]}


def build(frames_dir, outdir, fps):
    """Chạy trọn chặng motion: vùng → quỹ đạo → nhịp → thông số, ghi ra digest."""
    import json
    frames = load_frames(frames_dir)
    regions = detect_regions(frames)
    os.makedirs(outdir, exist_ok=True)
    specs = []
    for r in regions:
        track = track_region(frames, r)
        with open(os.path.join(outdir, f"track-{r['id']}.csv"), "w") as f:
            f.write("t,cx,cy,w,h,lum\n")
            for row in track:
                f.write("%.3f,%s,%s,%d,%d,%s\n" % (
                    row["t"],
                    "" if row["cx"] is None else "%.2f" % row["cx"],
                    "" if row["cy"] is None else "%.2f" % row["cy"],
                    row["w"], row["h"],
                    "" if row["lum"] is None else "%.1f" % row["lum"]))
        for b in find_beats(track, fps):
            s = beat_spec(track, b, fps)
            s["region"] = r["id"]
            specs.append(s)
    specs.sort(key=lambda s: (s["t0"], s["region"]))
    with open(os.path.join(outdir, "regions.json"), "w") as f:
        json.dump(regions, f, ensure_ascii=False, indent=2)
    with open(os.path.join(outdir, "specs.json"), "w") as f:
        json.dump(specs, f, ensure_ascii=False, indent=2)
    return regions, specs
