# Tự bóc ảnh từ PSD bằng Photoshop (bộ 3 script)

Dùng khi designer đã gửi PSD nhưng **chưa cắt ảnh**, mà mình cần asset để code ngay.
Đã chạy thật trên GW-525 (Trung Thu 2026), 4 PSD / 559 layer → ghép lại khớp bản
design designer xuất ra ở mức **mean 0,021–0,141 / 255** trên cả 3 ngôn ngữ.

```
psd-tree.py <file.psd> [--max-depth N]        # xem cây layer: kind, bbox, blend, fx, mask, clip
psd-export.py <job.json>                      # nhờ Photoshop xuất PNG full-canvas theo state
psd-verify-compose.py <design.png> <nhãn> <lop1.png> ...   # ghép lại, so với PNG designer
```

`job.json`:
```json
{ "psd": "/…/8_Reward.psd", "out": "/…/_auto-export/8_Reward",
  "states": [ {"name": "_control", "show": ["*"]},
              {"name": "bg-back",  "show": ["Background", "BG"]},
              {"name": "char-4",   "show": ["5 nhân vật/Hạ Minh Tinh"]} ] }
```
`show` = đường dẫn TÊN layer từ gốc, `/` phân cấp; node trên đường dẫn được bật cưỡng chế nên
mở được cả group designer đang tắt. `"*"` = giữ nguyên như designer lưu.
Xuất **full canvas** (không trim) ⇒ dán lại ở 0,0 là đúng chỗ, khỏi tính toạ độ.

## 4 điều đã trả giá — đừng phát hiện lại

**1. `psd.composite()` của psd-tools trả PREVIEW Photoshop nhúng sẵn, không phải nó vẽ.**
So preview đó với PNG designer ra `mean 0.00` ⇒ rất dễ kết luận "psd-tools render hoàn hảo".
Đo lại bằng `composite(force=True)` (render thật): mean 2,44 · max 232 · 1,4% pixel lệch >32.
psd-tools **không render layer effects** — OuterGlow / Stroke / PatternOverlay / DropShadow /
ColorOverlay đều mất. 8_Reward.psd có 60 layer mang `fx=` ⇒ bóc bằng psd-tools là giao hàng
thiếu quầng sáng, thiếu viền chữ, thiếu hoa văn. Vì vậy tool này dùng Photoshop làm bộ render.

**2. `layer.visible` của Photoshop là visibility THỪA HƯỞNG; của psd-tools là cờ RIÊNG.**
Con của group đang tắt: Photoshop báo `false`, psd-tools báo `true` (cờ thật). Bật group lên thì
Photoshop TỰ trả con về `true`. Bản đầu của tool snapshot giá trị thừa hưởng rồi dùng nó khôi phục
con ⇒ **8 PNG trong suốt hoàn toàn** (4/5 nhân vật ở 7_Game và 6_Share) mà log vẫn in "OK".
⇒ Bây giờ psd-tools (đọc cờ thật) tính sẵn bảng bật/tắt ĐẦY ĐỦ cho mọi layer, JSX chỉ áp theo
index path. Photoshop index 0 = TRÊN cùng, psd-tools duyệt từ DƯỚI lên ⇒ `ps_idx = (n-1) - psd_idx`.

**3. Xuất được file ≠ file dùng được.** Tool tự soát `getbbox() is None` sau khi xuất và
exit 1 nếu có ảnh rỗng. Đây là cổng chặn duy nhất bắt được ca (2) — tên file đúng, size khác 0,
build vẫn PASS, chỉ có ảnh là trống.

**4. Phải có state `_control`.** Xuất nguyên trạng rồi so với PNG designer; GW-525 ra
0,000–0,010. Thiếu bước này thì mọi state cô lập không có gì bảo chứng.

## Giới hạn thật

- **Blend mode ở cấp group thì KHÔNG tách rời được.** 8_Reward có group nhân vật `blend=SCREEN`
  bọc cả vòng trăng + nhân vật: tách nhân vật ra ghép alpha thường → 0,90; ghép bằng screen →
  7,11 (nướng hai lần, tệ hơn). Cách đúng: xuất sẵn cả cụm đã nướng (`scene-N`) → 0,046.
  Hoặc CSS `isolation: isolate` + `mix-blend-mode` cho đúng ngữ nghĩa group (chưa kiểm chứng).
- **Chữ cắt trên nền trong suốt lệch nhẹ ở viền glyph** (max ~115 trên nét mảnh, ~0,4% pixel):
  khử răng cưa khi không có nền khác với khi có nền. Không đáng lo vì chữ nên render sống bằng
  i18n; chỉ nút bắt buộc là ảnh (GROBOLD không có dấu tiếng Việt).
- **Z-order phải đọc từ cây, đừng gộp "bg" thành một cục.** 6_Wish có `table`/`paper` nằm TRÊN
  nhân vật, 6_Share có `frame` nằm TRÊN maintext ⇒ phải tách `bg-back` / `bg-front`.
- Tên layer trùng nhau trong cùng cấp là chuyện thường (5 group `组 43`, 3 lớp `云`) ⇒ khoá
  đường dẫn có kèm `#index` để không trỏ nhầm.

## An toàn với PSD gốc

Mở → đổi visibility trong RAM → `saveAs(..., asCopy=true)` ra PNG → `close(DONOTSAVECHANGES)`.
Không bao giờ ghi vào `.psd`. Kiểm lại sau khi chạy: size PSD phải khớp `length` trong
`sp-manifest.json` (bản designer up). GW-525: 26 371 853 byte trước = sau.
`app.displayDialogs = DialogModes.NO` là bắt buộc — PSD dùng GROBOLD/SukhumvitSet, thiếu font
sẽ hiện modal "missing fonts" và treo cả script.

## 5. Layer có dấu `/` trong tên bị TẮT ÂM THẦM — preview sai màu mà không báo lỗi

`show` dùng `/` làm ký tự phân cấp, nên layer tên `Brightness/Contrast 683` không thể trỏ tới:
`assignment()` không thấy key đó, mọi state khác lại tắt hết layer không được liệt kê ⇒ **adjustment
layer biến mất khỏi mọi ảnh xuất ra**. Log vẫn in `OK`, ảnh vẫn có nội dung, chỉ có màu là sai.

Đo thật trên VLTT MOBILE (14/8): nền xuất thiếu adjustment **sáng hơn bản đúng 30/255** ở mọi điểm.
Hậu quả: cắt nền theo ảnh đó rồi so build với chính ảnh đó → tưởng "đã khớp", trong khi so với PSD
mở bằng Photoshop thì lệch cả 30. Ngược lại, cắt nền đúng rồi so với preview sai → tưởng code sai.

**Cách phát hiện:** state `_control` (`show: ["*"]`) LUÔN đúng vì nó giữ nguyên cờ designer lưu. So một
vùng nền trống của state cô lập với `_control`; lệch đều một hằng số ⇒ đang mất adjustment layer.

**Cách xử lý:** bỏ qua `show`, viết JSX riêng bật/tắt theo INDEX của `doc.layers[i]` (Photoshop index
0 = trên cùng; psd-tools duyệt dưới→lên nên `ps_idx = (n-1) - psd_idx`). Ví dụ đã chạy thật:

```jsx
for (var i = 0; i <= 5; i++) doc.layers[i].visible = false;  // tắt các page group
doc.layers[6].visible = true;   // Brightness/Contrast 683  <- KHÔNG trỏ được bằng show
doc.layers[7].visible = true;   // Layer 684 (nền)
doc.saveAs(new File(out), png, true, Extension.LOWERCASE);
```
