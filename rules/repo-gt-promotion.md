# gt-promotion-template — facts + R-GTP-*

`/Users/lap17727/VNG/git-vng/gt-promotion-template` · repo git chung **FE ↔ BE**: FE sửa HTML, BE lấy lên server.

## Facts (kiểm 2026-08-13)

| Việc | Thực tế |
|---|---|
| Cấu trúc | `<mã-game>/<request>/{Promotion,mainsite}/` — **cùng một bộ HTML nằm ở 2 chỗ** (vd `221_JXM/RequestH5BinhChonVoLam_56193/Promotion` + `.../mainsite`) |
| Vai trò | Kênh bàn giao HTML cho platform; **bằng chứng bàn giao = user đã push repo này** |
| Ngoài luồng | Không nằm trong luồng `/daily` (README agent-auto) |
| Tài sản kèm | `standard-html-templates/` — nguồn của skill `/check-promotion` |

## Luật

| ID | Sev | Luật |
|---|---|---|
| **R-GTP-1** | MUST | Sửa xong phải soát **CẢ `Promotion/` LẪN `mainsite/`** của đúng request đó. Sót 1 bên = production lệch 1 nửa mà build vẫn xanh. |
| **R-GTP-2** | MUST | KHÔNG `git commit` / `git push` ở repo này — bàn giao là hành động của user. `git push` có hook `G-GIT-2` chặn thật; `git commit` thì KHÔNG hook nào chặn (14/8/2026 user gỡ cổng) — đây là luật tự giác, đừng vì lệnh chạy được mà commit. Cuối phiên đưa `git diff --stat` để user review. |
| **R-GTP-3** | MUST | `git pull` TRƯỚC khi sửa. HTML ở đây mới hơn source local → ghi đè local rồi mới fix; **không fix ngược từ local lên**. |
| **R-GTP-4** | MUST | Giữ hợp đồng `pm__` → `pm-contract.md` (R-PM-1..4). Đây là nơi hay copy khối nút giữa các campaign nên R-PM-3 (`btn-claim` vs `btn_claim`) dễ vỡ nhất. |
| **R-GTP-5** | SHOULD | Trước khi giao QA: `/check-promotion <loại|STT> <file>` để soát popup theo loại promotion. |
| **R-GTP-6** | SHOULD | Mọi fix phải đáp xuống **mọi nơi matching**: source local (`cdn-source`) · HTML ở đây (2 thư mục) · Twig (`new-mainsite`). Nơi không có bản sao thì ghi "không có bản sao" — đó không phải lỗi. |
