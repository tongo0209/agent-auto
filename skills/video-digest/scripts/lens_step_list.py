"""Lens step-list: chữ trên màn đổi = sang bước mới. 0 token.

Phân đoạn theo THAY ĐỔI CHỮ chứ không theo cắt cảnh: ngưỡng cắt cảnh phải hiệu chỉnh theo
từng kiểu video, còn "chữ trên màn khác đi" thì đúng với mọi tutorial thao tác.
"""
import os
import sys
import vd_text
import vdlib

MAX_LINES = 4


def _mmss(t):
    return f"{int(t) // 60:d}:{int(t) % 60:02d}"


def render(digest_dir):
    onscreen = os.path.join(digest_dir, "text", "onscreen.csv")
    if not os.path.exists(onscreen):
        return ("# Danh sách bước\n\nDigest này chưa chạy OCR — không dựng được bước.\n"
                "Chạy lại với `--lens step-list` và cài OCR "
                "(`python3 -m pip install --user rapidocr-onnxruntime`).\n")
    steps = vd_text.screen_changes(vdlib.csv_load(onscreen))
    d = vdlib.jload(os.path.join(digest_dir, "digest.json"))
    out = ["# Danh sách bước", "", f"{len(steps)} màn · {d['media']['duration']}s", ""]
    for s in steps:
        lines = [ln.strip() for ln in s["text"].split("\n") if ln.strip()][:MAX_LINES]
        out.append(f"**{_mmss(s['t'])}** — {lines[0]}")
        out += [f"  - {ln}" for ln in lines[1:]]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    print(render(sys.argv[1]))
