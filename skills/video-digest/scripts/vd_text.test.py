"""Test phần text không cần tesseract: parse phụ đề + gộp cụm code gõ dần."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tempfile
import vd_text

FAIL = []


def ok(cond, what):
    if not cond:
        FAIL.append(what)


SRT = """1
00:00:04,120 --> 00:00:06,000
chỗ này nút bị lệch

2
00:00:06,000 --> 00:00:08,500
chỗ này nút bị lệch

3
00:01:02,250 --> 00:01:04,000
<i>còn</i> popup thì sai màu
"""

with tempfile.NamedTemporaryFile("w", suffix=".srt", delete=False, encoding="utf-8") as f:
    f.write(SRT)
    p = f.name
rows = vd_text.subs_to_md(p)
os.unlink(p)

ok(len(rows) == 2, f"auto-caption lặp phải gộp còn 2 dòng, được {len(rows)}")
ok(abs(rows[0][0] - 4.12) < 1e-6, f"mốc giây phải là 4.12, được {rows[0][0]}")
ok(abs(rows[1][0] - 62.25) < 1e-6, f"mốc phút:giây phải quy ra 62.25s, được {rows[1][0]}")
ok("<i>" not in rows[1][1], "phải gỡ tag của VTT/SRT")

# ── gõ code là text tăng dần: 4 frame nhưng chỉ 1 snapshot đáng giữ ────────────
grow = [
    {"t": 1.0, "text": "function a() {\n  const x = 1;"},
    {"t": 2.0, "text": "function a() {\n  const x = 1;\n  const y = 2;"},
    {"t": 3.0, "text": "function a() {\n  const x = 1;\n  const y = 2;\n  return x + y;\n}"},
    {"t": 9.0, "text": "import gsap from 'gsap';\nconst tl = gsap.timeline();\nexport default tl;"},
]
snips = vd_text.growth_snippets(grow)
ok(len(snips) == 2, f"phải còn 2 snippet (1 cụm code + 1 file mới), được {len(snips)}")
ok("return x + y" in snips[0]["text"], "snippet 1 phải là bản ĐẦY ĐỦ cuối cụm")
ok(snips[1]["t"] == 9.0, "snippet 2 phải là file mới ở giây 9")

short = vd_text.growth_snippets([{"t": 1.0, "text": "ok"}])
ok(short == [], "text quá ngắn thì không được coi là snippet code")

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print("✅ vd_text: pass")
