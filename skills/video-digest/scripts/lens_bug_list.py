"""Lens bug-list: mốc đáng ngờ + bằng chứng, format dán vào buglist cho /bug-fixer-lite. 0 token.

Script KHÔNG hiểu bug là gì — nó chỉ gom bằng chứng quanh từng mốc: người quay nói gì,
màn hình ghi gì, frame nào. Phần đọc hiểu để người hoặc AI làm sau, trên bản đã gom.
"""
import json
import os
import sys
import vd_text
import vdlib

WINDOW = 3.0
MERGE_GAP = 1.0


def _mmss(t):
    return f"{int(t) // 60:d}:{int(t) % 60:02d}"


def merge_marks(times):
    """Gom mốc từ MỌI nguồn bằng chứng (cắt cảnh · nhịp animation · chữ đổi · lời nói), rồi
    dồn các mốc sát nhau lại — một sự kiện thường kích hoạt nhiều nguồn cùng lúc."""
    out = []
    for t in sorted(round(x, 2) for x in times):
        if not out or t - out[-1] > MERGE_GAP:
            out.append(t)
    return out


def _bounds(marks, i):
    """Mỗi mốc chỉ được nhận bằng chứng tới NỬA đường sang mốc bên cạnh — nếu không, cùng một
    câu nói bị gán cho mọi mốc và bảng thành vô dụng."""
    lo = marks[i] - WINDOW
    hi = marks[i] + WINDOW
    if i > 0:
        lo = max(lo, (marks[i - 1] + marks[i]) / 2)
    if i < len(marks) - 1:
        hi = min(hi, (marks[i] + marks[i + 1]) / 2)
    return lo, hi


def _within(rows, lo, hi):
    return [r for r in rows if lo <= float(r["t"]) <= hi and r.get("text", "").strip()]


def render(digest_dir):
    d = vdlib.jload(os.path.join(digest_dir, "digest.json"))
    onscreen_p = os.path.join(digest_dir, "text", "onscreen.csv")
    onscreen = vdlib.csv_load(onscreen_p) if os.path.exists(onscreen_p) else []
    subs_p = os.path.join(digest_dir, "text", "subs.csv")
    subs = vdlib.csv_load(subs_p) if os.path.exists(subs_p) else []
    specs_p = os.path.join(digest_dir, "motion", "specs.json")
    beats = [s["t0"] for s in json.load(open(specs_p))] if os.path.exists(specs_p) else []
    marks = merge_marks(d["signals"].get("cut_times", []) + beats
                        + [s["t"] for s in vd_text.screen_changes(onscreen)]
                        + [float(r["t"]) for r in subs])
    frames = vdlib.list_frames(os.path.join(digest_dir, "frames"))

    out = ["# Buglist nháp — gom từ video", "",
           f"Nguồn: `{d['source'].get('path') or d['source'].get('url')}` · "
           f"{d['media']['duration']}s · {len(marks)} mốc đáng ngờ", "",
           "> Script chỉ **gom bằng chứng**, không phán bug. Đọc cột *Người quay nói* và "
           "*Chữ trên màn* rồi tự viết mô tả bug, sau đó đưa sang `/bug-fixer-lite`.", "",
           "| # | Mốc | Người quay nói | Chữ trên màn | Frame chứng |",
           "|---|---|---|---|---|"]
    for i, t in enumerate(marks):
        lo, hi = _bounds(marks, i)
        said = " ".join(r["text"] for r in _within(subs, lo, hi))[:180].replace("|", "/")
        near_txt = min(onscreen, key=lambda r: abs(float(r["t"]) - t), default=None)
        seen = near_txt["text"].split("\n")[0][:120].replace("|", "/") if near_txt else ""
        near = min(frames, key=lambda f: abs(f["t"] - t), default=None)
        shot = f"`frames/{os.path.basename(near['path'])}`" if near else "—"
        out.append(f"| {i + 1} | {_mmss(t)} | {said or '—'} | {seen or '—'} | {shot} |")
    out += ["", "## Dán sang sheet", "",
            "Cột `Mô tả` tự viết từ 2 cột giữa; cột `Notes` để trống cho `/bug-fixer-lite` ghi."]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    print(render(sys.argv[1]))
