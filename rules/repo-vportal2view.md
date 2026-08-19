# vportal2view — facts + R-VP2-*

`/Users/lap17727/VNG/git-vng/vportal2view` · tầng view Twig của platform vportal2 (thế hệ trước `new-mainsite`).

## Facts (kiểm 2026-08-13)

| Việc | Thực tế |
|---|---|
| Quy mô | **37.718 file `.twig`** — lớn hơn new-mainsite (4802) gần 8 lần |
| Cấu trúc | `<game>/{component,layout,template}/` (vd `3q/layout`, `3q/template`) — mỗi game 1 thư mục ở gốc repo |
| Nhánh | `master` (new-mainsite là `dev` — **đừng nhớ lẫn**) |
| Deploy | có `.gitlab-ci.yml`; không có `composer.json`/`package.json` ⇒ **không có bước build ở local** |
| Render tại local | KHÔNG — máy không có php/docker (xem `repo-new-mainsite.md`) |
| `.claude/` | **KHÔNG được gitignore** ⇒ đừng tạo artifact trong repo này, để ở `agent-auto/` |
| Mức tài liệu | Trước 2026-08-13: **không skill nào nhắc tới repo này**, chỉ có mặt trong `agent-auto/config.json` |
| Bạn có commit ở đây | Có — commit mới nhất của repo là của bạn (`chore: ignore browserpilot runtime artifacts`) |

## Luật

| ID | Sev | Luật |
|---|---|---|
| **R-VP2-1** | MUST | Chỉ sửa `<game>/**` của ĐÚNG game trong ticket. 37.718 file ⇒ sửa lan là không ai soát nổi. |
| **R-VP2-2** | MUST | Text trong `{{ … }}` / `{% … %}` (biến, logic render) → KHÔNG sửa, KHÔNG đoán; đó là việc của backend. |
| **R-VP2-3** | MUST | Verify PATH-SCOPED: đối chiếu đúng file đã sửa. CẤM grep cả repo — chắc chắn dính bản sao giữa các game. |
| **R-VP2-4** | MUST | KHÔNG được claim "đã verify runtime" — không render được ở local. Bằng chứng tối đa: `git diff` + Read live path. |
| **R-VP2-5** | MUST | `git commit`/`git push` phải hỏi bạn từng lần — repo dùng chung, 37.718 file, nhánh `master`. `git push` có hook `G-GIT-2` chặn thật (`ask`; ở `bypassPermissions` thành `deny` vì không còn prompt); `git commit` thì KHÔNG hook nào chặn nữa (14/8/2026 user gỡ cổng) — ở repo này đây là **luật tự giác**, đừng vì lệnh chạy được mà commit. `git push -f origin master` bị `G-GIT-1` deny thẳng, nhưng `git push -f` viết tắt (không ghi tên nhánh) chỉ rơi xuống `ask` của `G-GIT-2` — đừng gõ `-f` ở repo này. |
| **R-VP2-6** | MUST | File có `pm__…` → theo `pm-contract.md` (R-PM-1..4). |

## Còn mở (cần bạn chốt 1 lần, tôi ghi lại)
Vai trò thật của repo này trong luồng hiện tại: **còn dùng cho game mới**, hay chỉ maintain game cũ và
game mới đã sang `new-mainsite`? Câu trả lời quyết định `/daily` có cần dò folder ở đây khi neo ticket không.
