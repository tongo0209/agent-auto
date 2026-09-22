# R-PM-* · Hợp đồng platform `pm__` (landing promotion)

Áp cho MỌI file HTML/Twig có class `pm__…` — ở `cdn-source`, `gt-promotion-template`, `new-mainsite`.

**Nguồn chuẩn (upstream, team sở hữu):** `~/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit/`
— `AI-GUIDE.md` (router) → `gameplays/<gameplay>/AI-RULES-<gameplay>.md` (catalog hook: bắt buộc/vị trí/số lần) + `MASTER-<gameplay>.html` (khung thật).
File này **chỉ trỏ và bổ sung kỷ luật phía agent**, KHÔNG chép catalog sang — catalog đổi ở upstream thì bản chép lập tức lệch.
`MUST` = vi phạm là chặn, không được báo xong. `SHOULD` = nên, lệch thì phải nói rõ lý do.

| ID | Sev | Luật |
|---|---|---|
| **R-PM-1** | MUST | `pm__…`, `id` đặc biệt, `data-*` là **hợp đồng với JS platform**: cấm đổi tên, cấm xoá, giữ đúng quan hệ lồng nhau. Mất hook = nút chết trên production, KHÔNG phải lỗi CSS nên test giao diện không bắt được. |
| **R-PM-2** | MUST | Input giữ nguyên `name` / `type` / `for` / `id`. Cần tắt field thì **ẩn khối bọc theo `id`**, không đổi tên, không xoá input. |
| **R-PM-3** | MUST | Phân biệt `pm__btn-claim` (gạch NGANG — Lucky Draw) vs `pm__btn_claim` (gạch DƯỚI — Payment). **Ngoại lệ**: popup confirm của Payment (`pm__popup-confirm`) vẫn dùng `pm__btn-claim` gạch ngang. Copy nhầm 1 ký tự = nút chết. Trước khi copy khối nút từ campaign khác: đối chiếu loại promotion theo MASTER của gameplay đang làm. |
| **R-PM-4** | MUST | Được **thêm** class/markup riêng cạnh `pm__…`; KHÔNG thay thế. `<any>` là placeholder — phải thay hết bằng tag thật trước khi build. |
| **R-PM-5** | MUST | Giao subagent chạm file `pm__`: brief phải nhồi nguyên 4 luật trên hoặc trỏ file này, **kèm đường dẫn tuyệt đối tới `AI-GUIDE.md` + cặp AI-RULES/MASTER của gameplay**. Không skill frontend nào tự biết luật `pm__`, subagent cũng không nạp được skill. |
| **R-PM-6** | SHOULD | Soát popup theo loại promotion bằng `/check-promotion <loại|STT> <file>` trước khi giao QA. Skill đó **không** soát `pm__` — phần `pm__` tự làm theo R-PM-1..4. |
| **R-PM-7** | MUST | **Cửa vào bắt buộc cho landing promotion** (dựng mới · sửa · bàn giao): đọc `AI-GUIDE.md` → nhận diện gameplay theo bảng route → đọc **đúng MỘT** cặp `AI-RULES-<gameplay>.md` + `MASTER-<gameplay>.html`. Cấm trộn hook giữa 2 gameplay; brief không khớp dòng route nào → **hỏi user**, không tự chọn. Hook không có trong MASTER thì không tự bịa (kể cả `data-*`). |
| **R-PM-8** | MUST | **Cổng trước khi báo xong**: (a) đối chiếu mục *Danh sách SINGLETON* của AI-RULES đang dùng — mỗi hook ở đó xuất hiện **đúng 1 lần** toàn trang (`sso-login-form` là chỗ nhân đôi nhiều nhất); (b) mục *Rule vị trí* — class module đặt ở **thẻ MỞ popup**, text động ở element con cuối, form dò theo `id` chứ không phải class, `pm__module` đi đúng module; (c) không còn `<any>` nào. Chạy **`node ~/VNG/agent-auto/tools/pm-gate.mjs <file.html>`** — nó đọc thẳng AI-RULES của gameplay rồi đếm trên file thật; 🔴 = chặn, 🟡 = hook thiếu hoặc container biến thể, phải soát tay chứ không được lờ. Thiếu output của cổng này = chưa xong. |

## Vì sao tách ra file này
Luật `pm__` trước đây chỉ nằm ở văn xuôi trong `~/.claude/CLAUDE.md`, mỗi lần giao subagent phải copy lại
→ dễ rơi. Có ID rồi thì `code-audit` / `design-checker` trích được `R-PM-3 MUST` thay vì diễn giải lại,
và brief chỉ cần 1 dòng trỏ tới đây.
