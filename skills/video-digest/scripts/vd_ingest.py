"""Chặng ingest: mọi nguồn quy về một hợp đồng — file video local + metadata.

Với YouTube: MẶC ĐỊNH không tải video. Phụ đề + chapters + description thường đã đủ,
và tải về là chuyện tốn phút, tốn ổ. Chỉ --deep mới tải.
"""
import hashlib
import json
import os
import sys
import vdlib

SUB_LANGS = "vi,en"
DEEP_FORMAT = "bv*[height<=1080]+ba/b"


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def _first(d, *exts):
    for name in sorted(os.listdir(d)):
        if name.endswith(exts):
            return os.path.join(d, name)
    return None


def local(path, outdir):
    if not os.path.exists(path):
        raise vdlib.Gate(f"G-VD-2 không thấy file: {path}")
    return {"kind": "local", "path": os.path.abspath(path), "url": None,
            "sha256": _sha256(path), "title": os.path.splitext(os.path.basename(path))[0]}


def remote(url, outdir, deep=False):
    vdlib.gate_binaries("yt-dlp")
    raw = os.path.join(outdir, "source")
    os.makedirs(raw, exist_ok=True)
    cmd = ["yt-dlp", "--no-progress", "--write-info-json", "--write-description",
           "--write-subs", "--write-auto-subs", "--sub-langs", SUB_LANGS,
           "--convert-subs", "srt", "-o", os.path.join(raw, "%(id)s.%(ext)s")]
    cmd += (["-f", DEEP_FORMAT] if deep else ["--skip-download"])
    rc, out, err = vdlib.run(cmd + [url])
    if rc != 0:
        raise vdlib.Gate(f"G-VD-2 yt-dlp thất bại:\n{err.strip()[-400:]}")
    info_path = _first(raw, ".info.json")
    info = json.load(open(info_path)) if info_path else {}
    return {"kind": "youtube", "path": _first(raw, ".mp4", ".mkv", ".webm"), "url": url,
            "sha256": None, "title": info.get("title") or url,
            "subs": _first(raw, ".srt", ".vtt"),
            "description": (info.get("description") or "")[:4000],
            "chapters": [{"start": c.get("start_time", 0), "title": c.get("title", "")}
                         for c in (info.get("chapters") or [])]}


def ingest(source, outdir, deep=False):
    if source.startswith("http://") or source.startswith("https://"):
        return remote(source, outdir, deep)
    return local(source, outdir)


if __name__ == "__main__":
    print(json.dumps(ingest(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=2))
