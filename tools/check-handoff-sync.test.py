#!/usr/bin/env python3
"""Self-test cho check-handoff-sync — dựng cặp Promotion/ ↔ mainsite/ giả trong thư mục tạm."""
import contextlib
import importlib.util
import io
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("chs", os.path.join(HERE, "check-handoff-sync.py"))
chs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chs)

FAIL = []


def eq(got, want, what):
    if got != want:
        FAIL.append(f"{what}\n    got  {got!r}\n    want {want!r}")


def quiet_main(argv):
    with contextlib.redirect_stdout(io.StringIO()):
        return chs.main(argv)


# ── tokens: markup, <br>, script/style/comment, entity, placeholder platform đều không phải chữ ──
eq(chs.tokens('<p>Mà lòng lại chỉ muốn cùng<br>người</p><script>var x="Bánh";</script><!-- Mến Mộ x9 -->'),
   ["Mà", "lòng", "lại", "chỉ", "muốn", "cùng", "người"], "tag/br/script/comment không phải chữ")
eq(chs.tokens('<body><% MODULE_CONTENT %><div>Qu&agrave; &amp; bạn</div><style>.a{content:"Xu"}</style></body>'),
   ["Quà", "&", "bạn"], "placeholder/style không phải chữ; entity phải giải mã")

# ── compare: sửa số ở 1 bên (GW-525) → 1 hunk gộp, vì ≤3 từ giống kẹp giữa không tách hunk ──
P = "PHẦN THƯỞNG Chòm Sao Tiểu Hùng ×20 Mến Mộ x1 Bánh Trung Thu x10 THÔNG BÁO Hết lượt rồi".split()
M = "PHẦN THƯỞNG Chòm Sao Tiểu Hùng x1 Mến Mộ x2 Bánh Trung Thu x1 THÔNG BÁO Hết lượt rồi".split()
r = chs.compare(P, M)
eq(r.pairs, [("×20 Mến Mộ x1 Bánh Trung Thu x10", "x1 Mến Mộ x2 Bánh Trung Thu x1")], "số lượng quà lệch thành 1 cặp")
eq((r.only_p, r.only_m, r.differs), ([], [], True), "không có đoạn 1-bên nào khác")

# ── block bị dời chỗ RỒI sửa: chỗ chỉ-P và chỗ chỉ-M gần giống phải ghép chéo thành cặp ──
P = "A B C D E F G H PHẦN THƯỞNG Chòm Sao Tiểu Hùng ×20 Mến Mộ x1".split()
M = "PHẦN THƯỞNG Chòm Sao Tiểu Hùng x1 Mến Mộ x2 A B C D E F G H".split()
r = chs.compare(P, M)
eq(r.pairs, [("PHẦN THƯỞNG Chòm Sao Tiểu Hùng ×20 Mến Mộ x1", "PHẦN THƯỞNG Chòm Sao Tiểu Hùng x1 Mến Mộ x2")],
   "block dời chỗ + sửa số vẫn ra cặp")
eq((r.only_p, r.only_m), ([], []), "ghép chéo xong không còn đoạn 1-bên")

# ── chỉ đổi thứ tự block, chữ y nhau → không phải lệch ──
eq(chs.compare("a b c d e f g h i j".split(), "f g h i j a b c d e".split()).differs, False, "đổi thứ tự block không phải lệch")

# ── đoạn chỉ 1 bên có, không giống gì bên kia → liệt kê riêng ──
r = chs.compare("X Y Z W Nhập mã hỗ trợ".split(), "Chia sẻ đèn lồng X Y Z W".split())
eq((r.pairs, r.only_p, r.only_m), ([], ["Nhập mã hỗ trợ"], ["Chia sẻ đèn lồng"]), "đoạn riêng mỗi bên")

# ── focus: in cặp từ 3 từ trước chỗ lệch đầu tiên để mắt thấy ngay số khác ──
eq(chs.focus("PHẦN THƯỞNG Chòm Sao Tiểu Hùng ×20 Mến Mộ x1", "PHẦN THƯỞNG Chòm Sao Tiểu Hùng x1 Mến Mộ x2"),
   ("…Sao Tiểu Hùng ×20 Mến Mộ x1", "…Sao Tiểu Hùng x1 Mến Mộ x2"), "cắt phần đầu giống nhau, giữ 3 từ ngữ cảnh")

# ── pair_files: cùng tên → gần tên (diemdanh-gnm ↔ diemdanh) → còn đúng 1 mỗi bên thì ghép nốt ──
eq(chs.pair_files(["gno.html", "diemdanh-gnm.html", "gnm.html"], ["gno.html", "diemdanh.html", "index.html"]),
   ([("gno.html", "gno.html"), ("diemdanh-gnm.html", "diemdanh.html"), ("gnm.html", "index.html")], [], []),
   "GunnyMobi: 3 file ghép được hết dù tên khác")
eq(chs.pair_files(["Frame2.html", "index.html"], ["fix/Frame2.html", "fix/index.html"]),
   ([("Frame2.html", "fix/Frame2.html"), ("index.html", "fix/index.html")], [], []),
   "GNOTW: mainsite để trong thư mục con vẫn ghép theo tên")
eq(chs.pair_files(["a.html", "b.html", "c.html"], ["a.html", "x.html", "y.html"]),
   ([("a.html", "a.html")], ["b.html", "c.html"], ["x.html", "y.html"]),
   "còn >1 file lạ mỗi bên thì không đoán, báo chưa ghép")

# ── find_folders + main trên cây giả ──
root = tempfile.mkdtemp(prefix="chs-test-")


def w(rel, body):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)


w("LAN/req-1/Promotion/index-vn.html", "<div>Quà</div><p>Chòm Sao Tiểu Hùng ×20</p>")
w("LAN/req-1/mainsite/index-vn.html", "<p>Chòm Sao Tiểu Hùng x1</p><div>Quà</div>")
w("LAN/req-2/Promotion/index.html", "<p>Giống nhau</p>")
w("LAN/req-2/mainsite/index.html", "<p>Giống<br>nhau</p>")
w("KTO/only-m/mainsite/index.html", "<p>x</p>")
w("KTO/only-p/Promotion/index.html", "<p>x</p>")
w("KTO/only-p2/Promotion/index.html", "<p>x</p>")

folders = chs.find_folders(root)
eq(folders.pairs, ["LAN/req-1", "LAN/req-2"], "chỉ folder có CẢ 2 nửa mới so")
eq((folders.only_p, folders.only_m), (2, 1), "đếm folder chỉ có 1 nửa để báo 'không có bản sao'")

eq(quiet_main([root, "--folder", "LAN/req-2"]), 0, "2 nửa cùng text → exit 0")
eq(quiet_main([root, "--folder", "LAN/req-1"]), 1, "số lượng quà lệch → exit 1")
eq(quiet_main([root]), 1, "quét cả cây: có 1 folder lệch là exit 1")
eq(quiet_main([os.path.join(root, "khong-ton-tai")]), 2, "root sai → exit 2")

print(f"check-handoff-sync: 6 nhóm — {len(FAIL)} khẳng định sai")
for f in FAIL:
    print("  ✗ " + f)
sys.exit(1 if FAIL else 0)
