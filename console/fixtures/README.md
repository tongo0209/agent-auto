# fixtures — cảnh dựng sẵn để kiểm console bằng máy

Dữ liệu BỊA (ticket `DEMO-*`, sheet `example.invalid`), KHÔNG phải state thật của user.
`server/lib/paths.js` đọc `CONSOLE_STATE` / `CONSOLE_CONFIG` nên trỏ được console sang đây:

```bash
cd console
CONSOLE_STATE=$(node fixtures/stamp.mjs reopened) CONSOLE_CONFIG=fixtures/config.json npm run serve
```

| File | Cảnh | Phải thấy |
|---|---|---|
| `reopened.json` | 1 buglist đang theo dõi, QC mở lại bug #12 #34 | alert `bug-reopened` (crit) kèm `sheetUrl`; bảng bug: following 1 · off 1 · closed 1 |
| `qc-no-buglist.json` | DEMO-201 ở phase `wait-test`, chưa có buglist nào | alert `qc-test-no-buglist` (warn) |
| `config.json` | config giả: `repos: {}` (không quét repo thật), `notify: false`, startup `echo fixture-startup` | không bắn notification macOS, không ghi `history/notified.jsonl`, không mở claude thật |

`stamp.mjs <tên>` chép fixture ra /tmp rồi làm tươi `openBugsAt` (cổng 6h) và in đường dẫn — chạy
thẳng file gốc thì lượt quét bị coi là cũ và cảnh báo `bug-reopened` KHÔNG hiện.

Chạy tự động: `npm run smoke` (xem `smoke/README.md` cho phần phải kiểm bằng mắt).
