"""Chặng sample: tách frame + bỏ frame trùng, tên file mang luôn mốc giây."""
import os
import re
import sys
from PIL import Image
import vdlib

DEDUPE_FILTER = "mpdecimate=hi=768:lo=320:frac=0.33"
DENSE_FPS_CAP = 30
MAX_FRAMES = 600
SHEET_COLS, SHEET_ROWS, SHEET_TILE_W = 4, 4, 384
PTS_RE = re.compile(r"pts_time:([0-9.]+)")


def extract(video, outdir, dense=False, fps=None, max_frames=MAX_FRAMES):
    """dense=True giữ mọi frame (cần cho đo animation); mặc định bỏ frame trùng (screencast)."""
    vdlib.gate_binaries("ffmpeg")
    os.makedirs(outdir, exist_ok=True)
    vf = f"fps={min(fps or DENSE_FPS_CAP, DENSE_FPS_CAP)}" if dense else DEDUPE_FILTER
    raw = os.path.join(outdir, "_raw")
    os.makedirs(raw, exist_ok=True)
    rc, _, err = vdlib.run(["ffmpeg", "-v", "info", "-i", video, "-vf", f"{vf},showinfo",
                            "-vsync", "vfr", "-f", "image2", os.path.join(raw, "%06d.png")])
    times = [float(m) for m in PTS_RE.findall(err)]
    files = sorted(f for f in os.listdir(raw) if f.endswith(".png"))
    if rc != 0 or not files:
        raise vdlib.Gate(f"G-VD-2 tách frame thất bại:\n{err.strip()[-400:]}")
    if len(times) != len(files):
        times = [i / (fps or DENSE_FPS_CAP) for i in range(len(files))]
    stride = max(1, -(-len(files) // max_frames))
    kept = []
    for i in range(0, len(files), stride):
        t = times[i]
        dst = os.path.join(outdir, vdlib.frame_name(t))
        os.replace(os.path.join(raw, files[i]), dst)
        kept.append({"t": round(t, 3), "file": os.path.basename(dst)})
    for leftover in os.listdir(raw):
        os.remove(os.path.join(raw, leftover))
    os.rmdir(raw)
    gate_count(kept, dense)
    return kept, stride


def gate_count(kept, dense):
    """G-VD-3 — dedupe ra 0 frame là hỏng; ra quá trần đã bị stride chặn trước đó."""
    if not kept:
        raise vdlib.Gate("G-VD-3 sau khi lọc không còn frame nào — tham số mpdecimate hỏng")
    if not dense and len(kept) > MAX_FRAMES:
        raise vdlib.Gate(f"G-VD-3 còn {len(kept)} frame sau dedupe, vượt trần {MAX_FRAMES}")


def contact_sheets(frames, outdir):
    """Ghép lưới để nhìn 1 phát — 16 khoảnh khắc trong 1 ảnh thay vì 16 ảnh rời."""
    os.makedirs(outdir, exist_ok=True)
    per = SHEET_COLS * SHEET_ROWS
    sheets = []
    for s in range(0, len(frames), per):
        chunk = frames[s:s + per]
        thumbs = []
        for fr in chunk:
            im = Image.open(fr["path"])
            th = im.resize((SHEET_TILE_W, max(1, round(im.height * SHEET_TILE_W / im.width))))
            thumbs.append(th)
        tw, thh = thumbs[0].size
        rows = -(-len(thumbs) // SHEET_COLS)
        sheet = Image.new("RGB", (SHEET_COLS * tw, rows * thh), (20, 20, 24))
        for i, th in enumerate(thumbs):
            sheet.paste(th, ((i % SHEET_COLS) * tw, (i // SHEET_COLS) * thh))
        name = f"sheet-{len(sheets) + 1:02d}.png"
        sheet.save(os.path.join(outdir, name))
        sheets.append({"file": name, "t0": chunk[0]["t"], "t1": chunk[-1]["t"],
                       "count": len(chunk)})
    return sheets


if __name__ == "__main__":
    kept, stride = extract(sys.argv[1], sys.argv[2], dense="--dense" in sys.argv)
    print(f"{len(kept)} frame (stride {stride})")
