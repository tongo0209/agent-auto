<!-- Phần luật RIÊNG của nền tảng nội bộ. Không đi kèm bản public.
     tools/install-skills.sh nối file này vào cuối CLAUDE.md nếu nó tồn tại. -->

## Routing bổ sung
| Loại việc | Đường ray |
|---|---|
| **Chạm file HTML có class `pm__`** (landing promotion) — áp lên MỌI dòng dưới | Đọc `ai-template-kit/AI-GUIDE.md` TRƯỚC (bộ quy chuẩn team). Ưu tiên làm THẲNG inline. Buộc giao subagent → **nhồi 4 luật `pm__`** (mục dưới) + đường dẫn AI-GUIDE vào brief; KHÔNG skill frontend nào tự biết luật này |

## Landing promotion (file có class `pm__`)
- **Bộ quy chuẩn bắt buộc của team** (dựng mới · sửa · bàn giao): `~/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit/AI-GUIDE.md` → route tới ĐÚNG 1 cặp `AI-RULES-<gameplay>.md` + `MASTER-<gameplay>.html`. Đọc trước khi chạm file, cổng cơ học trước khi báo xong: `node ~/VNG/agent-auto/tools/pm-gate.mjs <file.html>` (đọc AI-RULES, đếm singleton + `<any>` + vị trí hook). Chi tiết: `rules/pm-contract.md` R-PM-7..8.
- `pm__…` / `id` đặc biệt / `data-*` = **hợp đồng với JS platform**: cấm đổi tên, cấm xoá, giữ đúng lồng nhau. Mất hook = nút chết, không phải lỗi CSS.
- Input: giữ nguyên `name` / `type` / `for` / `id`. Tắt field bằng cách ẩn khối bọc theo `id`, KHÔNG đổi tên.
- Bẫy: `pm__btn-claim` (gạch NGANG — Lucky Draw) vs `pm__btn_claim` (gạch DƯỚI — Payment; riêng popup confirm của Payment vẫn là `pm__btn-claim`). Copy nhầm là nút chết.
- Được **thêm** class/markup riêng cạnh `pm__…`; KHÔNG thay thế. `<any>` là placeholder, phải thay hết bằng tag thật trước khi build.
- Soát popup trước QA: `/check-promotion <loại|STT> <file>` — skill này **KHÔNG** soát `pm__`, phần đó tự làm.
