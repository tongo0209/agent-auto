<!-- Phần luật RIÊNG của nền tảng nội bộ. Không đi kèm bản public.
     tools/install-skills.sh nối file này vào cuối CLAUDE.md nếu nó tồn tại. -->

## Routing bổ sung
| Loại việc | Đường ray |
|---|---|
| **Chạm file HTML có class `pm__`** (landing promotion) — áp lên MỌI dòng dưới | `project-note path` → đọc file dự án → khoá gameplay (R-PM-11) → `ai-template-kit/AI-GUIDE.md` (bộ quy chuẩn team), TRƯỚC khi đọc code. Ưu tiên làm THẲNG inline. Buộc giao subagent → brief = đường dẫn file dự án + `rules/pm-contract.md` + AI-GUIDE + cặp AI-RULES/MASTER đã khoá (R-PM-5); KHÔNG skill frontend nào tự biết luật này |

## Landing promotion (file có class `pm__`)
- **Cửa vào** (dựng mới · sửa · fix bug · bàn giao): `node ~/VNG/agent-auto/tools/project-note.mjs path <file>` (chưa có → `init <campaignDir>`) → đọc file dự án `projects/<game>/<slug>.md` → **khoá gameplay TRƯỚC dòng code đầu tiên** (`project-note lock`). Cấm đoán gameplay từ hook trong file; không khớp route → hỏi user. Chi tiết + trình tự: `rules/pm-contract.md` R-PM-1..12.
- **Bộ quy chuẩn bắt buộc của team**: `~/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit/AI-GUIDE.md` → route tới ĐÚNG 1 cặp `AI-RULES-<gameplay>.md` + `MASTER-<gameplay>.html` (hook 🔸 bổ sung trong AI-RULES là hợp lệ). Ngoài kit: `gameplay: none` + `type` + `ref` (landing mẫu cùng loại). **Production thắng kit** — `rules/pm-kit-overrides.tsv` (R-PM-9: `popup_login`, không `popup_signIn`).
- `pm__…` / `id` đặc biệt / `data-*` = **hợp đồng với JS platform**: cấm đổi tên, cấm xoá lẻ, giữ đúng lồng nhau (được cắt NGUYÊN block không dùng theo kit). Mất hook = nút chết, không phải lỗi CSS.
- Input: giữ nguyên `name` / `type` / `for` / `id`. Tắt field bằng cách ẩn khối bọc theo `id`, KHÔNG đổi tên.
- Bẫy: `pm__btn-claim` (gạch NGANG — Lucky Draw) vs `pm__btn_claim` (gạch DƯỚI — Payment; riêng popup confirm của Payment vẫn là `pm__btn-claim`). Copy nhầm là nút chết.
- Được **thêm** class/markup riêng cạnh `pm__…`; KHÔNG thay thế. `<any>` là placeholder, phải thay hết bằng tag thật trước khi build.
- Cổng trước khi báo xong: `node ~/VNG/agent-auto/tools/pm-gate.mjs <file>` khi sửa + `--page <campaignDir>` sau build (R-PM-8, mã `PG-*`; landing cũ chỉ chặn lỗi mới, lỗi có sẵn → `project-note debt`) · `/check-promotion <loại|STT> <file>` trước QA là **MUST** (R-PM-6) — skill đó KHÔNG soát `pm__` · QA của kit trước bàn giao (R-PM-10) · cuối task `project-note refresh` + `log`.
- **Vùng tự do** (UI/CSS/JS riêng cạnh hook): code theo `rules/cdn-source-standard.md` (R-CDN/R-SPR) + `rules/landing-js.md` (R-JS) + `rules/landing-structure.md` (R-STR: section, tên khi clone, trang phụ, `<body class>`). Landing mới có pha tối ưu `/clean-code` trước khi báo xong; landing cũ chỉ dọn vùng đang chạm, phần còn lại ghi mục 7 Nợ của file dự án.
- **Cấm dùng skill `fill-pm-class`** cho landing (R-PM-12) — nó ngược kit.
