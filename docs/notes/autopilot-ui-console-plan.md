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

## Checkpoint 20/10 ~15:55 — hết hạn mức usage
- Xong + commit: 0ed69de dừng ngay/nhắn khi chạy tiếp/huỷ dọn sạch · 0373b9b huỷ xoá thư mục task rỗng. 6 run huỷ đã dọn; còn GW-844 tạm dừng trước implement.
- DỞ: (1) "Mở trong Claude" (claude --resume <cutSession> interactive trong panel, cwd worktree, settings sandbox; nút "Trả lại autopilot"; kiểm session id có đổi khi resume) — subagent bị dừng giữa chừng, kiểm `git status` lab trước khi làm lại. (2) Spike nhắn giữa chừng qua `--input-format stream-json`: script scratchpad/spike-stdin.cjs, lần chạy 15:55 chỉ ra "session limit" → chưa có kết luận, chạy lại sau 16:00.
- Chờ user: push autopilot-lab + c2e8aa0; GW-963 A/B.

## Checkpoint 20/10 ~17:00
- 4800 chạy task bl3nx604a: `AUTOPILOT_LAB_WRITES=1 node autopilot-ui/server.mjs` (user cho bật ghi). Restart phải hỏi user, giữ biến này.
- Commit hôm nay: a88d47a (twig gates), a1fa9d0 (build-pro + bỏ trần budget), 412d573 (skipped), d4012df (Đồng bộ Jira), 8f890ca+f6b19a3 (Chờ review), 505be7c (dock cho run đã review). Suite 215/215.
- GW-844 done, reviewedAt 16:40 (không rõ ai bấm). Code: cdn-source 4ead249b1 nhánh autopilot/GW-844-20261020-153354.
- Subagent đang làm (user duyệt "ok triển đi" + goal "làm đi và test kĩ"):
  1. Dock gom về 1 nút "Mở trong Claude" (tab panel trong worktree run + brief có bảng lệnh autopilot); giữ Huỷ run / Đã review / Chạy tiếp / Duyệt; bỏ Đưa vào source, Sửa tiếp bằng chat, Trả về sửa, Mở lại tab, Xong. Không tự cherry-pick vào repo gốc — chỉ in lệnh.
  2. Mọi tab claude mở từ panel 4800 kèm --append-system-prompt (file trong lab): "việc + ticket/link" → `autopilot run` nền; "làm X cùng tôi" → `open` chat; câu mơ hồ → hỏi trước.
- Sau khi subagent xong: kiểm suite + Playwright, test kĩ (1920/768, panel mở/đóng, lệnh gõ vào tab), hỏi user restart 4800.

## Checkpoint 23/10 — chống crash + nút Chạy chủ động + SSE
- Xong: 2bd1603 server không sập khi handler lỗi (Express 4 không bắt async → Node 25 tắt cả 4800 + mọi tab terminal), run hỏng tách `broken`, artifact là thư mục → 404, trang báo mất kết nối. Suite 368/368.
- Chốt với user: KHÔNG viết lại cả trang bằng framework; dùng Preact + htm (vendor `web/vendor/htm-preact-3.1.1.js`, không build) cho bảng Chạy ticket, các màn khác chuyển dần khi cần.
- Đang làm song song (3 agent, file tách nhau): `web/run-palette.js` (⌘K toàn cục, `openRunPalette({input})`, gợi ý ticket coding/bugfix chưa có run) · `run-events.mjs` + `web/live-runs.js` (SSE thay poll 4s) · nút Chạy trên dòng ticket ở timeline/today/tasks.
- Người điều phối còn phải: gắn route `/api/autopilot/events` vào server.mjs, nối `subscribeRuns` vào autopilot.js + badge app.js, chạy suite + browserpilot 1920/768 trên cổng phụ, commit. 4800 hiện KHÔNG chạy; khởi động lại phải hỏi user, giữ `AUTOPILOT_LAB_WRITES=1`.

