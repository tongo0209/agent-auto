# R-ST-* · Ba trạng thái của mốc quà / điểm danh / nhiệm vụ

`MUST` = chặn · `SHOULD` = cảnh báo. Cổng kiểm: `node tools/layout-gate.mjs <đường dẫn>`.

Mọi ô nhận thưởng trong promotion đều đi qua đúng 3 trạng thái. Thiếu một cái là nút chết hoặc người chơi nhận hai lần — QC luôn bắt, và bắt muộn.

| Trạng thái | Class | Nghĩa | Hành vi |
|---|---|---|---|
| **off** | `.off` | Chưa đủ điều kiện (chưa tới ngày, chưa đạt mốc) | Nút không bấm được, thường làm mờ/xám |
| **active** | `.active` | Đủ điều kiện, chưa nhận | Nút bấm được — đây là trạng thái duy nhất gọi API |
| **received** | `.received` | Đã nhận rồi | Nút không bấm được, hiện dấu đã nhận |

Tên class lấy theo thực tế repo (đếm 22/9/2026 trên `cdn-source`): `.active` 5.374 · `.off` 895 · `.received` 609. Dùng đúng 3 tên này, **không** tự đặt `.is-active`/`.claimed`/`.done` song song — phía `gt-promotion-template` cũng đang nhận `received` / `is-active` / `disabled`.

## Luật

| Mã | Mức | Luật |
|---|---|---|
| **R-ST-1** | MUST | **Dựng đủ cả 3 trạng thái** cho mọi ô nhận thưởng, kể cả khi design chỉ vẽ 1–2 cái. Mỗi trạng thái phải có style riêng nhìn phân biệt được, không chỉ khác chữ trên nút. |
| **R-ST-2** | MUST | **Design thiếu trạng thái thì suy ra, không bỏ trống.** Có `active` + `received` mà thiếu `off` ⇒ lấy `active` làm gốc, hạ opacity / đổi sang sprite xám. Có `off` + `active` mà thiếu `received` ⇒ lấy `active`, thay nhãn nút thành "Đã nhận" + khoá tương tác. **Báo lại cho user biết đã tự suy trạng thái nào**, đừng lặng lẽ. |
| **R-ST-3** | MUST | **Trạng thái đặt trên khối bọc item**, không rải lên từng thành phần con. `<div class="day-1 received">` — chứ không phải vừa `btn-received` vừa `text-received` vừa `icon-received` rời nhau. Kéo theo `R-LAY-3`. |
| **R-ST-4** | MUST | **Chỉ `.active` mới bấm được.** `.off` và `.received` phải chặn ở CSS (`pointer-events: none`) chứ không chỉ đổi màu — đổi màu suông thì vẫn bấm được và vẫn bắn API. |
| **R-ST-5** | SHOULD | Nếu PSD/Figma có show đủ 3 trạng thái thì **bóc đủ 3 sprite**, đừng chỉ bóc cái đẹp nhất rồi làm 2 cái kia bằng filter CSS. |
| **R-ST-6** | MUST | Trạng thái là **class thêm vào**, không thay thế class gốc của item và **không đụng vào hợp đồng `pm__`** (xem `pm-contract.md`). |


## Phía `gt-promotion-template`: hai hệ từ vựng, phải map

HTML đã bàn giao **không** dùng thống nhất `.off`/`.active`/`.received`. Đếm thật trên 226 file (22/9/2026):

| Hệ | Từ dùng | Số lần |
|---|---|---|
| Tiếng Anh | `received`, `is-active`, `disabled` | `column-received` 32 · `is-active` 79 · `disabled` 13 |
| Tiếng Việt | `dat` (đạt) · `chua` (chưa) · `lock` · `tick` · `nhan` | `nhan` 553 · `chua` 534 · `dat` 504 · `tick` 232 · `lock` 202 |

Map khi bàn giao hoặc khi đọc ngược code cũ:

| Trạng thái | cdn-source | gt-promotion (Anh) | gt-promotion (Việt) |
|---|---|---|---|
| chưa đủ điều kiện | `.off` | `disabled` | `chua`, `lock` |
| đủ, chưa nhận | `.active` | `is-active` | `dat` (chưa có `tick`) |
| đã nhận | `.received` | `received` | `tick`, `da-nhan` |

**R-ST-7 MUST** · Code mới trong `cdn-source` luôn dùng `.off`/`.active`/`.received`. Khi bàn giao sang `gt-promotion-template`, **giữ nguyên tên đang có của file đích** nếu file đó đã dùng hệ khác — đổi tên hàng loạt là rủi ro JS platform, không phải dọn dẹp. Ghi rõ trong report đã map thế nào.

**R-ST-8 SHOULD** · Ví dụ ca thật `GunnyMobi/LandingTrungThu2026/mainsite/diemdanh.html`: 42 `cell`, mỗi cell có `numbg-dat`/`numbg-chua` + sprite `cell-dat`/`cell-chua`/`lock`/`tick` — tức **chỉ 2 trạng thái nền + 1 lớp tick phủ lên**. Đọc kiểu này đừng kết luận "thiếu trạng thái"; kiểm `tick`/`lock` trước khi báo `R-ST-1`.

## Quy ước đặt tên phía promotion (đếm thật, không phải ý kiến)

kebab-case **29.506** · một-từ **19.319** · BEM `a__b` **9.793** · snake_case **2.956**.

⇒ Viết mới thì **kebab-case hoặc BEM**; tránh `snake_case` (thiểu số, chỉ còn ở file cũ). Không đụng `pm__`/`MS__`/`MJ__` — đó là hợp đồng, xem [`pm-contract.md`](pm-contract.md).

## Áp cho gameplay nào

Đếm module thật trong `cdn-source/products` (22/9/2026): **vòng quay 28 · milestone/mốc quà 27 · điểm danh 20 · đổi quà 19 · nhiệm vụ 5 · mốc nạp 4**.

- **Điểm danh** — mỗi ngày là một ô đủ 3 trạng thái. Ngày quá hạn chưa nhận thường vẫn là `off`, hỏi PM nếu thể lệ cho nhận bù.
- **Milestone / mốc quà** — mỗi mốc một ô. Thanh tiến trình đi kèm phải khớp: mốc `received` thì phần thanh trước nó phải đầy.
- **Đổi quà** — thêm trạng thái hết hàng; nếu thể lệ có, map vào `off` và ghi rõ trong report.
- **Vòng quay** — 3 trạng thái nằm ở nút quay (`off` hết lượt / `active` còn lượt / `received` đang quay), không phải ở từng nhánh.
- **Nhiệm vụ** — `off` chưa làm xong · `active` xong chưa nhận · `received` đã nhận.

Liên quan: [`layout-standard.md`](layout-standard.md) · [`pm-contract.md`](pm-contract.md) · [`popup-library.md`](popup-library.md)
