#!/usr/bin/env python3
"""ps-export2 — Photoshop xuất ảnh từ PSD. Python quyết định, JSX chỉ chấp hành.

BÀI HỌC ĐÃ TRẢ GIÁ (11/8, bản v1 xuất ra 8 PNG RỖNG mà vẫn báo "OK"):
  `layer.visible` của Photoshop là visibility THỪA HƯỞNG, không phải cờ riêng của layer.
  Con của một group đang tắt đều báo visible=false; bật group lên thì Photoshop TỰ trả chúng
  về true. psd-tools thì ngược lại — báo đúng cờ thật của từng layer.
  Bản v1 snapshot giá trị thừa hưởng (false) rồi sau khi bật group lại dùng nó tắt con lại
  ⇒ 4/5 nhân vật ở 7_Game và 6_Share xuất ra file trong suốt hoàn toàn.
  Nguy hiểm vì log vẫn in "OK" và file vẫn tồn tại đúng tên — chỉ lộ khi soát getbbox().

⇒ Thiết kế lại: psd-tools (đọc cờ THẬT) tính sẵn bảng bật/tắt ĐẦY ĐỦ cho mọi layer ở mỗi state,
  JSX áp theo INDEX PATH. Không snapshot, không suy diễn thừa hưởng, không rò state giữa các state.
  Photoshop index 0 = trên cùng, psd-tools duyệt từ dưới lên ⇒ ps_index = (n-1) - psd_index.

AN TOÀN: mở → đổi visibility trong RAM → saveAs bản COPY → close(DONOTSAVECHANGES).
  Không bao giờ ghi vào .psd gốc (PSD là bản duy nhất của designer).

Dùng: ps-export2.py <job.json>   job = {"psd","out","states":[{"name","show":[path,...]}]}
      show = đường dẫn TÊN layer từ gốc, "/" phân cấp. "*" = giữ nguyên như designer lưu.
"""
import json
import os
import subprocess
import sys
from psd_tools import PSDImage

job = json.load(open(sys.argv[1], encoding="utf-8"))
out = job["out"]
os.makedirs(out, exist_ok=True)
psd = PSDImage.open(job["psd"])

# ---- lập bản đồ: đường dẫn tên → (index path kiểu Photoshop, cờ visible THẬT) ----
NODES = {}          # "A/B" -> {"idx": [..], "raw": bool, "children": [tên con]}


def index_tree(node, name_path, idx_path):
    kids = list(node)
    n = len(kids)
    names = []
    for i, lyr in enumerate(kids):
        nm = lyr.name
        # tên trùng nhau trong cùng cấp là chuyện thường ở PSD này (5 group "组 43", 3 lớp "云")
        # ⇒ khoá phải kèm số thứ tự để không trỏ nhầm layer
        key = "/".join(name_path + [nm])
        if key in NODES:
            key = "/".join(name_path + [f"{nm}#{i}"])
        ip = idx_path + [n - 1 - i]          # đảo chiều: psd-tools dưới→trên, Photoshop trên→dưới
        NODES[key] = {"idx": ip, "raw": bool(lyr.visible), "group": lyr.is_group(), "kids": []}
        names.append(key)
        if lyr.is_group():
            NODES[key]["kids"] = index_tree(lyr, name_path + [nm], ip)
    return names


TOP = index_tree(psd, [], [])


def descendants(key):
    for k in NODES[key]["kids"]:
        yield k
        yield from descendants(k)


def assignment(show_paths):
    """Trả về {key: bool} cho MỌI layer. Đầy đủ ⇒ mỗi state độc lập, không rò trạng thái."""
    vis = {k: False for k in NODES}
    for p in show_paths:
        if p not in NODES:
            return None, p
        # bật cưỡng chế mọi node trên đường dẫn (để mở được cả group designer đang ẩn)
        parts = p.split("/")
        for d in range(1, len(parts) + 1):
            vis["/".join(parts[:d])] = True
        # con cháu: theo CỜ THẬT, và chỉ khi cả chuỗi cha ở dưới target đều bật thật
        def rec(key):
            for c in NODES[key]["kids"]:
                if NODES[c]["raw"]:
                    vis[c] = True
                    rec(c)
        rec(p)
    return vis, None


