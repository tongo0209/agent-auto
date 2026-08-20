<!-- Phần luật RIÊNG của nền tảng nội bộ. Không đi kèm bản public.
     tools/install-skills.sh nối file này vào cuối CLAUDE.md nếu nó tồn tại. -->

## Routing bổ sung
| Loại việc | Đường ray |
|---|---|
| **Chạm file HTML có class `pm__`** (landing promotion) — áp lên MỌI dòng dưới | Ưu tiên làm THẲNG inline. Buộc giao subagent → **nhồi 4 luật `pm__`** (mục dưới) vào brief; KHÔNG skill frontend nào tự biết luật này |

## Landing promotion (file có class `pm__`)
- `pm__…` / `id` đặc biệt / `data-*` = **hợp đồng với JS platform**: cấm đổi tên, cấm xoá, giữ đúng lồng nhau. Mất hook = nút chết, không phải lỗi CSS.
- Input: giữ nguyên `name` / `type` / `for` / `id`. Tắt field bằng cách ẩn khối bọc theo `id`, KHÔNG đổi tên.
- Bẫy: `pm__btn-claim` (gạch NGANG — Lucky Draw) vs `pm__btn_claim` (gạch DƯỚI — Payment). Copy nhầm là nút chết.
- Được **thêm** class/markup riêng cạnh `pm__…`; KHÔNG thay thế. `<any>` là placeholder, phải thay hết bằng tag thật trước khi build.
- Soát popup trước QA: `/check-promotion <loại|STT> <file>` — skill này **KHÔNG** soát `pm__`, phần đó tự làm.
