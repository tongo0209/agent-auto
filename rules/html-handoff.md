# Bàn giao HTML sang platform — R-HO-*

Đọc khi đưa một landing đã dựng trong `cdn-source` sang **`gt-promotion-template`** (HTML cho platform)
hoặc **`new-mainsite`** (Twig cho mainsite).

**Vì sao có file này:** hai repo đích đã có luật riêng (`repo-gt-promotion.md`, `repo-new-mainsite.md`) nhưng
chúng nói về *cách cư xử trong repo đó* — không nói **HTML phải trông thế nào khi rời cdn-source**. Chỗ trống
đó là nơi hay vỡ: path tương đối lọt ra production, mất placeholder của platform, bản `Promotion/` và
`mainsite/` lệch nhau.

## Facts (kiểm 2026-08-19 — bằng chứng `gt-promotion-template/221_JXM/RequestH5BinhChonVoLam_56193/`)

| Việc | Thực tế |
|---|---|
| Cấu trúc bàn giao | `<mã-game>/<Request…_id>/{Promotion,mainsite}/` — **cùng một trang nằm ở 2 thư mục** |
| File trong 1 request | `Promotion/index.html`, `Promotion/prod-template-pc.html`, `Promotion/prod-template-mobile.html`, `mainsite/index.html`, `mainsite/index-2.html` (số lượng khác nhau theo request) |
| Placeholder platform | `<% MODULE_CONTENT %>` nằm ngay sau `<body>` **chỉ ở bản `Promotion/`** — `mainsite/index.html` không có (kiểm `Promotion/index.html:18` vs `mainsite/index.html`) |
| Đường dẫn asset | **URL CDN tuyệt đối**: `https://cdn-mainsite-aka.vnggames.com/products/<game>/landing/<campaign>/dist/optimized/<section>/images/…` — không có path tương đối |
| Thư viện | `libraryMainsite-1.3.2.css` + `preload` + `<script>` `libraryMainsite-1.3.2.js` từ cùng CDN |
| Khung bắt buộc còn lại | `<body class="<locale>">`, `<div class="MS__layer-loading">`, `<div class="layer-rotate">`, `<div id="MS__wrapper" data-audio="">` |
| Sinh file bàn giao | `cdn-source` không có script. **Dùng `tools/mk-handoff-html.py`** (viết 10/9/2026): `--src dist/index.html --cdn <prefix> --out <file>` sinh + soát, `--check <file...>` soát bản đã có. Nó chặn ghi nếu bản mới làm **mất** hook so với bản cũ |

## Luật

