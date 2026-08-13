# new-mainsite — facts + R-TWIG-*

`/Users/lap17727/VNG/git-vng/new-mainsite` · nơi mainsite apply giao diện landing tĩnh (Twig).
Đọc file này **trước khi** chạm bất kỳ `.twig` trong repo đó.

## Facts (kiểm 2026-08-13, có bằng chứng)

| Việc | Thực tế |
|---|---|
| Stack | Symfony (PHP) + Twig · `composer.json` require `php ^7.1.3` · Dockerfile `php:8.1-fpm` (chạy trên server) |
| Quy mô | **4802 file `.twig`** · **120 slug** dưới `templates/<slug>/` |
| Nhánh làm việc | `dev` |
| **Build/test tại local** | **KHÔNG LÀM ĐƯỢC** — máy này không có `php`, không có `docker`/`docker-compose` (đã kiểm `command -v`). `composer install`, `php bin/phpunit`, `php bin/console` fail ngay ở dòng đầu. |
| `.env` | `/.env` + `.env.local` bị gitignore, **không tồn tại ở local**; `.env.test` ĐƯỢC commit → đọc bình thường (hook `guard-bash` đã trừ ca này) |
| `.claude/` | đã gitignore (`.gitignore:55`) → artifact cá nhân đặt trong đó không bẩn repo team |
| Script bàn giao | `mergeDevToMain.sh`, `commitStaging.sh`, `bin/create-merge-request.sh` → hook `G-DEPLOY-1` sẽ HỎI, không tự chạy |

## Luật

| ID | Sev | Luật |
|---|---|---|
| **R-TWIG-1** | MUST | Chỉ sửa `templates/<slug>/**` của ĐÚNG dự án đang xử lý. Không đụng `templates/base.html.twig`, `templates/security/**`, `src/`, `config/`, `translations/`, `vendor/` nếu ticket không nói rõ. |
| **R-TWIG-2** | MUST | Text/link nằm trong `{{ … }}` / `{% … %}` (biến, translation key, logic render) → **KHÔNG sửa, KHÔNG đoán giá trị**. Tra biến ở **`docs/fe-controller-output-variables.md`** (liệt kê mọi biến controller inject + nguồn `block_config.yaml`/`site.yaml`) rồi soạn note routing: nói rõ tên biến + nơi khai, đừng chỉ nói "lỗi backend". Biến theo ngôn ngữ có dạng `_context['download' ~ locate ~ '_href']` — 1 link sai có thể chỉ sai ở 1 locale. |
| **R-TWIG-3** | MUST | Verify **PATH-SCOPED**: chỉ đối chiếu đúng file đã sửa (live path). CẤM grep cả cây `templates/` — 4802 file, dính bản sao/baseline gây false-positive (đã xảy ra thật 2026-07-17: checker soi file baseline báo FAIL trong khi live đã đúng). |
| **R-TWIG-4** | MUST | KHÔNG `git commit` / `git push` ở repo này (repo phụ — user tự review diff & đẩy). Hook `G-GIT-2` chặn sẵn. |
| **R-TWIG-5** | MUST | KHÔNG được claim "đã chạy / đã verify / render OK" cho thay đổi Twig — máy không render được (xem Facts). Bằng chứng tối đa cho phép: `git diff` + Read đúng live path. Thiếu bằng chứng thì ghi rõ "chưa verify runtime". |
| **R-TWIG-6** | MUST | Hook platform (`pm__…`, `id`, `data-*`) trong Twig cũng là hợp đồng → theo `pm-contract.md` (R-PM-1..4). |
| **R-TWIG-7** | SHOULD | `git pull` trước khi sửa (repo team nhiều người). Nếu HTML bên `gt-promotion-template` mới hơn local source → ghi đè local rồi mới fix, không fix ngược. |

## Vì sao cần file này
Toàn bộ luật Twig trước đây chỉ nằm **bên trong skill `bug-fixer-lite`** (SKILL.md:207, 261, 352).
Vào new-mainsite bằng đường khác (`/daily`, `/code-developer`, sửa tay trong phiên) thì không gì nhắc —
và đây là repo duy nhất trong 4 repo ở `config.json` **không có `.claude/` nào**, tức không có mô tả riêng.
