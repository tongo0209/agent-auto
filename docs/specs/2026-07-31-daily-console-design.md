# Design: Daily Console — web local bọc terminal claude

> ⚠️ **LỊCH SỬ** — file khai console CHỈ ĐỌC dữ liệu agent-auto. Sai: console CÓ GHI (tick board · metrics · phases · công tắc theo dõi buglist). Xem `README.md` mục Daily Console.

**Ngày:** 2026-07-31 · **Trạng thái:** Đã build & verify (v2.0.0, webpack)

## Nguyên tắc

Web KHÔNG thay engine — chỉ là vỏ. Skill/auth/quyền repo nằm trọn trong terminal thật (claude CLI)
nhúng vào trang. Không Agent SDK, không OAuth riêng. Console **chỉ đọc** dữ liệu `agent-auto/`.

## Quyết định đã chốt với user

| Câu hỏi | Chốt |
|---|---|
| Mức tích hợp | Mức 3 — terminal nhúng thẳng trong web (đã so với: mức 1 chỉ copy lệnh, mức 2 chạy nền mode không-hỏi) |
| Phạm vi nâng cấp | Cả giao diện (cockpit) + chức năng (multi-tab, gt-promotion, lịch sử, metrics, quick action, notification) |
| Kiến trúc code | **webpack + jQuery, source module hoá** — không phải 1 file JS khổng lồ; phải maintain/update được |
| Theo dõi git | CHỈ commit của cá nhân user (`config.gitAuthor`), quét mọi repo trong `config.repos` |
| Theo dõi Jira | Nhóm **theo tháng** để biết khối lượng từng tháng → cần `history/issues.jsonl` |

## Kiến trúc

Backend `server/` (Express, port 4747, bind 127.0.0.1): `lib/` (paths, fsutil, board parser, git)
→ `routes/` (state, git+promotion, months, docs, open) → `ws/terminal.js` (1 WebSocket = 1 pty zsh).
Spawn zsh chứ không spawn thẳng claude — claude thoát thì shell còn, user tự chủ.

Frontend `src/` (bundle webpack, alias `@core/@panels/@components/@terminal`):
`core/` (constants, api — chỗ duy nhất gọi backend, format thuần) → `terminal/TerminalManager.js`
(multi-tab pty, tự reconnect 2s, gõ hộ lệnh) → `components/` (modal, charts HTML/CSS) →
`panels/` (today, months, git, history) → `styles/` 9 file, token tập trung `tokens.css`.

## Palette chart

2 series `--s1 #279A8B` / `--s2 #B67F35`, chạy qua validator dataviz trên nền tối:
lightness band · chroma floor · CVD ΔE 11.6 (protan) · normal-vision ΔE 19.9 · contrast → **ALL PASS**.
Status color (crit/warn/ok/wait) tách riêng, không dùng làm series.

## An toàn

Bind localhost · `POST /api/open` có whitelist (`~/VNG`, `agent-auto`) · console không ghi file
dữ liệu · nút bấm chỉ gõ lệnh vào terminal user nhìn thấy nên mọi cổng duyệt của skill giữ nguyên.

## Nghiệm thu — ĐÃ CHẠY THẬT (2026-07-31)

| Hạng mục | Kết quả |
|---|---|
| `npm run build` | webpack compiled successfully, 48 modules, 3 assets |
| 9 endpoint (`/`, state, months, git, promotion, boards, metrics, brief, board/:date) | tất cả HTTP 200 |
| `/api/git?days=30` | 244 commit của `tont` trên 4 repo (cdn-source 168, new-mainsite 48, vportal2view 15, gt-promotion 13) |
| `/api/months` | 2026-07: total 4, done 0, doing 4 |
| `/api/promotion` | GW-660 → `A49-CFL/h5rungkybi-56985`, commit `206c2a7b` 30/7 15:48 |
| WebSocket + pty | PASS — `echo pty-says-$((40+2))` trả về `pty-says-42` |
| Browser 1920×1080 | 4 tab render đúng, 2 tab terminal cùng nối (`2/2 terminal đã nối`), nút gõ lệnh vào terminal OK, modal Brief hiện nội dung ticket, **0 console error**; đã reset browser session |

## Việc còn để ngỏ (không làm — YAGNI)

Tự gửi Teams/Outlook · tự push git · ghi ngược Jira · chạy mode có cổng duyệt ở chế độ nền.
