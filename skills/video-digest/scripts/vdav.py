"""Decode video bằng PyAV (thư viện FFmpeg nằm sẵn trong wheel) — không cần binary ngoài.

Máy này chặn ghcr.io nên brew không tải nổi bottle ffmpeg; PyPI thì thông. Đổi sang PyAV còn
gọn hơn CLI: có timestamp chuẩn từ container, khỏi parse `showinfo`, khỏi thoát chuỗi `lavfi`.
"""
import numpy as np


def _require():
    try:
        import av
    except ImportError:
        raise ImportError("G-VD-1 thiếu PyAV — cài bằng: python3 -m pip install --user av")
    return av


def info(path):
    av = _require()
    with av.open(path) as c:
        if not c.streams.video:
            raise ValueError("G-VD-2 file không có luồng video nào")
        v = c.streams.video[0]
        dur = float(c.duration / av.time_base) if c.duration else 0.0
        if not dur and v.duration and v.time_base:
            dur = float(v.duration * v.time_base)
        return {"w": v.width, "h": v.height,
                "fps": round(float(v.average_rate), 3) if v.average_rate else 0.0,
                "codec": v.codec_context.name, "duration": round(dur, 3),
                "has_audio": bool(c.streams.audio)}


def frames(path, max_fps=None, scale=1):
    """Sinh (t, ảnh xám) theo thứ tự thời gian. max_fps để lấy thưa, scale để thu nhỏ.

    EPS bắt buộc: mốc giây là số thực dồn sai số, `0.24000000000000002 < 0.24000000000000004`
    làm rơi oan frame đúng nhịp — mất 5/28 frame và hỏng luôn phép đo easing.
    """
    av = _require()
    step = 1.0 / max_fps if max_fps else 0.0
    eps = step * 1e-3
    nxt = -1.0
    with av.open(path) as c:
        v = c.streams.video[0]
        v.thread_type = "AUTO"
        for frame in c.decode(video=0):
            t = float(frame.pts * v.time_base) if frame.pts is not None else 0.0
            if step and t < nxt - eps:
                continue
            nxt = t + step if step else nxt
            g = frame.to_ndarray(format="gray")
            if scale > 1:
                g = g[::scale, ::scale]
            yield t, g


def encode(images, path, fps):
    """Ghi video KHÔNG NÉN (ffv1) — dùng cho test, để nén ảnh không làm sai số đo chuyển động."""
    av = _require()
    with av.open(path, "w") as out:
        st = out.add_stream("ffv1", rate=fps)
        st.width, st.height = images[0].width, images[0].height
        st.pix_fmt = "gray"
        for im in images:
            for pkt in st.encode(av.VideoFrame.from_image(im.convert("L"))):
                out.mux(pkt)
        for pkt in st.encode():
            out.mux(pkt)


def mean_abs_diff(a, b):
    return float(np.abs(a.astype(np.int16) - b.astype(np.int16)).mean())
