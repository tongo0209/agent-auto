# Autopilot lai: mỗi task một tab Claude, máy chỉ chạy phần cơ học

User chốt 20/10 ("Xử lý đi") sau đợt thử 7 luồng: 0/7 tự chạy tới đích, mỗi task vướng vấn đề riêng cần người quyết.

## Hành vi
1. **Bắt đầu task** (palette "Chạy ticket" có 2 nút: *Mở tab chat* (mặc định) · *Chạy tự động* (như cũ)).
   - `autopilot open <KEY|link> [--flow id] [--campaign dir]`: route như `run`, tạo run `mode:'chat'`, `status:'chat'`, tạo worktree như cũ (G0), giữ campaign, ghi `runs/<KEY>/<runId>/brief.md` = checklist các stage của luồng (id + 1 dòng mục tiêu lấy từ prompt) + biến (campaignDir/handoffDir/sheetUrl… đã trỏ worktree) + cách báo tiến độ (mục 2) + cách gọi cổng (mục 3). In JSON `{ key, runId, cwd, args, env }` cho UI.
   - UI mở **tab mới trong panel Claude** (cơ chế tab sẵn có của web/terminal.js + server pty — không tạo pty thứ 2) chạy interactive `claude <args>` với cwd = worktree, `--settings` sandbox (tái dùng claude-runner, không chép chuỗi), env `AUTOPILOT_RUN=<KEY>/<runId>`, prompt đầu: đọc brief.md rồi bắt đầu bước đầu, hỏi user khi vướng.
2. **Tiến độ trên board**: claude trong tab gọi `node <lab>/tools/autopilot.mjs mark <KEY> <stage> <pass|fail|ask|doing> [--note "…"]` → thêm receipt/cập nhật stage; `ask` = đang chờ user trả lời (board tô vàng "Chờ bạn"). Token + phút lấy từ file phiên `~/.claude/projects/<slug cwd>/*.jsonl` mới nhất của cwd đó (CHỈ ĐỌC, cộng usage như tokensOf).
3. **Cổng cơ học**: `autopilot gates <KEY> [checks…]` chạy gates/pm-gate/ui-check/commit-check của luồng trên worktree như stage gate cũ, in kết quả ngắn + ghi artifact; claude trong tab tự gọi khi tới bước đó.
4. Run `chat`: dock có "Mở lại tab" (tab đã đóng thì `claude --resume` phiên mới nhất của cwd) · "Huỷ run" (2 lần bấm, dọn sạch như abort hiện tại) · "Xong" (status done, giữ worktree/nhánh để user review/commit).
5. Run tự động giữ nguyên toàn bộ hành vi hiện có.

## Ràng buộc
Sandbox chặn ghi source gốc vẫn bật trong tab. Không sửa ~/VNG/agent-auto, ~/VNG/git-vng, ~/.claude. Không restart 4800/4747 khi dev (dùng 4801). TDD node --test; UI kiểm playwright 1920×1080 + 768×1024.
