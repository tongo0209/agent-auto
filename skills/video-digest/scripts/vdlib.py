"""Tiện ích chung cho mọi chặng: chạy ffmpeg, cổng kiểm, đọc/ghi digest."""
import csv
import json
import os
import re
import shutil
import subprocess
import unicodedata

FRAME_RE = re.compile(r"t(\d+\.\d+)\.png$")


class Gate(Exception):
    """Cổng kiểm cơ học chặn — dừng hẳn thay vì đẻ ra digest rác."""


def have(binary):
    return shutil.which(binary) is not None


def gate_binaries(*needed):
    """G-VD-1 — thiếu binary thì in đúng lệnh cài, không đoán mò tiếp."""
    missing = [b for b in needed if not have(b)]
    if missing:
        raise Gate(f"G-VD-1 thiếu binary: {' '.join(missing)}\n"
                   f"  cài bằng: brew install {' '.join(missing)}")


def run(cmd, capture_err=True):
    p = subprocess.run(cmd, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE if capture_err else None, text=True)
    return p.returncode, p.stdout, (p.stderr or "")


def frame_name(t):
    return f"t{t:08.3f}.png"


def frame_time(name):
    m = FRAME_RE.search(name)
    return float(m.group(1)) if m else None


def list_frames(d):
    out = []
    for name in sorted(os.listdir(d)):
        t = frame_time(name)
        if t is not None:
            out.append({"t": t, "path": os.path.join(d, name)})
    return out


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return (s or "video")[:60]


def jdump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def jload(path):
    with open(path) as f:
        return json.load(f)


def csv_dump(path, rows, cols):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def csv_load(path):
    with open(path) as f:
        return list(csv.DictReader(f))
