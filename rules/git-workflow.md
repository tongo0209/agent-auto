# R-GIT-* · Git: commit, format, luồng nhánh

`MUST` = chặn · `SHOULD` = cảnh báo.

| Mã | Mức | Luật |
|---|---|---|
| **R-GIT-1** | MUST | **`git commit` tự làm được, KHÔNG hỏi.** (14/8/2026 user gỡ cổng; hook `G-GIT-2` cũng bỏ chặn để `/commit` chạy trơn.) Lý do: commit local còn amend/reset/revert được, hỏi từng lần chỉ ngắt luồng. Đổi lại: gom đúng phạm vi project đang làm, và **BÁO LẠI đã commit những gì**. |
| **R-GIT-2** | MUST | **`git push` KHÔNG BAO GIỜ tự làm** — hỏi user TỪNG lần. Đây là bước đi ra ngoài: người khác pull về, CI/CD chạy. Hook `G-GIT-2` giữ `ask`. |
| **R-GIT-3** | MUST | **2 hệ commit format, không lẫn** (chốt 19/8/2026). Repo đẩy lên **git VNG** (`cdn-source`, `gt-promotion-template`, `new-mainsite`, `vportal2view`): theo skill `/commit` — Conventional Commits `(<type>): <mô tả>` + footer `Co-Authored-By`; CI/CD VNG bắt format này, KHÔNG dùng `[leaf-folder]`. Repo **nội bộ** (`agent-auto`, `promptAgent`, tool cá nhân): `[<leaf-folder>] <English subject>` + trailer Co-Authored-By. |
| **R-GIT-4** | MUST | **KHÔNG commit hộ user** ở `gt-promotion-template` / `new-mainsite` (R-GTP-2, R-TWIG-4) — chỉ đưa `git diff --stat`. |
| **R-GIT-5** | MUST | **`cdn-source` — trước MỌI commit: tự `git pull --autostash origin master`**, không hỏi. Nhánh tụt sau master khi người khác merge. **Conflict thì tự resolve**: giữ ý định cả 2 phía, cấm `--ours`/`--theirs` cho gọn, xong báo đã giữ gì. |
| **R-GIT-6** | MUST | **`cdn-source` — user kêu "push" mới chạy `git mr`** (alias local của repo) = push + tạo MR sang `master` + giữ nhánh. DỪNG Ở TẠO MR — nút Merge là của user. |

## cdn-source — bối cảnh đã đo thật (21/8/2026)

- Push thẳng `master` bị server chặn. Nhánh của user là **`tont`**, sống lâu qua nhiều MR (đã bỏ tick *Delete source branch* nên không bị xoá sau merge).
- **KHÔNG thêm `merge_when_pipeline_succeeds`**: đã thử ở MR !3/!4 — project bật check *Pipelines must succeed* mà repo không có `.gitlab-ci.yml` ⇒ MR treo vô hạn. Đừng đề xuất lại.
- Push options chỉ ăn khi lần push đó cập nhật ref; commit đã push rồi thì phải tạo MR tay.
