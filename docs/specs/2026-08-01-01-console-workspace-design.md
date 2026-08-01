# Console thành nơi làm việc thật (hệ con ②)

Ngày: 2026-08-01 · Trạng thái: đã duyệt · Thứ tự thực thi: 1/4

## Vấn đề

Board 2026-08-01 có **9 mục trong "Cần bạn"**, trong đó 2 ticket (GW-654, GW-477) đã
`xong-có-verify` từ 31/7 mà vẫn nằm chờ. Nút thắt không phải tốc độ code — mà là các việc chỉ
bạn làm được: review diff rồi push, gạch việc đã xong, mở design ra xem.

Console hiện **chỉ đọc**: muốn review phải mở terminal khác, `cd` vào repo, `git diff`, tự soạn
commit message theo convention. Muốn gạch việc xong phải mở `boards/<ngày>.md` sửa tay.

## Phạm vi

| Làm | Không làm |
|---|---|
| Tab **Review**: diff theo ticket, gõ hộ lệnh commit | Nút commit/push thật (luật global: không bao giờ tự commit) |
| Tick "Cần bạn" ghi ngược board | Sửa nội dung dòng "Cần bạn" từ web |
| Nút mở `designs/<KEY>/`, `questions-for-pm.md` | Trình xem ảnh design trong web |
| Thông báo khi tab terminal rảnh trở lại | Bắt exit code chính xác của agent |
| Backup quay vòng `state.json` + `git init` | Auto-commit agent-auto |

## Kiến trúc

### 1. Tab Review — `/api/review`

```
GET  /api/review            → [{ key, repo, subpath, dirty: n, files: [{path, status, added, deleted}] }]
GET  /api/review/diff?repo=&path=   → text/plain (git diff của 1 file)
```

- Nguồn ticket: `state.issues[key].paths` (contract có sẵn từ 31/7).
- `git -C <repo> status --porcelain -- <subpath>` → file đổi; `git diff --numstat` → +/− mỗi file.
- File mới (`??`) không có numstat → đếm dòng bằng `wc -l`, đánh dấu `status: 'new'`.
- Cache TTL 5s (`lib/cache.js` có sẵn) vì panel poll.
- **Chặn đường dẫn**: `repo` phải là một value trong `config.repos`; `path` resolve xong phải nằm
  trong repo đó. Ngoài whitelist → 403. Console không được thành lỗ hổng đọc file tuỳ ý.

Frontend `src/panels/reviewPanel.js`: mỗi ticket 1 card → bảng file (status · +/− · tên) → bấm file
ra modal diff (dùng `showText` có sẵn, thêm class tô màu `+`/`-`). Cuối card:

- nút **Gõ hộ commit**: sinh `git -C <repo> add <subpath> && git -C <repo> commit -m "[<leaf>] <subject>" -m "Co-Authored-By: ..."`
  với `<leaf>` = tên folder cuối của subpath, `<subject>` = ô input bạn tự gõ (mặc định trống, không
  bịa message). Bấm = gõ vào tab terminal đang mở, **không tự Enter** ⇒ bạn đọc lại rồi Enter.
- nút mở repo trong VS Code.

### 2. Tick "Cần bạn"

```
POST /api/board/check { date, index, done: true|false }
```

- `index` = thứ tự bullet trong section `## Cần bạn` (đúng thứ tự `readBoard().needYou`).
- Ghi: `- [ ] X` → `- [x] ~~X~~` (đúng quy ước bạn đang gạch tay), bỏ tick thì đảo lại.
- **An toàn ghi**: đọc file → sửa đúng 1 dòng → ghi ra `<file>.tmp` → `rename` (atomic);
  trước khi ghi copy bản cũ vào `.backups/boards/<date>-<ts>.md`.
- Chỉ cho ghi board **trong `dir.boards`** và ngày hợp lệ `YYYY-MM-DD`.
- Từ chối nếu nội dung dòng không khớp `expectText` client gửi lên (chống race với agent đang ghi
  board cùng lúc) → trả 409, client reload rồi hiện lại.

### 3. Nút mở nhanh

`paths.js` thêm `dir.designs`. `todayPanel` thêm 2 icon-button mỗi dòng task: mở `designs/<KEY>/`
(Finder, chỉ hiện khi folder tồn tại — server trả cờ `hasDesignDir`), mở `questions-for-pm.md`
(VS Code, chỉ hiện khi file tồn tại).

### 4. Thông báo khi agent xong

`TerminalManager` mỗi session giữ `lastOutputAt`, `busySince`. Vòng kiểm 1s:
busy (có output trong 3s) → không output ≥5s **và** đã busy ≥30s ⇒ bắn 1 lần:

- `Notification` của browser (xin quyền 1 lần khi bấm nút bất kỳ, không xin lúc load),
- badge `document.title = '● (1) Daily Console'`, xoá khi cửa sổ focus.

Đây là **heuristic theo im lặng của output**, không phải exit code — ghi rõ trong tooltip
("tab 2 đã rảnh 5s") để không đọc thành "agent báo thành công".

### 5. Bền dữ liệu

- `server/lib/backup.js`: `snapshot(file, bucket)` → copy vào `.backups/<bucket>/<name>-<ts>`,
  giữ 30 bản mới nhất, xoá bản cũ hơn. Gọi trước mọi lần console ghi file.
- `git init` trong `agent-auto` + `.gitignore` (`console/node_modules`, `console/dist`, `.backups`,
  `.browserpilot/shots`). **Không commit** — commit đầu tiên hỏi user.

## Kiểm chứng

| Cái gì | Đo bằng |
|---|---|
| `/api/review` ra đúng file đổi | `curl` so với `git status --porcelain` chạy tay trên cùng repo |
| Chặn path | `curl` với `repo=/etc` và `path=../../etc/passwd` → phải 403 |
| Ghi board | chạy trên bản copy trong scratchpad trước; sau đó tick thật 1 dòng rồi `git diff` (board chưa versioned → so bản backup) |
| 409 khi lệch | sửa dòng bằng editor giữa 2 lần gọi → phải 409, không ghi đè |
| UI không vỡ | browserpilot `run_script`: 0 ô bị cắt · 0 tràn ngang ở 1920×1080, reload 768×1024 |
| Notification | mở tab, chạy `sleep 40` → phải bắn đúng 1 lần, không bắn khi `sleep 3` |
