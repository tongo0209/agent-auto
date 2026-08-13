# R-PM-* · Hợp đồng platform `pm__` (landing promotion)

Áp cho MỌI file HTML/Twig có class `pm__…` — ở `cdn-source`, `gt-promotion-template`, `new-mainsite`.
`MUST` = vi phạm là chặn, không được báo xong. `SHOULD` = nên, lệch thì phải nói rõ lý do.

| ID | Sev | Luật |
|---|---|---|
| **R-PM-1** | MUST | `pm__…`, `id` đặc biệt, `data-*` là **hợp đồng với JS platform**: cấm đổi tên, cấm xoá, giữ đúng quan hệ lồng nhau. Mất hook = nút chết trên production, KHÔNG phải lỗi CSS nên test giao diện không bắt được. |
| **R-PM-2** | MUST | Input giữ nguyên `name` / `type` / `for` / `id`. Cần tắt field thì **ẩn khối bọc theo `id`**, không đổi tên, không xoá input. |
| **R-PM-3** | MUST | Phân biệt `pm__btn-claim` (gạch NGANG — Lucky Draw) vs `pm__btn_claim` (gạch DƯỚI — Payment). Copy nhầm 1 ký tự = nút chết. Trước khi copy khối nút từ campaign khác: đối chiếu loại promotion. |
| **R-PM-4** | MUST | Được **thêm** class/markup riêng cạnh `pm__…`; KHÔNG thay thế. `<any>` là placeholder — phải thay hết bằng tag thật trước khi build. |
| **R-PM-5** | MUST | Giao subagent chạm file `pm__`: brief phải nhồi nguyên 4 luật trên hoặc trỏ file này. Không skill frontend nào tự biết luật `pm__`. |
| **R-PM-6** | SHOULD | Soát popup theo loại promotion bằng `/check-promotion <loại|STT> <file>` trước khi giao QA. Skill đó **không** soát `pm__` — phần `pm__` tự làm theo R-PM-1..4. |

## Vì sao tách ra file này
Luật `pm__` trước đây chỉ nằm ở văn xuôi trong `~/.claude/CLAUDE.md`, mỗi lần giao subagent phải copy lại
→ dễ rơi. Có ID rồi thì `code-audit` / `design-checker` trích được `R-PM-3 MUST` thay vì diễn giải lại,
và brief chỉ cần 1 dòng trỏ tới đây.
