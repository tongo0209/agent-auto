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
| Thư viện | `libraryMainsite-1.3.0.css` + `preload` + `<script>` `libraryMainsite-1.3.0.js` từ cùng CDN |
| Khung bắt buộc còn lại | `<body class="<locale>">`, `<div class="MS__layer-loading">`, `<div class="layer-rotate">`, `<div id="MS__wrapper" data-audio="">` |
| Sinh file bàn giao | **Chưa tìm thấy script tự động** trong `cdn-source` (kiểm 19/8: `MODULE_CONTENT` chỉ xuất hiện trong twig/dist của vài campaign). Coi như thao tác tay → phải diff lại với `dist/` |

## Luật

| ID | Sev | Luật |
|---|---|---|
| **R-HO-1** | MUST | **HTML bàn giao lấy từ output build (`dist/`), không phải từ `assets/` twig.** Mọi đường dẫn ảnh/css/js phải là **URL CDN tuyệt đối** đúng `products/<game>/…/<campaign>/dist/…`. Còn sót `./assets/`, `../images/`, `http://localhost` = chưa bàn giao được. |
| **R-HO-2** | MUST | **Giữ nguyên `<% MODULE_CONTENT %>`** ở bản `Promotion/` (ngay sau `<body>`). Không xoá, không đổi khoảng trắng bên trong, không thêm nó vào bản `mainsite/` nếu bản mẫu của request đó không có. Đây là chỗ platform chèn module — mất là trang trống. |
| **R-HO-3** | MUST | **Giữ khung platform**: `<body class="<locale>">`, `MS__layer-loading`, `layer-rotate`, `<div id="MS__wrapper" data-audio="">`. Đây là hợp đồng với libraryMainsite (loading, xoay máy, scale) — xoá vì "không thấy dùng" là làm vỡ trang trên mobile. |
| **R-HO-4** | MUST | **Version thư viện phải khớp campaign** (hiện `1.3.0`, cả `<link>`, `<link preload>` và `<script>`). Không nhân tiện nâng version lúc bàn giao — nâng lib là việc riêng, có kiểm thử riêng. |
| **R-HO-5** | MUST | **Sửa xong soát CẢ `Promotion/` LẪN `mainsite/`** của đúng request (R-GTP-1), và đáp fix xuống **mọi nơi matching**: source `cdn-source` · HTML `gt-promotion-template` · Twig `new-mainsite` (R-GTP-6). Nơi không có bản sao thì ghi "không có bản sao" — đó không phải lỗi. |
| **R-HO-6** | MUST | **`git pull` trước khi sửa** `gt-promotion-template`; HTML ở đó mới hơn source local thì **ghi đè local rồi mới fix**, không fix ngược (R-GTP-3). |
| **R-HO-7** | MUST | **Hook platform là hợp đồng**: `pm__…`/`id`/`data-*`/`name`/`type`/`for` giữ nguyên tên và thứ tự lồng nhau (R-PM-1..6). Dựng theo `ai-template-kit` thì **thay hết `<any>`** bằng tag thật, giữ nguyên mọi thuộc tính của nó. Không còn `<any>` nào trong file bàn giao. |
| **R-HO-8** | MUST | **Sang `new-mainsite`**: text/link nằm trong `{{ … }}`/`{% … %}` **không sửa, không đoán giá trị** (R-TWIG-2); chỉ chạm `templates/<slug>/**` của đúng dự án (R-TWIG-1); **cấm claim "đã verify runtime"** — máy không có php/docker (R-TWIG-5). |
| **R-HO-9** | MUST | **Soát popup trước khi giao QA**: `/check-promotion <loại> <file>` trên chính file HTML bàn giao (R-POP-7, R-GTP-5). Bảng Pass/Fail đính vào phần tổng kết. |
| **R-HO-10** | MUST | **Không tự `git commit` / `git push`** ở `gt-promotion-template` và `new-mainsite` — bàn giao là hành động của user. Cuối phiên đưa `git diff --stat` để user review (R-GTP-2, R-TWIG-4). |
| **R-HO-11** | SHOULD | Trước khi báo xong: `diff` bản bàn giao với `dist/` tương ứng (hoặc liệt kê khác biệt cố ý). Làm tay không có script sinh → đây là cách duy nhất bắt được thiếu section / lệch asset. |

## Quan hệ với các luật khác
- Trong repo đích: [`repo-gt-promotion.md`](repo-gt-promotion.md) — R-GTP-*, [`repo-new-mainsite.md`](repo-new-mainsite.md) — R-TWIG-*.
- Dựng ở nguồn: [`cdn-source-standard.md`](cdn-source-standard.md) — R-CDN-*, [`popup-library.md`](popup-library.md) — R-POP-*.
- Hook `pm__`: [`pm-contract.md`](pm-contract.md) — R-PM-*.
