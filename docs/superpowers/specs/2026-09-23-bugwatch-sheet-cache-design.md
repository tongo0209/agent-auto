# bugwatch: ghi cache buglist bằng script, không để model gõ lại

Ngày: 2026-09-23 · Dự án con 2 của đợt tăng tốc (sau `wall-scan`, `daily-delta-speed`).

## Vì sao

14 lượt `/daily bugwatch` (14 ngày): model 407s/lượt, tool 53s, ~55 dòng assistant. Soi lượt thật `b2b0d9f6`
(23/9 11:3x): thao tác chậm nhất là **`Write /tmp/cfl-new.md` 75s** và **`Write .cache/bugsheets/…md` 24s** —
model gõ lại nội dung `read_file_content` ra file cache, token output (đắt 5×, sinh chậm).

Không phải lỗi chất lượng (đã kiểm lại, đính chính nhận định ban đầu): cache model chép ngắn hơn (CFL 23k vs 35k ký tự)
nhưng vẫn đủ cả ROUND 1 + ROUND 2 — `parseBugTable` trên bản model và bản script ra **0 trường lệch** trên 9 trường × 55 dòng,
`shadowedBugIds` trùng khớp. Lợi ích là tốc độ + token output, không phải sửa sai.

Nội dung Drive đã nằm nguyên văn trong transcript phiên (`tool_result` JSON `{fileContent}`); biến môi trường
`CLAUDE_CODE_SESSION_ID` chỉ đúng file transcript của phiên đang chạy (cả phiên headless của radar).

## Thiết kế

`tools/sheet-cache.mjs <sheetId> [--transcript <path>] [--out <dir>]` (`--out` mặc định `.cache/bugsheets`):

1. Transcript = `--transcript` hoặc `~/.claude/projects/*/<CLAUDE_CODE_SESSION_ID>.jsonl`.
2. Lấy `tool_result` **mới nhất** của `mcp__claude_ai_Google_Drive__read_file_content` có `input.fileId === sheetId`; mở `fileContent`.
3. Tách khối bảng (chuỗi dòng liền nhau bắt đầu bằng `|`); giữ **mọi** khối mà `parseBugTable` (import từ `bug-radar.mjs`, không sửa file đó) ra ≥ 1 dòng — nguyên văn, đúng thứ tự, nối bằng 1 dòng trống.
4. Ghi `.cache/bugsheets/<sheetId>.md`; in JSON `{ sheetId, blocks, rows, chars, from }`.
5. Không thấy lượt đọc → exit 1, báo "gọi read_file_content trước"; thấy mà 0 khối BugID → exit 1, KHÔNG ghi đè cache cũ.

SKILL `daily` bước 3 bugwatch: sau `read_file_content` chạy `node <AGENT_AUTO>/tools/sheet-cache.mjs <sheetId>`, CẤM tự Write nội dung sheet.
`bug-radar.mjs` (đang có thay đổi chưa commit của user về khoá `<đợt>#<bugId>`) KHÔNG đụng.
Radar headless: `Bash(node:*)` đã có trong whitelist — không nới quyền.

## Kế hoạch (TDD)

- **Task 1** — `tools/sheet-cache.test.mjs` đỏ trước, transcript giả trong tmp: (a) 2 khối BugID + 1 bảng không BugID → cache có đúng 2 khối nguyên văn, đúng thứ tự; (b) đọc 2 lần → lấy lần sau; (c) sheet khác không lẫn; (d) không có lượt đọc → exit 1; (e) 0 khối BugID → exit 1, cache cũ giữ nguyên. Rồi code cho xanh, commit `[tools]`.
- **Task 2** — ✅ 23/9: CFL 2 khối / KHT 1 khối, 0,03s/sheet, 0 trường lệch so với cache model chép. Chạy thật trên transcript `b2b0d9f6` cho 2 sheet (ghi ra thư mục tạm qua `--out`, không đè cache thật): CFL phải ra 2 khối, KHT 1 khối; `bug-radar.mjs scan` trên bản mới không lỗi.
- **Task 3** — sửa SKILL bước 3 (chỉ stage phần của mình, giữ nguyên thay đổi user), commit `[skills]`. Nghiệm thu thời gian ở lượt bugwatch thật kế tiếp của radar (`history/radar.jsonl` `ms` so trung vị 527s).

## Ngoài phạm vi

Hạ effort cho bugwatch: `effortFor` chỉ mở cho prompt có cổng đủ bước, bugwatch chưa có cổng ⇒ giữ mặc định.