| ID | Sev | Luật |
|---|---|---|
| **R-HO-1** | MUST | **HTML bàn giao lấy từ output build (`dist/`), không phải từ `assets/` twig.** Mọi đường dẫn ảnh/css/js phải là **URL CDN tuyệt đối** đúng `products/<game>/…/<campaign>/dist/…`. Còn sót `./assets/`, `../images/`, `http://localhost` = chưa bàn giao được. **Soát phải đếm CẢ `srcset`/`imagesrcset` và `url()` trong inline style, không chỉ `src`/`href`** — chạy `python3 ~/VNG/agent-auto/tools/mk-handoff-html.py --check <file>`. Ca thật 10/9/2026: `index-cos.html` bàn giao 8/9 có **64 `srcset` của `<source>`** để tương đối trong khi `src`/`href` đều tuyệt đối ⇒ platform resolve theo domain của nó nên ảnh mobile trong `<picture>` **404 suốt 2 ngày**, mà cổng soát tay chỉ grep `src\|href` nên báo "0 URL tương đối" oan. Ngoại lệ đã đo: `data-link="content-popup/…"` giữ **tương đối** — cả 5 file trong request đó, kể cả 2 file của đồng nghiệp đang chạy production, đều vậy. |
| **R-HO-2** | MUST | **Giữ nguyên `<% MODULE_CONTENT %>`** ở bản `Promotion/` (ngay sau `<body>`). Không xoá, không đổi khoảng trắng bên trong, không thêm nó vào bản `mainsite/` nếu bản mẫu của request đó không có. Đây là chỗ platform chèn module — mất là trang trống. ⚠ **Placeholder này KHÔNG phải mặc định, đừng tự chèn khi dựng nửa `Promotion/` mới**: đo cả repo 17/9/2026 chỉ **3/27** file `Promotion/index.html` có nó; ngay trong cùng game `377_ZSM`, bản `Request_H5_Promotion_Center_58018` **không có** (2 nửa của nó chỉ khác ở `usingAjax`, style vá captcha và vài hook `pm__` do BE thêm). Bảng Facts ở trên rút từ đúng 1 mẫu `221_JXM/RequestH5BinhChonVoLam_56193` — một trong 3 ca có. ⇒ Luật đúng là **giữ nguyên nếu có**, còn khi tạo mới thì theo bản mẫu của chính request/game đó; không rõ thì hỏi BE, đừng chèn cho chắc. |
| **R-HO-3** | MUST | **Giữ khung platform**: `<body class="<locale>">`, `MS__layer-loading`, `<div id="MS__wrapper" data-audio="">` (+ `layer-rotate` **chỉ khi landing H5**). Đây là hợp đồng với libraryMainsite (loading, scale) — xoá vì "không thấy dùng" là làm vỡ trang trên mobile. Landing PC/MB (`varMS` có `H5: false`) **không** thêm `layer-rotate`: lib 1.3.2 không đọc class này (lớp xoay máy của lib là `.rotate-phone` tự chèn), khung kèm `display:none` chỉ là nếp chép từ template H5 — đo 5/10/2026: 23 bản `mainsite/` PC/MB đã bàn giao không có nó. `mk-handoff-html.py --check` tự bỏ qua khi thấy `H5: false`. |
| **R-HO-4** | MUST | **Version thư viện phải khớp campaign** (hiện `1.3.0`, cả `<link>`, `<link preload>` và `<script>`). Không nhân tiện nâng version lúc bàn giao — nâng lib là việc riêng, có kiểm thử riêng. |
| **R-HO-5** | MUST | **Sửa xong soát CẢ `Promotion/` LẪN `mainsite/`** của đúng request (R-GTP-1), và đáp fix xuống **mọi nơi matching**: source `cdn-source` · HTML `gt-promotion-template` · Twig `new-mainsite` (R-GTP-6). Nơi không có bản sao thì ghi "không có bản sao" — đó không phải lỗi. Máy so 2 nửa: `python3 ~/VNG/agent-auto/tools/check-handoff-sync.py --folder <game>/<request>` (exit 1 = có chữ lệch). |
| **R-HO-6** | MUST | **`git pull` trước khi sửa** `gt-promotion-template`; HTML ở đó mới hơn source local thì **ghi đè local rồi mới fix**, không fix ngược (R-GTP-3). |
| **R-HO-7** | MUST | **Hook platform là hợp đồng**: `pm__…`/`id`/`data-*`/`name`/`type`/`for` giữ nguyên tên và thứ tự lồng nhau (R-PM-1..12). Dựng theo `ai-template-kit` thì vào bằng `AI-GUIDE.md` với gameplay đã khoá trong file dự án (R-PM-7, R-PM-11), **thay hết `<any>`** bằng tag thật, giữ nguyên mọi thuộc tính của nó. Trước khi giao (MỌI landing promotion, kể cả landing cũ — user chốt 6/10/2026): `node ~/VNG/agent-auto/tools/pm-gate.mjs <file bàn giao> --baseline none` trên TỪNG file locale ở gt-promotion — gameplay đọc qua mục 2 *Nơi code* của file dự án; phải **0 🔴 kể cả lỗi có sẵn** (baseline `HEAD` từng để lọt `mto-login-form`/`btn-refresh` ở GW-881). Lệch kit chỉ được giữ khi đã có dòng trong `rules/pm-kit-overrides.tsv` (R-PM-9); rồi `/check-promotion` (R-HO-9) + QA của kit (R-PM-10). **Đây là cổng chặn đủ**: campaign `hooks-at: handoff` (mặc định, R-PM-11) chỉ báo 🟡 `PG-REQ`/`PG-REF` ở `dist/` cdn-source, hook thiếu chỉ bị chặn ở file bàn giao — chưa chạy `pm-gate` trên file HTML ở gt-promotion, hoặc còn 🔴, thì chưa được báo bàn giao xong. |
| **R-HO-8** | MUST | **Sang `new-mainsite`**: text/link nằm trong `{{ … }}`/`{% … %}` **không sửa, không đoán giá trị** (R-TWIG-2); chỉ chạm `templates/<slug>/**` của đúng dự án (R-TWIG-1); **cấm claim "đã verify runtime"** — máy không có php/docker (R-TWIG-5). |
| **R-HO-9** | MUST | **Soát popup trước khi giao QA**: `/check-promotion <loại> <file>` trên chính file HTML bàn giao — loại theo mục Khoá của file dự án. Cùng một cổng MUST với R-PM-6, R-POP-7, R-GTP-5. Bảng Pass/Fail đính vào phần tổng kết; còn Fail = chưa giao. |
| **R-HO-10** | MUST | Bàn giao xong **tự `git commit` đúng path vừa ghi** ở `gt-promotion-template` / `new-mainsite`, báo lại hash + `--stat` (R-GIT-4, user chốt 6/10/2026). **`git push` vẫn hỏi** — gộp vào câu hỏi cuối task. |
| **R-HO-11** | SHOULD | Trước khi báo xong: `diff` bản bàn giao với `dist/` tương ứng (hoặc liệt kê khác biệt cố ý) — đây là cách bắt được thiếu section / lệch asset. **Cách kiểm chứng phép biến đổi URL trước khi ghi đè**: sinh lại bản bàn giao **CŨ** từ `dist/` **CŨ** (`git show <commit>~1:<path>`) rồi so với file bàn giao đang có; khác biệt phải **đúng bằng** phần cố ý. Chính bước này lộ ra 64 `srcset` sót ở R-HO-1 — nếu chỉ sinh bản mới rồi ghi đè thì lỗi đó đã im lặng đi tiếp. |
| **R-HO-12** | MUST | **Giao kèm folder `assets/`, chỉ ở `mainsite/`** (user chốt 5/10/2026). Bàn giao `gt-promotion-template` = `mainsite/index.html` **+ chép `dist/assets/` của bản `build-optimize` vào `mainsite/assets/`** cạnh HTML — để dành cho việc clone landing sau này. HTML vẫn trỏ URL CDN tuyệt đối (R-HO-1 giữ nguyên); `assets/` chỉ là bản lưu, HTML không đọc từ đó. Chỉ đụng `mainsite/`, KHÔNG đụng `Promotion/` — luật này thắng phần "soát CẢ `Promotion/`" của R-HO-5/R-GTP-1. |

## Quan hệ với các luật khác
- Trong repo đích: [`repo-gt-promotion.md`](repo-gt-promotion.md) — R-GTP-*, [`repo-new-mainsite.md`](repo-new-mainsite.md) — R-TWIG-*.
- Dựng ở nguồn: [`cdn-source-standard.md`](cdn-source-standard.md) — R-CDN-*, [`popup-library.md`](popup-library.md) — R-POP-*.
- Hook `pm__`: [`pm-contract.md`](pm-contract.md) — R-PM-*.
