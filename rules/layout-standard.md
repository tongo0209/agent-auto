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
| **R-LAY-8** | MUST | **Nền art đã bake vị trí KHÔNG đều ⇒ neo theo toạ độ design, nhưng sinh bằng SCSS list + `@for`, không gõ tay từng khối.** Đây là mức 2 của thang, dùng khi `R-LAY-1` không áp được. |

## Mẫu vàng: `jx1m/2026-tinh-quang-chi-da`

Campaign duy nhất tìm được làm đúng cả hai phía. Markup (`452_JX1M/.../promotion/index.html`) gói trọn một mốc trong một khối — đúng `R-LAY-3`:

```html
<div class="milestone-item pm__milestone" data-milestone="30">
  <div class="milestone-item__pin"></div>
  <a class="milestone-item__chest MS__hover" data-fancybox href="…"><img loading="lazy" alt="Mốc 30 lượt"/></a>
  <a href="#" class="btn-cta milestone-item__claim pm__btn-claim" data-image="X1" aria-label="Nhận thưởng"></a>
</div>
```

SCSS (`assets/Frame2/Frame2.scss:32`) là ca `R-LAY-8` điển hình — item pitch đều 191px, nhưng vòng/biển đã bake trong `bg-thuong-moc.png` ở khoảng cách lệch nhau (438, 629, 823, 1019… hiệu 191/194/196/192), nên rương và nút phải neo theo x tuyệt đối đo từ design:

```scss
$chest-design-x: 438px, 629px, 823px, 1019px, 1211px, 1403px, 1594px, 1779px;
$chest-top:      128px, 129px, 129px, 128px, 129px, 128px, 130px, 128px;

@for $i from 1 through 8 {
  $item-left: 382px + 191px * ($i - 1);
  &:nth-child(#{$i}) {
    left: $item-left;
    .milestone-item__chest { left: nth($chest-design-x, $i) - $frame2-left - $item-left; top: nth($chest-top, $i); }
  }
}
```

Thêm/bớt một mốc = sửa 3 danh sách, không phải 8 khối CSS. `layout-gate.mjs` đã kiểm: campaign này **không** bị bắt `R-LAY-1` — cổng phân biệt được loop với gắn cứng.

## Vì sao có luật này (đo thật 22/9/2026)

Quét toàn bộ `cdn-source/products`: **411 chỗ** có ≥4 item cùng gốc mỗi cái tự đặt toạ độ. Nặng nhất:

- `pwm/2026-v34-ani` — `.reward-card:nth-child(N)` × 71
- `zsm/2026-diemdanh-he-h5` — `.day-N` × 30 **và** `.item-N` × 30 trong cùng module
- `mulucdia/2025-dau-si-thuc-tinh` — vòng quay 41 nhánh
- `tanomg3q/2026-khai-xuan-binh-ngo` — 42 nhánh

Chấm 40 campaign sửa gần nhất theo tỷ lệ flex+grid/absolute + gap + scroll + đủ 3 trạng thái: điểm cao nhất chỉ 60/100, tỷ lệ tốt nhất vẫn là 70 flex+grid so với 101 absolute. **Không có campaign nào để chép nguyên** — `jx1m/2026-tinh-quang-chi-da` ở trên là mẫu đúng cho `R-LAY-3`/`R-LAY-8`, nhưng phần list đều thì vẫn phải dựng theo `R-LAY-1` thay vì chép nó.

Lưu ý ca vòng quay: 41–42 nhánh absolute quanh tâm là **đúng** — chúng phân bố theo góc, không theo lưới. `R-LAY-1` không áp vào đó.

Liên quan: [`promo-states.md`](promo-states.md) · [`cdn-source-standard.md`](cdn-source-standard.md) · [`code-style.md`](code-style.md)
