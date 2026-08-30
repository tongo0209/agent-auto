"""Lens bug-list: mốc đáng ngờ + bằng chứng, format dán vào buglist cho /bug-fixer-lite. 0 token.

Script KHÔNG hiểu bug là gì — nó chỉ gom bằng chứng quanh từng mốc: người quay nói gì,
màn hình ghi gì, frame nào. Phần đọc hiểu để người hoặc AI làm sau, trên bản đã gom.
"""
import json
import os
import sys
import vdlib

WINDOW = 3.0


def _mmss(t):
    return f"{int(t) // 60:d}:{int(t) % 60:02d}"


def _near(rows, t, key="text"):
    return [r for r in rows if abs(float(r["t"]) - t) <= WINDOW and r.get(key, "").strip()]


def render(digest_dir):
    d = vdlib.jload(os.path.join(digest_dir, "digest.json"))
    cuts = d["signals"].get("cut_times", [])
    specs_p = os.path.join(digest_dir, "motion", "specs.json")
    beats = [s["t0"] for s in json.load(open(specs_p))] if os.path.exists(specs_p) else []
    marks = sorted(set(round(t, 1) for t in cuts + beats))

    onscreen_p = os.path.join(digest_dir, "text", "onscreen.csv")
    onscreen = vdlib.csv_load(onscreen_p) if os.path.exists(onscreen_p) else []
    subs_p = os.path.join(digest_dir, "text", "subs.csv")
    subs = vdlib.csv_load(subs_p) if os.path.exists(subs_p) else []
    frames = vdlib.list_frames(os.path.join(digest_dir, "frames"))

    out = ["# Buglist nháp — gom từ video", "",
           f"Nguồn: `{d['source'].get('path') or d['source'].get('url')}` · "
           f"{d['media']['duration']}s · {len(marks)} mốc đáng ngờ", "",
           "> Script chỉ **gom bằng chứng**, không phán bug. Đọc cột *Người quay nói* và "
           "*Chữ trên màn* rồi tự viết mô tả bug, sau đó đưa sang `/bug-fixer-lite`.", "",
           "| # | Mốc | Người quay nói | Chữ trên màn | Frame chứng |",
           "|---|---|---|---|---|"]
    for i, t in enumerate(marks, 1):
        said = " ".join(r["text"] for r in _near(subs, t))[:180].replace("|", "/")
        seen = " / ".join(r["text"].split("\n")[0] for r in _near(onscreen, t))[:120]
        seen = seen.replace("|", "/")
        near = min(frames, key=lambda f: abs(f["t"] - t), default=None)
        shot = f"`frames/{os.path.basename(near['path'])}`" if near else "—"
        out.append(f"| {i} | {_mmss(t)} | {said or '—'} | {seen or '—'} | {shot} |")
    out += ["", "## Dán sang sheet", "",
            "Cột `Mô tả` tự viết từ 2 cột giữa; cột `Notes` để trống cho `/bug-fixer-lite` ghi."]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    print(render(sys.argv[1]))
