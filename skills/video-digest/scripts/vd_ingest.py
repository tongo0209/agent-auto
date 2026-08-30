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
# YouTube chặn client mặc định ("The page needs to be reloaded"); android còn qua được.
PLAYER_CLIENTS = ["android", "ios", "tv", "web_safari"]
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


def _pick_subs(d):
    """Ưu tiên tiếng Việt rồi tiếng Anh; phụ đề tay hơn phụ đề tự động."""
    names = [n for n in sorted(os.listdir(d)) if n.endswith((".srt", ".vtt"))]
    for lang in SUB_LANGS.split(","):
        for n in names:
            if f".{lang}." in n:
                return os.path.join(d, n)
    return os.path.join(d, names[0]) if names else None


class _Quiet:
    """Nuốt log của yt-dlp ở lượt thử phụ đề — thiếu một thứ tiếng là chuyện thường, in ERROR
    đỏ lòm ra màn hình chỉ làm người dùng tưởng hỏng."""

    def debug(self, msg):
        pass

    warning = error = debug


def _ydl(url, raw, extra, download=True):
    import yt_dlp
    opts = {"outtmpl": os.path.join(raw, "%(id)s.%(ext)s"), "quiet": True,
            "no_warnings": True, "noprogress": True, "skip_download": True,
            "extractor_args": {"youtube": {"player_client": PLAYER_CLIENTS}}}
    opts.update(extra)
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=download)


def remote(url, outdir, deep=False):
    """Ba lượt tách rời, không gộp: phụ đề một thứ tiếng hỏng (429, video không có tiếng đó)
    KHÔNG được kéo sập cả lần bóc — metadata mới là thứ luôn phải lấy được.

    Dùng API Python chứ không gọi CLI: pip --user để script ngoài PATH, và bản chuyển phụ đề
    sang .srt lại đòi ffmpeg — đọc thẳng .vtt cho khỏi thêm phụ thuộc.
    """
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        raise vdlib.Gate("G-VD-1 thiếu yt-dlp — cài bằng: python3 -m pip install --user yt-dlp")
    raw = os.path.join(outdir, "source")
    os.makedirs(raw, exist_ok=True)

    try:
        info = _ydl(url, raw, {"writeinfojson": True, "writedescription": True})
    except Exception as e:
        cause = str(e).splitlines()[0][:200]
        hint = ""
        if "[generic]" in str(e) or "Unsupported URL" in str(e):
            hint = ("\n  Trang này không phải nguồn video. Adapter tự quay trang web CHƯA LÀM — "
                    "tạm thời quay màn hình tay (⇧⌘5 trên macOS) rồi đưa file cho /video-digest.")
        raise vdlib.Gate(f"G-VD-2 không bóc được nguồn: {url}\n  {cause}{hint}")

    subs = None
    for lang in SUB_LANGS.split(","):
        try:
            _ydl(url, raw, {"writesubtitles": True, "writeautomaticsub": True,
                            "subtitleslangs": [lang], "logger": _Quiet()})
        except Exception:
            continue
        subs = _pick_subs(raw)
        if subs:
            break

    video = None
    if deep:
        _ydl(url, raw, {"format": DEEP_FORMAT, "skip_download": False})
        video = _first(raw, ".mp4", ".mkv", ".webm")

    return {"kind": "youtube", "path": video, "url": url, "sha256": None,
            "title": info.get("title") or url, "subs": subs,
            "duration": float(info.get("duration") or 0),
            "uploader": info.get("uploader"),
            "description": (info.get("description") or "")[:4000],
            "chapters": [{"start": c.get("start_time", 0), "title": c.get("title", "")}
                         for c in (info.get("chapters") or [])]}


def ingest(source, outdir, deep=False):
    if source.startswith("http://") or source.startswith("https://"):
        return remote(source, outdir, deep)
    return local(source, outdir)


if __name__ == "__main__":
    print(json.dumps(ingest(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=2))
