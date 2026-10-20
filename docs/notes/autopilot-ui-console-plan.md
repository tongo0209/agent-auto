# Console mới ở 4800 (autopilot-ui) — kế hoạch đang làm

User chốt 20/10: làm đủ 7 màn + terminal, UI mới hoàn toàn, 4747 vẫn chạy song song tới khi user bỏ.

## Kiến trúc
- `autopilot-ui/server.mjs`: express lấy từ `console/node_modules` (createRequire), Host chỉ 127.0.0.1/localhost.
  - Handler autopilot gắn TRƯỚC `express.json` vì nó tự đọc body.
  - Mount lại mọi router `console/server/routes/*` dưới `/api`, giống `console/server/index.js:37-60`. Preview mount ở `/`.
  - Terminal: `attachTerminal(server, '/term')` (`console/server/ws/terminal.js`), gắn sau khi listen.
  - Không chạy job notify/metrics để tránh trùng với 4747.
- Frontend: `autopilot-ui/web/` dùng ES module thuần, không build.
  - `index.html` + `app.css` + `app.js` (router và shell) + `views/<màn>.js`.
  - xterm serve từ `console/node_modules/@xterm`.
- Log trực tiếp: stage `claude -p` ghi `runs/<KEY>/<runId>/<stage>-r<n>.log`; UI poll đuôi file.

## Thứ tự
1. Server + shell (nav 7 màn, panel terminal) + chuyển Autopilot vào `views/autopilot.js`.
2. Terminal nhiều tab.
3. Autopilot log trực tiếp.
4. Hôm nay, Task + drawer ticket.
5. Review, Bug, Git, Board, Tháng.
6. Verify ở 1920/768, docs, commit từng mốc.

## Verify
`node --test --test-timeout=20000 autopilot-ui/*.test.mjs tools/autopilot.test.mjs tools/lib/autopilot/*.test.mjs`, rồi browserpilot trên 4800.
Bấm Duyệt thì chặn POST bằng `page.route` để không duyệt thật GW-912/882.

