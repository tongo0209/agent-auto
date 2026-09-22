# R-LAY-* · Layout: absolute hay flex/grid

`MUST` = chặn · `SHOULD` = cảnh báo. Cổng kiểm: `node tools/layout-gate.mjs <đường dẫn>`.

**Không cấm `position: absolute`.** Landing game dựng trên nền art, absolute là công cụ đúng cho phần lớn việc. Luật này chỉ chặn đúng một thứ: **dùng absolute để gắn cứng từng phần tử của một danh sách**, vì thêm/bớt 1 item là phải sửa tay toàn bộ toạ độ phía sau.

## Cây quyết định

| Đang đặt cái gì | Dùng | Vì sao |
|---|---|---|
| **Khối/section** lên đúng chỗ của nền art | `absolute` | Nền là ảnh, toạ độ là dữ liệu từ `coords.json`. Đúng, giữ nguyên. |
| **Item trong list đều nhau** (điểm danh, mốc quà, ô quà, tab, nút) | `grid` / `flex` + `gap` | Số item đổi theo dữ liệu backend. Gắn cứng là vỡ. |
| **Item rải theo art, không thành lưới** (nhân vật, hiệu ứng, badge trang trí, ô quanh vòng quay) | `absolute` | Không có quy luật khoảng cách để rút ra. Đúng, giữ nguyên. |
| **Nội dung dài không đoán trước** (lịch sử, BXH, danh sách quà, điều khoản) | khung cố định + `overflow-y: auto` | Dữ liệu thật luôn dài hơn design. Tràn ra ngoài là bug QC. |

## Luật

| Mã | Mức | Luật |
|---|---|---|
| **R-LAY-1** | MUST | **List đều → `grid`/`flex` + `gap`, KHÔNG gắn toạ độ từng item.** Dấu hiệu vi phạm: ≥4 selector cùng gốc khác số thứ tự (`.day-1`, `.day-2`… / `.item-N` / `:nth-child(N)`), mỗi cái tự đặt `left`/`top`. Container vẫn được `absolute` để nằm đúng chỗ trên nền — chỉ các con bên trong mới phải xếp bằng layout. |
| **R-LAY-2** | MUST | **Rút `gap` từ chính toạ độ đã bóc**, không đoán. `gap = bước nhảy − kích thước item`. Ví dụ thật `zsm-ld-diemdanh`: item rộng 108px, `.day-N` cách nhau 110–111px, xuống hàng `top` +150px với item cao 142px ⇒ `grid-template-columns: repeat(10, 108px); gap: 8px 3px`. 30 dòng toạ độ còn 3 dòng. |
| **R-LAY-3** | MUST | **Một item gồm nhiều thành phần → gói trong MỘT `<div>`/`<a>` bọc**, các thành phần con định vị *bên trong* nó (relative/absolute theo khối cha), không phải rải cùng cấp với item khác. Có vậy di chuyển/ẩn/thêm item mới là một thao tác. |
| **R-LAY-4** | MUST | **Vùng nội dung có thể dài hơn design → `overflow-y: auto`** với chiều cao chốt theo khung design. Áp cho: lịch sử nhận quà, BXH, danh sách vật phẩm, mô tả thể lệ, danh sách nhiệm vụ. |
| **R-LAY-5** | SHOULD | Lưới không đều (item cuối lệch, hàng cuối thiếu) vẫn dùng `grid` + `grid-column`/`grid-area` cho ô lệch, thay vì bỏ cả lưới về absolute. |
| **R-LAY-6** | MUST | **Không đặt `width`/`height` cứng cho khối chứa text sinh từ dữ liệu** (tên người chơi, tên vật phẩm, số lượng). Dùng `min-width` + padding, hoặc cho phép xuống dòng. Tên dài hơn design là chuyện thường ngày. |
| **R-LAY-7** | SHOULD | Sau khi chuyển list sang grid/flex, **đo lại bằng `/ui-check --autofix`** — lệch so với `coords.json` thì sửa `gap`/`padding` của container, đừng quay về gắn toạ độ từng item. |

## Vì sao có luật này (đo thật 22/9/2026)

Quét toàn bộ `cdn-source/products`: **411 chỗ** có ≥4 item cùng gốc mỗi cái tự đặt toạ độ. Nặng nhất:

- `pwm/2026-v34-ani` — `.reward-card:nth-child(N)` × 71
- `zsm/2026-diemdanh-he-h5` — `.day-N` × 30 **và** `.item-N` × 30 trong cùng module
- `mulucdia/2025-dau-si-thuc-tinh` — vòng quay 41 nhánh
- `tanomg3q/2026-khai-xuan-binh-ngo` — 42 nhánh

Không campaign nào trong repo hiện đạt chuẩn để làm mẫu vàng (điểm cao nhất 60/100; tỷ lệ flex+grid so với absolute tốt nhất vẫn là 70/101). **Chuẩn này là thứ phải dựng mới, không phải thứ đi chép lại từ campaign cũ.**

Lưu ý ca vòng quay: 41–42 nhánh absolute quanh tâm là **đúng** — chúng phân bố theo góc, không theo lưới. `R-LAY-1` không áp vào đó.

Liên quan: [`promo-states.md`](promo-states.md) · [`cdn-source-standard.md`](cdn-source-standard.md) · [`code-style.md`](code-style.md)
