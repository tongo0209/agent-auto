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
