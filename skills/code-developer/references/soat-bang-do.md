# Soát bằng ĐO — công thức + bẫy đã trả giá

Đọc file này khi chạy gate "Soát bằng ĐO" (mode `full`/`compare`) và cần dựng lệnh, hoặc khi một số đo ra kết quả lạ.
Công cụ: `python3 ~/.claude/scripts/design-diff.py` (numpy + PIL + scipy, có sẵn `/usr/bin/python3`, chạy < 1s).

## 3 phép đo

### 1. `heights` — map section ↔ Frame (chạy TRƯỚC khi dev viết dòng đầu)

```bash
python3 ~/.claude/scripts/design-diff.py heights \
  assets/Frame{1,2,3,4,5,6,7,8}/images/pc/bg.jpg --expect 7630
```

Tổng chiều cao bg từng Frame **phải** bằng chiều cao design. Lệch > 5px ⇒ map section đang sai —
số thứ tự trong tên folder/spec KHÔNG phải bằng chứng (ca thật GW-556: gallery bị dựng trong
Frame8 vì tin số thứ tự; thực tế Frame7 = gallery, Frame8 = chỉ footer 362px).

### 2. `sections` — độ lệch render vs design theo dải y

```bash
python3 ~/.claude/scripts/design-diff.py sections shot-pc.png design-pc.png \
  --bands 1000,1838,2550,3650,4500,6200,7268 --max 8
```

- `--bands` = mốc y của từng section (lấy từ `heights` cộng dồn). **Không truyền → tự chia 8 dải đều**, kém chính xác hơn.
- Đọc số: mean|diff| grayscale mỗi dải. Kinh nghiệm thật (GW-556 sau khi đã khớp): **PC 3.5–4.2 · MB 9.1–10**
  (MB cao vì ảnh 750 giãn lên canvas 768 — lệch hệ thống, không phải lỗi). Dải nào cao bất thường so với
  các dải còn lại ⇒ truy nguyên, đừng bình quân hoá.
- Width lệch → script tự scale render về width design và in dòng `⚠ render scale ×…`. Chiều cao lệch cũng in cảnh báo.
- Exit 1 nếu có dải vượt `--max`.

### 3. `match` — chốt toạ độ asset (thay cho đo mắt)

```bash
python3 ~/.claude/scripts/design-diff.py match \
  assets/Frame1/images/pc/menu-1.png design-pc.png --band 0:1000
```

- Chỉ tiêu là **ncc** (zero-mean normalized cross-correlation có mask alpha), không phải rms:
  `ncc ≥ 0.85` = asset có mặt · `< 0.85` = KHÔNG có mặt (exit 1). rms in kèm để tham khảo.
- **CẤM dùng SSD/rms một mình** — vùng design phẳng (đen/trắng đặc) cho rms thấp giả bằng đúng
  `sqrt(mean(asset²))` ở bất kỳ ảnh nào ⇒ false positive. ZNCC chuẩn hoá theo tương phản 2 bên nên vùng phẳng tự loại.
- Cảnh báo `⚠ hoạ tiết LẶP` = có vị trí khác ncc gần bằng ⇒ toạ độ chưa chắc, thu hẹp bằng `--near X,Y --radius 60` hoặc `--band`.
- Verify tin được: chạy trên GW-556 ra `left=1104 top=853`, khớp đúng `Frame1.scss:29-30`.

## Chụp render để so — làm sai là ra số lệch GIẢ

1. **Tắt animation đúng cách.** CSS tiêm phải là:
   `.reveal,.reveal-stagger,.reveal-stagger>*{transition:none!important}` + add class `.is-visible`.
   **TUYỆT ĐỐI KHÔNG** ép `transform:none` — nó xoá luôn `translate(-50%,-50%)` định vị nhãn ⇒ mọi nhãn lệch
   nửa kích thước. Thiếu `.reveal-stagger > *` ⇒ chụp giữa animation ⇒ điểm lệch giả 33–75.
2. **Khớp trạng thái với design**: design chụp nav mở dropdown thì render cũng phải mở (không thì Frame1/nav lệch giả).
   Carousel/gallery phải ở đúng state 1.
3. **MB**: render canvas 768 vs design 750 → lệch hệ thống ~9-10, đã biết, không truy nữa.

## 5 bẫy đã trả giá thật

| Bẫy | Hậu quả | Luật |
|---|---|---|
| Match bằng **patch 70×70 ở tâm** ảnh | 3 ảnh lớn Frame3/Frame6 bị báo lệch 36–62px trong khi thực tế đúng | Luôn match **TOÀN ảnh + mask alpha** (script làm sẵn) |
| Kết luận nội dung bằng **mean toàn section** | mean VN vs EN ≈ 1.0 ⇒ kết luận sai "PC không dịch"; chữ chỉ chiếm vài % pixel | So nội dung phải **crop vùng chữ** (`--bands` hẹp quanh dải chữ) |
| Suy "khớp" từ **tên file trùng title** | 2 lane compare lệch verdict **3×** (1.5 vs 4.5 ngày người) — mù với đổi theme | Verdict "khớp/lệch" chỉ được rút từ SỐ ĐO |
| Đo toạ độ **bằng mắt/bằng tay** | lane dev đặt 5 đèn menu MB lệch tới **36px** | Có design + asset ⇒ `match`, không đo tay |
| Đếm dòng chữ Thái bằng `Range.getClientRects` | đếm VƯỢT (diacritic + số Latin tạo rect lệch 1-2px) | Chốt số dòng bằng ảnh, không bằng rect |
| Tin `dist/` cũ làm hiện trạng | checker PASS giả cho bug chưa sửa | Build lại trước khi đo (gate fe-gate cũng bắt `dist/` cũ hơn source) |

## Ghi kết quả

- **Tổng kết**: 1 dòng `Đo lệch: PC <a>–<b> · MB <c>–<d> (bands theo Frame) · match N/N asset ncc ≥ 0.85`.
  Chưa chạy → ghi `chưa đo: <lý do>`. **CẤM** viết "khớp design" khi không có số.
- **state.md**: ghi mốc `--bands` đã dùng + số đo cuối, để lượt sau so được tiến/lùi (GW-556: Frame3 PC 8.60 → 4.40 → 3.88).
