"""Chặng sample: tách frame + bỏ frame trùng, tên file mang luôn mốc giây."""
import os
import sys
from PIL import Image
import vdav
import vdlib

DEDUPE_DIFF = 1.2
DENSE_FPS_CAP = 30
MAX_FRAMES = 600
SHEET_COLS, SHEET_ROWS, SHEET_TILE_W = 4, 4, 384


def extract(video, outdir, dense=False, fps=None, max_frames=MAX_FRAMES):
    """dense=True giữ mọi frame (cần cho đo animation); mặc định bỏ frame gần như y hệt
    frame trước — quay màn hình đứng yên 90% thời lượng thì bỏ được gần hết."""
    os.makedirs(outdir, exist_ok=True)
    cap = min(fps or DENSE_FPS_CAP, DENSE_FPS_CAP)
    picked, last, seen = [], None, 0
    for t, g in vdav.frames(video, max_fps=cap if dense else None):
        seen += 1
        if not dense and last is not None and vdav.mean_abs_diff(g, last) < DEDUPE_DIFF:
            continue
        last = g
        picked.append((t, g))
    stride = max(1, -(-len(picked) // max_frames))
    kept = []
    for t, g in picked[::stride]:
        name = vdlib.frame_name(t)
        Image.fromarray(g).save(os.path.join(outdir, name))
        kept.append({"t": round(t, 3), "file": name})
    warn = gate_count(kept, len(picked), dense)
    return kept, stride, warn


def gate_count(kept, raw_count, dense):
    """G-VD-3 — 0 frame là hỏng thật, dừng. Dedupe kém hiệu quả chỉ cảnh báo: screencast dày
    đặc thao tác vẫn có thể còn nhiều frame thật, chặn cứng ở đây là chặn nhầm việc hợp lệ."""
    if not kept:
        raise vdlib.Gate("G-VD-3 sau khi lọc không còn frame nào — video rỗng hoặc decode hỏng")
    if not dense and raw_count > MAX_FRAMES:
        return (f"G-VD-3 dedupe chỉ còn {raw_count} frame (trần {MAX_FRAMES}) — đã lấy thưa, "
                f"kiểm lại nếu video lẽ ra phải tĩnh")
    return None


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
            thumbs.append(im.resize((SHEET_TILE_W,
                                     max(1, round(im.height * SHEET_TILE_W / im.width)))))
        tw, th = thumbs[0].size
        rows = -(-len(thumbs) // SHEET_COLS)
        sheet = Image.new("RGB", (SHEET_COLS * tw, rows * th), (20, 20, 24))
        for i, t in enumerate(thumbs):
            sheet.paste(t.convert("RGB"), ((i % SHEET_COLS) * tw, (i // SHEET_COLS) * th))
        name = f"sheet-{len(sheets) + 1:02d}.png"
        sheet.save(os.path.join(outdir, name))
        sheets.append({"file": name, "t0": chunk[0]["t"], "t1": chunk[-1]["t"],
                       "count": len(chunk)})
    return sheets


if __name__ == "__main__":
    kept, stride, warn = extract(sys.argv[1], sys.argv[2], dense="--dense" in sys.argv)
    print(f"{len(kept)} frame (stride {stride})" + (f" ⚠ {warn}" if warn else ""))
