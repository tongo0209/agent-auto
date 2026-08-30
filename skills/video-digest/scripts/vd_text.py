"""Chặng text: phụ đề + OCR chữ trên màn hình + gộp cụm code gõ dần thành snippet."""
import difflib
import os
import re
import sys
import tempfile
import numpy as np
from PIL import Image
import vdlib

OCR_UPSCALE = 3
DARK_MEAN = 128
EMPTY_WARN_RATIO = 0.9
EDGE_BUSY = 6.0
LINE_GAP = 12
SAME_SCREEN = 0.7
TS_RE = re.compile(r"(\d\d):(\d\d):(\d\d)[.,](\d{1,3})\s*-->")
TAG_RE = re.compile(r"<[^>]+>")


def subs_to_md(sub_path):
    """SRT/VTT → markdown có mốc giây, gộp dòng trùng của auto-caption."""
    out, cur_t, buf, last = [], None, [], None
    for line in open(sub_path, encoding="utf-8", errors="ignore"):
        line = line.strip()
        m = TS_RE.search(line)
        if m:
            if buf and cur_t is not None:
                text = " ".join(buf).strip()
                if text and text != last:
                    out.append((cur_t, text))
                    last = text
            h, mi, s, ms = m.groups()
            cur_t = int(h) * 3600 + int(mi) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000
            buf = []
        elif line and not line.isdigit() and not line.startswith("WEBVTT"):
            buf.append(TAG_RE.sub("", line))
    if buf and cur_t is not None:
        text = " ".join(buf).strip()
        if text and text != last:
            out.append((cur_t, text))
    return out


def _prep(path, tmpdir):
    """Phóng 3x + đảo màu nếu nền tối — hai mẹo này đưa OCR code từ ~70% lên ~95%."""
    im = Image.open(path).convert("L")
    if np.asarray(im, dtype=np.float32).mean() < DARK_MEAN:
        im = Image.eval(im, lambda v: 255 - v)
    im = im.resize((im.width * OCR_UPSCALE, im.height * OCR_UPSCALE), Image.LANCZOS)
    dst = os.path.join(tmpdir, os.path.basename(path))
    im.save(dst)
    return dst


_ENGINE = None


def backend():
    """tesseract nếu máy có; không thì RapidOCR (wheel PyPI, không cần binary hệ thống)."""
    if vdlib.have("tesseract"):
        return "tesseract"
    try:
        import rapidocr_onnxruntime  # noqa: F401
        return "rapidocr"
    except ImportError:
        return None


def group_lines(result):
    """RapidOCR trả từng ô chữ rời — gom lại thành dòng theo toạ độ y rồi mới nối trái→phải."""
    if not result:
        return ""
    boxes = sorted(((min(p[1] for p in box), min(p[0] for p in box), text)
                    for box, text, _score in result))
    lines, cur, line_y = [], [], None
    for y, x, text in boxes:
        if line_y is not None and y - line_y > LINE_GAP:
            lines.append(" ".join(t for _, t in sorted(cur)))
            cur, line_y = [], None
        if line_y is None:
            line_y = y
        cur.append((x, text))
    if cur:
        lines.append(" ".join(t for _, t in sorted(cur)))
    return "\n".join(lines)


def _rapidocr_text(path):
    global _ENGINE
    if _ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR
        _ENGINE = RapidOCR()
    result, _ = _ENGINE(path)
    return group_lines(result)


def ocr_frames(frames):
    engine = backend()
    if engine is None:
        raise vdlib.Gate("G-VD-1 chưa có OCR — cài 1 trong 2:\n"
                         "  brew install tesseract tesseract-lang   (cần mạng tới ghcr.io)\n"
                         "  python3 -m pip install --user rapidocr-onnxruntime")
    rows = []
    with tempfile.TemporaryDirectory(prefix="vdocr-") as tmp:
        for fr in frames:
            if engine == "tesseract":
                rc, out, _ = vdlib.run(["tesseract", _prep(fr["path"], tmp), "-",
                                        "--psm", "6", "-c", "preserve_interword_spaces=1"])
                text = out.rstrip()
            else:
                text = _rapidocr_text(fr["path"])
            rows.append({"t": fr["t"], "text": text})
    return rows


def gate_ocr(rows, frames):
    """G-VD-4 — OCR rỗng gần hết trong khi ảnh nhiều cạnh = tham số sai, cảnh báo chứ không dừng."""
    if not rows:
        return None
    empty = sum(1 for r in rows if not r["text"].strip()) / len(rows)
    if empty < EMPTY_WARN_RATIO:
        return None
    g = np.asarray(Image.open(frames[len(frames) // 2]["path"]).convert("L"), dtype=np.float32)
    busy = float(np.abs(np.diff(g, axis=1)).mean())
    if busy > EDGE_BUSY:
        return (f"G-VD-4 {empty:.0%} frame OCR ra rỗng nhưng ảnh nhiều chi tiết "
                f"(cạnh {busy:.1f}) — nhiều khả năng sai vùng crop hoặc ngưỡng")
    return None


def growth_snippets(rows, min_chars=40):
    """Gõ code là text tăng dần: giữ frame CUỐI của mỗi đoạn tăng trưởng, bỏ hết frame giữa."""
    snippets, run = [], []
    for r in rows:
        t = r["text"].strip()
        if len(t) < min_chars:
            continue
        prev = run[-1]["text"].strip() if run else ""
        if prev and not _grew(prev, t):
            snippets.append(run[-1])
            run = []
        run.append({"t": r["t"], "text": t})
    if run:
        snippets.append(run[-1])
    return snippets


def _grew(prev, cur):
    """cur được coi là bản nối tiếp của prev nếu giữ lại phần lớn nội dung cũ."""
    keep = sum(1 for ln in prev.splitlines() if ln.strip() and ln in cur)
    total = sum(1 for ln in prev.splitlines() if ln.strip())
    return total == 0 or keep / total >= 0.6


if __name__ == "__main__":
    for t, text in subs_to_md(sys.argv[1]):
        print(f"[{int(t) // 60:02d}:{t % 60:06.3f}] {text}")


def screen_changes(rows):
    """Chữ trên màn đổi hẳn = sang màn mới. Bền hơn dựa vào cắt cảnh, vì ngưỡng cắt cảnh phải
    hiệu chỉnh theo từng kiểu video còn 'chữ khác đi' thì đúng với mọi tutorial thao tác."""
    out = []
    for r in rows:
        text = r["text"].strip()
        if not text:
            continue
        if out and difflib.SequenceMatcher(None, out[-1]["text"], text).ratio() > SAME_SCREEN:
            continue
        out.append({"t": float(r["t"]), "text": text})
    return out
