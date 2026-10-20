# Stage clone — landing-clone {{KEY}}

Clone `{{cloneSource}}` sang `{{campaignDir}}` theo `rules/landing-structure.md` (R-STR: đặt lại `name`/folder, `<section id>` = tên folder) và `rules/cdn-source-standard.md`. Repo `{{repo}}`.
Thay ảnh/chữ theo design trong `designs/{{KEY}}/` (đã cắt thì lấy `_auto-export/`). Giữ cấu trúc, hook `pm__`/`MJ__`/`data-*` nguyên vẹn.
Bản giao cũ phải giữ zero-edit → build-optimize rồi chạy `sync-optimized-names.mjs` để đuôi file output khớp campaign cũ (bẫy png↔webp 404).
KHÔNG commit, KHÔNG push. Nguồn chỉ là URL (không phải folder) → verdict `fail`, ghi câu hỏi vào blocking.

Verdict: `pass` + `files` = mọi file đã tạo/sửa, tương đối với repo.
