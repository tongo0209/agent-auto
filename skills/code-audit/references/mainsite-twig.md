# Rule pack: mainsite Twig

Nạp khi `profile.packs` có `mainsite-twig` (repo có file `.twig`).

## Đặc thù cần soi

| Soi gì | Kịch bản hỏng mẫu |
|---|---|
| Biến có thể không tồn tại | `{{ user.name }}` khi `user` chưa set → render rỗng hoặc lỗi tuỳ cấu hình. Dùng `{{ user.name ?? '' }}` / `{% if user %}` |
| Escape ngược | `{{ content|raw }}` với dữ liệu do người dùng nhập → XSS. `|raw` chỉ dành cho HTML do mình sinh ra |
| `include` vs `embed` | Copy cả block thay vì `include` partial có sẵn → sửa 1 chỗ sót chỗ kia |
| Block trùng tên khi `extends` | Hai block cùng tên → block sau ghi đè block trước, mất nội dung mà không báo lỗi |
| Logic nặng trong template | Vòng lặp lồng + tính toán trong Twig → khó test, chậm, và lặp lại logic đã có ở PHP |
| Key dịch (i18n) | Hard-code chuỗi tiếng Việt trong template ở dự án đa ngôn ngữ → bản EN vẫn ra tiếng Việt |
| Asset path | Nối chuỗi đường dẫn tay thay vì helper asset của dự án → đổi CDN là chết ảnh |

## Ranh giới sở hữu

Vùng đã bàn giao backend: frontend chỉ còn quyền CSS/JS + text/HTML qua kênh đã thống nhất. Trước khi báo issue "phải sửa markup Twig", kiểm tra xem vùng đó có còn thuộc frontend không. Không chắc → ghi issue kèm câu **"vùng này còn thuộc FE không?"**, đừng khẳng định phải sửa.

## Hook platform trong Twig

Twig cũng có thể chứa `pm__…` / `id` / `data-*` là hợp đồng — áp nguyên `references/pm-contract.md`. Script đã quét `.twig` như markup nên các fact `PM_*` vẫn có giá trị.