## Đang làm 20/10 chiều (sau khi user than "code vào source đang làm")
- User chốt: tách hết ra worktree `~/VNG/agent-auto-lab` (nhánh `autopilot-lab`, tạo từ 2ecb114). main agent-auto lùi về 986377d bằng `git reset --keep`, file dở của phiên khác giữ nguyên.
- Còn phải: chép views/*.js + views.css (subagent viết, chưa commit) + docs/architecture.md + runs/ sang lab; chạy 4800 từ lab; sửa đường dẫn trong ~/.claude/CLAUDE.md (promptAgent) sang agent-auto-lab.
- Yêu cầu mới của user: console mới mất phần "theo dõi list timeline" (console cũ có) → làm lại dạng timeline list hoặc board kiểu Jira.
- User 20/10: màn đầu tiên (mở mỗi ngày) phải là TIMELINE/LỊCH khoảng thời gian tới — kiểu list timeline của console cũ (Gantt + dự báo) hoặc board kiểu Jira. "Nhìn rõ lịch khoảng thời gian tới". Hôm nay/Task xếp sau.
- User 20/10: màn Task — mỗi mục tách rõ (đang dính liền, không ngăn, khó nhìn) + mỗi mục thu gọn / mở full được.

## Trạng thái tách (xong 20/10)
- main agent-auto đã lùi về 986377d (`reset --keep`), 6 file dở phiên khác còn nguyên. Mục autopilot trong skills/psd-cut + figma-cut (không thuộc git) đã gỡ, bản lưu ở docs/notes/skill-autopilot-sections/. runs/ (GW-882, GW-912 paused, .held.json, .lock-run) đã dời sang lab/runs.
- Lab chạy: `cd ~/VNG/agent-auto-lab && node autopilot-ui/server.mjs` (4800). Mượn console repo chính qua autopilot-ui/console-root.mjs; mọi non-GET /api → 403 trừ khi AUTOPILOT_LAB_WRITES=1.
- Test: `node --test --test-timeout=20000 --test-force-exit autopilot-ui/*.test.mjs tools/autopilot.test.mjs tools/lib/autopilot/*.test.mjs` → 112/112.
- Dòng routing autopilot trong ~/VNG/promptAgent/CLAUDE.md (dòng 10) trỏ path main đã mất → gỡ.

## Việc tiếp
1. Màn đầu = Timeline/lịch sắp tới (console cũ có Gantt + dự báo: xem console/web của 4747 để bóc dữ liệu + API nào). Đặt làm route mặc định.
2. Task: tách mục rõ + thu gọn/mở từng mục.
3. Verify 1920/768 (chặn POST), kiểm 768 cho 7 màn subagent làm (chưa xem ảnh), trạng thái lỗi.

## Mốc 20/10 chiều
- Xong + commit: shellEnv 9b4f2b3 · toolbar terminal f4d5e41 · startup tab khôi phục 2cde17a · Lịch/Task/ẩn ADHOC 55e1681 · thứ tự nhóm Task 1226068. Server 4800 chạy lại từ lab (task bmjyks9qd).
- Treo chờ user: sửa GW-881 done-fe → wait-test + luật /daily (chưa làm, state.json là dữ liệu thật).
- Lỗi lab: autopilot route đọc state.json ở lab (không có) ⇒ phase null ⇒ không khớp luồng. Sửa: đọc state của main chỉ-đọc.
- Implement của autopilot sửa thẳng cdn-source thật ⇒ cần worktree cdn-source riêng + tắt write-sheet trước khi chạy thử task thật.
- Đang làm: thư viện trường hợp task (task-cases) — bóc từ state.json/memory/lessons/git → bảng case → luồng; trình user duyệt trước khi code.

## Checkpoint 20/10 15:xx — chạy thử 7 luồng
- Sandbox hook (7f2dce5): claude của run bị chặn Edit/Write/Bash nhắm git-vng, agent-auto, ~/.claude; worktree mượn node_modules.
- Script chạy thử: scratchpad/run-all.sh → run-all.log; snapshot source gốc trước/sau mỗi run (snap-before/after-<KEY>.txt).
- Thứ tự: GW-912 landing-fix · GW-963 gameplay-change · GW-909 design-intake · GW-950 buglist · GW-844 landing-new · GW-627 feature · GW-806 landing-clone.
- Chờ user: mở nút autopilot qua cổng 403 (server.mjs sửa, CHƯA commit — classifier chặn); restart 4800 phải hỏi; push 2 nhánh.
- 15:3x: 4800 đã restart (task bbkrmkrmh) với aafe309 (mở nút autopilot) + 5818086 (token/phút tiêu hao, bỏ budget mặc định). Run thử 7 luồng vẫn chạy nền (b3826ppks, log scratchpad/run-all.log).
- Đang làm: tạm dừng theo ý (marker .pause, dừng sau bước hiện tại) + phát hiện run bị ngắt (status running mà lock chết) → nút Chạy tiếp.
- 89253fc (merge ff): pause/Bị ngắt + Chạy tiếp, 177/177. CẦN restart 4800 (hỏi user). GW-912 dừng budget $10 ở gates (do script --budget-usd 10); source gốc đổi lúc 15:11 là commit ghoststory của phiên khác, không phải autopilot.

## Checkpoint 20/10 15:50 — dừng ngay / nhắn / huỷ dọn sạch (ĐANG LÀM, chưa commit)
- Đã commit: e2e379f sandbox chỉ chặn ghi · 875fd18 lưu run trước mỗi stage · 09cd22b sheetUrl vào prompt buglist + cho handoff-drift · b348b90 nút Huỷ cho run đã dừng. Server 4800 restart 15:3x (task bap975gsm).
- Đang làm (test đỏ đã viết): runner ghi `.child` {pid} + detached + bắt session_id từ dòng init (XANH) · driver: stopRequested → halt paused + run.cutSession {stage,sessionId}, không retry, không receipt; resume nối `--resume` + continuePrompt (+ run.resumeNote) (driver.mjs) · CLI pause/abort tắt nhóm PID trong `.child` (chưa làm) · test cũ driver.test.mjs:333 cần đổi sang hành vi mới.
- Tiếp: abort = tắt + xoá worktree (`git worktree remove --force`) + nhánh autopilot/<KEY>-<runId> + rm thư mục run; UI bỏ nhóm "Đã huỷ"; `resume --note` + ô nhắn ở dock khi stopReason paused.
- Đợt thử 7 luồng XONG 15:48: GW-912 gates budget · GW-963 plan fail (mâu thuẫn quyết định payment 14:51 → hỏi user A/B) · GW-909 fetch-design fail (SharePoint cần extension) · GW-950 drift-check fail (thiếu sheetUrl — đã sửa, chạy lại run MỚI) · GW-844 user pause trước implement · GW-627 plan fail · GW-806 clone fail (chưa xem lý do).