## Soát UI/UX 23/10 (server phụ 4815, runs thật, chặn POST) — ĐANG LÀM
- Đo: 0 tràn ngang, 0 lỗi console ở 9 màn × 1920/768.
- Chậm: /api/queue ~1,9s và Hôm nay gọi 2 lần · /api/review 1,8–2,1s (Bug, Task, Review) · /api/git 0,9s · /api/activity 0,65s ⇒ mỗi lần chuyển màn thấy khung chờ ~2s. Route thuộc console repo chính (không sửa) ⇒ hướng: cache phía trang (hiện dữ liệu cũ ngay, tải mới nền) + bỏ gọi trùng queue.
- Autopilot chi tiết: trang dài 11 màn (1920) / 16,7 (768); sơ đồ flow bị cắt ngang ("imp…") + ~170px trống dưới node; danh sách Thay đổi + Các lượt đã chạy dài không có vùng cuộn riêng; dock che đáy.
- Run đã Xong vẫn hiện "Huỷ run" (xoá worktree + nhánh) ngang hàng nút chính.
- Lịch: 31 chữ <11px (nhãn ngày); Review@768: 87 nút <24px; Git@768 dài 11 màn.
- Ảnh: .browserpilot/shots/uxa-<màn>-<1920|768>.png. Server 4815 pid trong scratchpad/uxa/pid — PHẢI kill + kiểm claude mồ côi (PTY tự chạy claude lúc khởi động).
- 23/10: user duyệt "xử lý hết" 6 mục + làm chế độ 3D cho flow autopilot. Chia 4 agent (file tách): A = mục 1,5,6 (cache trang trong app.js, today/timeline/review/git, views.css) · B = mục 2 (terminal.js, app.css: <1200px terminal đóng mặc định, mở dạng ngăn trượt) · C = mục 3,4 (views/autopilot.js + web/autopilot-ui.css: flow vừa khung, vùng cuộn riêng, chừa dock, Huỷ run vào menu phụ, nút bật 3D) · D = web/flow-3d.js (hợp đồng `mountFlow3d(el, run, {onNodeClick}) → {update, destroy} | null`). Cổng phụ 4821-4824. Sau đó: gộp, suite, browser 1920/768, dọn claude mồ côi từ PTY, commit.
- 23/10: user chỉnh: 3D phải là "hoạt hình các agent đang làm việc" → agent D thêm nhân vật robot ở trạm (gõ phím khi running, đi bộ khi chuyển bước, vẫy + "!" khi chờ, ăn mừng khi xong, gục khi dừng) + `setActivity(text)` bong bóng thoại. Người điều phối nối setActivity từ live log (`/api/autopilot/runs/<key>/<runId>/live`, dòng tool cuối) khi gộp.
- B xong: terminal <1200px = ngăn trượt (terminal.js:29-47,196,246-259; app.css:63-70), 47/47. Lưu ý: nền mờ phủ nút Claude nav khi ngăn mở. Cuối đợt phải quét claude --append-system-prompt mồ côi (ppid 1).
- C xong: chi tiết run 11,25→1,00 màn (1920), 16,7→2,1 (768); Huỷ run vào menu ⋯ (autopilot.js:510); nút 2D|3D (syncFlow3d :365, import động :836); dock chừa chỗ :393/:791; style web/autopilot-ui.css. Còn: hàng node fix vẫn để trống khi bước gọi ngoài khung. Chờ A (cache) + D (robot 3D, setActivity → người điều phối nối live log).
- A xong: cache SWR ctx.api(path,{onFresh}) app.js:53-75 (today/review/bugs/tasks nối); chuyển màn 2s → <101ms; Lịch chữ <11px 31→0 (views.css:460); Review@768 nút <24px 87→0 (views.css:408); Git@768 7,7→2,9 màn (20 commit + Xem thêm). queue gọi 2 lần: không tái hiện. Chỉ còn D.
- 23/10 gộp xong A+B+C+D + nối setActivity (autopilot.js showActivity, bỏ qua run bị ngắt) + sửa Lịch vẽ sau khi rời màn (timeline.js render: el.isConnected). Suite 374/374, browser 9 màn × 1920/768: 0 tràn ngang, 0 lỗi; 3D lên canvas + bong bóng 'Edit index.html'.
