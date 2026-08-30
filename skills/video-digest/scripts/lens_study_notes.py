"""Lens study-notes: nén digest thành brief cho AI đọc MỘT lần rồi viết notes.md.

Đây là lens DUY NHẤT cần AI. Script lo phần nén (0 token); AI chỉ đọc bản nén.
"""
import json
import os
import sys
import vdlib

TRANSCRIPT_CHARS = 18000
SNIPPET_CHARS = 6000


def _mmss(t):
    return f"{int(t) // 60:d}:{int(t) % 60:02d}"


def render(digest_dir):
    d = vdlib.jload(os.path.join(digest_dir, "digest.json"))
    out = [f"# Brief để viết notes — {d['slug']}", "",
           f"- Nguồn: {d['source'].get('url') or d['source'].get('path')}",
           f"- Thời lượng: {d['media']['duration']}s · {d['media']['w']}×{d['media']['h']}",
           f"- Loại đoán được: {d['classify']['guess']}", ""]

    for ch in d.get("chapters", []):
        out.append(f"  - {_mmss(ch['start'])} {ch['title']}")
    if d.get("chapters"):
        out.insert(len(out) - len(d["chapters"]), "## Chương")

    subs_p = os.path.join(digest_dir, "text", "subs.csv")
    if os.path.exists(subs_p):
        rows = vdlib.csv_load(subs_p)
        body, n = [], 0
        for r in rows:
            line = f"[{_mmss(float(r['t']))}] {r['text']}"
            n += len(line)
            if n > TRANSCRIPT_CHARS:
                body.append(f"... (cắt bớt, còn {len(rows) - len(body)} dòng trong subs.csv)")
                break
            body.append(line)
        out += ["", "## Lời giảng", ""] + body

    snip_dir = os.path.join(digest_dir, "snippets")
    if os.path.isdir(snip_dir):
        out += ["", "## Code bóc được từ màn hình", ""]
        n = 0
        for name in sorted(os.listdir(snip_dir)):
            text = open(os.path.join(snip_dir, name)).read()
            n += len(text)
            if n > SNIPPET_CHARS:
                out.append(f"... (còn snippet khác trong `snippets/`)")
                break
            out += [f"### {name}", "```", text.rstrip(), "```"]

    specs_p = os.path.join(digest_dir, "motion", "specs.json")
    if os.path.exists(specs_p):
        specs = json.load(open(specs_p))
        if specs:
            out += ["", "## Chuyển động đo được", ""]
            for s in specs:
                ease = s["bezier"] or "unfit"
                out.append(f"- {_mmss(s['t0'])} `{s['region']}` dx={s['dx']} dy={s['dy']} "
                           f"{s['dur_ms']}ms {ease}")

    out += ["", "## Việc của AI", "",
            "Đọc bản trên rồi viết `notes.md` theo đúng 5 mục: **Ý chính** · "
            "**Kỹ thuật dùng được** · **Code rút ra** · **Bẫy tác giả nhắc** · "
            "**Mốc cần xem lại**. Không mở lại video, không mở frame trừ khi thật sự bí."]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    print(render(sys.argv[1]))