states = []
for st in job["states"]:
    if st["show"] == ["*"]:
        states.append({"name": st["name"], "set": [[NODES[k]["idx"], NODES[k]["raw"]] for k in NODES]})
        continue
    vis, miss = assignment(st["show"])
    if miss:
        print(f"✗ {st['name']}: không thấy layer '{miss}' — BỎ QUA state này")
        continue
    on = sum(1 for v in vis.values() if v)
    if on == 0:
        print(f"✗ {st['name']}: bảng bật/tắt ra 0 layer sáng — BỎ QUA (sẽ là PNG rỗng)")
        continue
    states.append({"name": st["name"], "set": [[NODES[k]["idx"], vis[k]] for k in NODES]})

print(f"{len(states)}/{len(job['states'])} state hợp lệ, {len(NODES)} layer")

JSX = r"""
#target photoshop
app.displayDialogs = DialogModes.NO;
var LOG = new File(%(log)s); LOG.encoding = "UTF-8"; LOG.open("w");
var doc = app.open(new File(%(psd)s));
LOG.write("opened " + doc.name + "\n");

function byIdx(ip) {                       // ip = [i0, i1, ...] theo thứ tự Photoshop
  var c = doc;
  for (var d = 0; d < ip.length; d++) {
    if (ip[d] >= c.layers.length) return null;
    c = c.layers[ip[d]];
  }
  return c;
}
var png = new PNGSaveOptions(); png.interlaced = false; png.compression = 6;
var STATES = %(states)s;
for (var s = 0; s < STATES.length; s++) {
  var st = STATES[s], miss = 0;
  for (var i = 0; i < st.set.length; i++) {
    var l = byIdx(st.set[i][0]);
    if (l === null) { miss++; continue; }
    l.visible = st.set[i][1];
  }
  doc.saveAs(new File(%(outdir)s + "/" + st.name + ".png"), png, true, Extension.LOWERCASE);
  LOG.write((miss ? "WARN(" + miss + " index lệch) " : "OK   ") + st.name + "\n");
}
doc.close(SaveOptions.DONOTSAVECHANGES);
LOG.write("closed without saving\n"); LOG.close(); "done";
"""

log = os.path.join(out, "_ps2.log")
jsx = os.path.join(out, "_export2.jsx")
with open(jsx, "w", encoding="utf-8-sig") as f:
    f.write(JSX % {"log": json.dumps(log), "psd": json.dumps(job["psd"]),
                   "outdir": json.dumps(out), "states": json.dumps(states)})

r = subprocess.run(["osascript", "-e",
                    f'tell application id "com.adobe.Photoshop" to do javascript file "{jsx}"'],
                   capture_output=True, text=True, timeout=1800)
print("osascript rc:", r.returncode, r.stdout.strip(), r.stderr.strip()[:300])
if os.path.exists(log):
    print(open(log, encoding="utf-8", errors="replace").read())

# ---- CỔNG CHẶN: không có PNG rỗng nào được đi tiếp ----
from PIL import Image
bad = []
for st in states:
    p = os.path.join(out, st["name"] + ".png")
    if not os.path.exists(p):
        bad.append((st["name"], "thiếu file")); continue
    if Image.open(p).convert("RGBA").getbbox() is None:
        bad.append((st["name"], "PNG TRONG SUỐT HOÀN TOÀN"))
print(f"\nsoát rỗng: {len(states)-len(bad)}/{len(states)} ảnh có nội dung")
for n, why in bad:
    print(f"  ✗ {n}: {why}")
sys.exit(1 if bad else 0)
