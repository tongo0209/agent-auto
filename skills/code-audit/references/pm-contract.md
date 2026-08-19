# Rule pack: landing promotion — hợp đồng với JS platform

Nạp khi `profile.packs` có `landing-promotion` (file HTML/Twig có class `pm__`).

## Nguyên tắc gốc

`pm__…`, `id` đặc biệt, `data-*` **không phải tên class trang trí** — chúng là hợp đồng với JS của platform. Platform tìm node theo đúng những tên đó. Đổi tên / xoá / lồng sai = **nút chết**, và biểu hiện ra ngoài giống lỗi CSS nên rất dễ chẩn sai.

Bốn luật:

1. Cấm đổi tên, cấm xoá, giữ đúng quan hệ lồng nhau của `pm__…` / `id` đặc biệt / `data-*`.
2. Input giữ nguyên `name` / `type` / `for` / `id`. Muốn tắt một field thì **ẩn khối bọc theo `id`**, không đổi tên field.
3. Được **thêm** class/markup riêng cạnh `pm__…`; không **thay thế**.
4. `<any>` là placeholder — phải thay hết bằng tag thật trước khi build.

## Bẫy gạch ngang vs gạch dưới

`pm__btn-claim` (gạch NGANG — Lucky Draw) khác `pm__btn_claim` (gạch DƯỚI — Payment). Copy nhầm giữa hai loại promotion là nút chết mà nhìn code không thấy gì sai.

Script bắt việc này bằng `PM_SEPARATOR_TRAP` (một file có cả hai biến thể) và `PM_HOOK_RENAMED` (base có bản này, bản mới thành bản kia). Khi gặp:

1. Xem hook nào có ở base — bản base gần như luôn đúng.
2. Xem loại promotion của trang (Lucky Draw / Payment / …).
3. Không suy được → báo 🟡 kèm câu hỏi cho user, đừng tự đoán rồi khẳng định.

## Đọc facts `PM_*` / field

| Fact | Nghĩa | Mức mặc định |
|---|---|---|
| `PM_HOOK_REMOVED` | Hook có ở base, mất ở bản mới | 🔴 nếu khối tính năng còn; bỏ nếu cả khối bị xoá có chủ đích |
| `PM_HOOK_RENAMED` | Mất X, thêm Y gần giống (khác gạch, hoặc sai ≤ 2 ký tự) | 🔴 |
| `PM_SEPARATOR_TRAP` | Một file có cả `-` và `_` cùng hình dạng | 🟡, lên 🔴 nếu biến thể mới không có ở base |
| `PM_HOOK_ADDED` | Hook mới không có ở base | ⚪ (bình thường khi thêm tính năng) — nhưng nếu ghép được với một hook vừa mất thì soi như đổi tên |
| `FIELD_CONTRACT_CHANGED` | `name`/`type`/`id` của input đổi | 🔴 — platform gửi/nhận theo `name` |
| `FIELD_REMOVED` | Field có ở base, mất ở bản mới | 🔴 nếu form vẫn cần field; nếu là "tắt field" thì phải làm bằng cách ẩn khối bọc, không xoá |
| `FIELD_NO_NAME` | Field không có `name` (hoặc `name=""`) | `confidence: high` (trong form hợp đồng, xem field `form`) → 🔴 submit không mang dữ liệu. `confidence: low` (form `role="search"`, ngoài form, file partial) → đọc code rồi mới kết luận, phần lớn là bình thường |
| `ANY_PLACEHOLDER` | Còn `<any>` | 🔴 — chưa build được |
| `DUPLICATE_ID` | Cùng `id` 2 lần trong 1 file | 🔴 — platform `getElementById` bắt node đầu, node sau chết |
| `LABEL_FOR_ORPHAN` | `for=` không có `id` khớp | 🟡 — click nhãn không focus field; 🔴 nếu là checkbox điều khiển bằng label |
| `ID_REMOVED` / `DATA_ATTR_REMOVED` | `id`/`data-*` có ở base, mất ở bản mới | 🔴 nếu tên có dấu hiệu hợp đồng (platform, promotion, campaign, nexus, reward, claim); còn lại 🟡 |

## Việc skill này KHÔNG làm

Không kiểm tra "đủ popup theo loại promotion" — đó là `/check-promotion`. Hai skill bù nhau: `/check-promotion` soi **đủ popup**, `code-audit` soi **hook có còn nguyên**.
