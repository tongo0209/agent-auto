"""Lens step-list: cắt cảnh + chữ trên màn → danh sách bước có mốc giây. 0 token."""
import os
import sys
import vdlib

MAX_LINES = 4


def _mmss(t):
    return f"{int(t) // 60:d}:{int(t) % 60:02d}"


def render(digest_dir):
    d = vdlib.jload(os.path.join(digest_dir, "digest.json"))
    onscreen_p = os.path.join(digest_dir, "text", "onscreen.csv")
    if not os.path.exists(onscreen_p):
        return "# Danh sách bước\n\nDigest này chưa chạy OCR — không dựng được bước.\n"
    rows = vdlib.csv_load(onscreen_p)
    cuts = [0.0] + d["signals"].get("cut_times", [])

    out = ["# Danh sách bước", "", f"{len(cuts)} màn · {d['media']['duration']}s", ""]
    for t in cuts:
        near = min(rows, key=lambda r: abs(float(r["t"]) - t), default=None)
        if not near:
            continue
        lines = [ln.strip() for ln in near["text"].split("\n") if ln.strip()][:MAX_LINES]
        out.append(f"**{_mmss(t)}** — " + (lines[0] if lines else "(không đọc được chữ)"))
        for ln in lines[1:]:
            out.append(f"  - {ln}")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    print(render(sys.argv[1]))
