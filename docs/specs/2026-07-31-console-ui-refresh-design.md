# Daily Console — làm lại giao diện cho professional + clean (2026-07-31)

> ⚠️ **LỊCH SỬ** — bảng "Hiện trạng" liệt kê các lỗi ĐÃ FIX XONG, đọc như việc còn tồn là hiểu nhầm. Console nay có 5 tab, không phải 3.

Yêu cầu user: "giao diện hiển thị chưa ổn lắm, xử lý luôn các icon, cần professional và clean hơn".
Quyết định đã chốt trong lượt brainstorm: **làm lại bố cục cột trái + polish**, icon dùng
**thư viện lucide qua npm**, mật độ **gọn-pro** (nhiều dữ liệu trong 1 màn), **giữ palette** hiện tại.

## Hiện trạng (chụp thật 1920×1080, 4 tab — `.browserpilot/shots/console-0*.png`)

| # | Vấn đề | Bằng chứng |
|---|---|---|
| 1 | Icon là emoji (🕐📐💻📦🧪🐛✅🖼📥📄📁) — baseline lệch, cỡ không đều, màu emoji cãi palette teal; vài glyph render thành ô vuông | ảnh tab Hôm nay: `🕐`→⚪, `💻`→▭ |
| 2 | Kanban 8 cột trong cột trái ~880px → cột ~200px, note cắt giữa câu, hàng nút wrap 2 dòng, cột cuối bị cắt + scroll ngang | ảnh tab Hôm nay |
| 3 | 4 KPI viền 4 màu đậm → đọc như toàn báo động, mất hierarchy | ảnh mọi tab |
| 4 | Nhãn tháng `26/07` dễ đọc thành ngày 26 tháng 7 | tab Theo tháng + Git của tôi |
| 5 | Chip task tháng thừa glyph `(` ở đầu | tab Theo tháng |
| 6 | Card commit cuối bị cắt nửa dòng chữ | tab Git của tôi |
| 7 | Nhãn mốc cuối Gantt bị cắt (`Review 1`) | tab Hôm nay |
| 8 | Tab Theo tháng: chart cao chiếm nửa khung chỉ để vẽ 3 cột, nửa dưới trống | tab Theo tháng |
| 9 | Tab Lịch sử chỉ 3 dòng nội dung → cả màn trống | tab Lịch sử |
| 10 | Trộn mono/sans không luật (nhãn tiếng Việt bằng mono) | mọi tab |

## Thiết kế

### 1. Bộ icon — `lucide-static`, một helper duy nhất

- `npm i lucide-static@^1.28` (đã kiểm registry: 1.28.0).
- webpack thêm rule `{ test: /\.svg$/i, type: 'asset/source' }` → icon vào bundle dưới dạng
  **string SVG**, dán được thẳng vào HTML string mà panels đang render (không đổi engine jQuery).
- File mới `src/core/icons.js` = chỗ DUY NHẤT biết tên file icon. API: `icon(name, cls?)`.
  Mọi SVG được chuẩn hoá: `class="ic <cls>"`, `stroke="currentColor"`, bỏ `width/height` cứng.
- Map tên nghiệp vụ → icon lucide:

  | Nghiệp vụ | Icon |
  |---|---|
  | waiting-design / chờ | `clock-4` |
  | ready / sẵn sàng | `ruler` |
  | coding / đang code | `code-xml` |
  | deliver / giao HTML | `package` |
  | wait-test / chờ test | `flask-conical` |
  | bugfix | `bug` |
  | done-fe | `circle-check` |
  | closed | `circle-slash-2` |
  | design đã tải | `image` |
  | design chờ tải | `download` |
  | brief | `file-text` |
  | mở folder | `folder-open` |
  | commit / effort | `git-commit-horizontal` |
  | cảnh báo | `triangle-alert` |
  | link ngoài | `external-link` |
  | lọc | `search` |
  | gõ lệnh | `terminal` |

- CSS `.ic { width:1em; height:1em; stroke-width:1.75; vertical-align:-.125em; flex:0 0 auto }`
  → icon ăn `currentColor` nên tự khớp màu severity của chữ bên cạnh.
- `constants.js`: `PHASE[x].label` **bỏ emoji**, thêm `icon`. Emoji bị xoá sạch khỏi UI.

### 2. Bố cục cột trái — bảng task thay kanban

Tab **Hôm nay** từ trên xuống:

1. KPI 4 ô — viền `--line` một màu; chỉ ô đang cảnh báo mới được dải màu 2px bên trái.
2. Dải mốc 14 ngày + cảnh báo dồn mốc (giữ nguyên nội dung).
3. Gantt 4 tuần — reserve chỗ cho nhãn mốc cuối (`padding-right` + nhãn cuối căn phải).
4. **Bảng task** thay kanban: `Ticket · Việc · Phase · Mốc kế · Design · Effort · Actions`.
   - Nhóm theo phase bằng **dòng nhóm** (không phải 8 cột) → hết tràn ngang.
   - Header sticky, hover dòng, click dòng mở modal chi tiết (dùng `modal.js` sẵn có).
   - Ô lọc theo key/tên/ghi chú giữ nguyên hành vi.
   - Bỏ toggle "Bảng ⇄ Thẻ" và bỏ `kanban.css` (bảng thay cả hai).
5. Cần bạn (checkbox list) — giữ.
6. Log board — giữ.

Gộp tab **Lịch sử** vào **Theo tháng** → còn **3 tab**: Hôm nay · Theo tháng · Git của tôi.
Trong Theo tháng, sau phần tháng: "Board các ngày trước", "gt-promotion — commit mới nhất theo
task", "Metrics ước lượng vs thực tế".

### 3. Typography + token (gọn-pro)

- Luật cứng: **sans** cho mọi chữ tiếng Việt/nhãn; **mono chỉ cho mã** (key ticket, hash, path, số liệu).
- Token thêm/đổi: `--fs:12.5px`, `--fs-sm:11px`, `--row-h:30px`, `--r` 10→8px, `--r-sm` 7→6px.
- KPI: số 22px, nhãn 10.5px uppercase; bỏ 4 viền màu.

### 4. Lỗi sửa kèm

`format.js` nhãn tháng `26/07` → `T7/2026` · chip tháng bỏ glyph `(` thừa · list commit bỏ cắt
nửa dòng (scroll container rõ ràng) · chart tab Theo tháng hạ còn ~140px và card tháng dàn 3 cột.

### 5. Không đụng

Contract đọc `state.json` (console vẫn **chỉ đọc**) · palette + series `--s1/--s2` đã qua validator
dataviz · node-pty/terminal/WS · toàn bộ `server/`.

### 6. Verify (bắt buộc trước khi báo xong)

- `npm run build` chạy thật, không lỗi.
- Chụp lại 3 tab ở **1920×1080** và **768×1024** (luật team), kiểm: không còn scroll ngang ở cột
  trái, không còn chữ bị cắt giữa câu, không còn emoji trong UI.
- README console cập nhật mục "Phase mới sửa ở đâu" (vì `KANBAN_COLUMNS` biến mất) + mục icon.

## Vòng 2 — sau khi user xem bản đầu (31/7 15:5x)

User phản hồi 2 điểm: **timeline "nhìn lệch lệch", và bảng task chưa highlight rõ để phân biệt**.

**Timeline (`components/gantt.js` + `styles/gantt.css`) — vẽ lại trục:**
- Bỏ trục 28 ô flex (nhãn nằm giữa ô nên không trùng vạch nào → cảm giác lệch). Nhãn trục, vạch
  tuần và chấm mốc giờ đều `position:absolute` theo **cùng hàm `pct()`** ⇒ thẳng cột với nhau.
- Nhãn trục = mỗi **thứ Hai** (`3/8 · 10/8 · 17/8 · 24/8`) + `hôm nay`, thay vì số ngày rời rạc.
- Thêm **vạch tuần xuyên mọi hàng** để đối chiếu mốc giữa các task; bỏ ô nền cuối tuần.
- Thêm dải **"đã qua"** (tối hơn) từ đầu trục đến hôm nay — đoạn đầu track trở thành chủ ý.
- **Nhãn mốc gần nhau < 10% thì ẩn chữ**, giữ chấm + tooltip (hết cảnh `Dev BE●Test` chồng nhau);
  mốc HTML luôn được ưu tiên hiện nhãn.
- ⚠ `.gtrack` **không được** `overflow:hidden` — nhãn mốc cuối (đã flip sang trái) cần nhô ra vài px,
  bật hidden là cắt mất chữ (mất số "1" của `Review 1` — đã xảy ra trong lượt này).

**Bảng task (`styles/table.css` + `todayPanel.js`) — phân biệt bằng 3 lớp tín hiệu:**
1. **Dải màu độ gấp** 3px bên trái mỗi dòng theo severity mốc kế (đỏ ≤4d · vàng ≤8d · xanh xa);
   dòng trễ mốc dải dày 4px + đậm hơn.
2. **Dòng nhóm** rõ ranh giới: nền `--raise`, viền trên/dưới, dải màu phase bên trái, icon phase,
   chữ HOA, count trong pill.
3. **Phase là pill** nền `color-mix(currentColor 13%)` → nổi mà không thêm màu mới vào palette.
4. Zebra theo **từng nhóm** (không đếm xuyên nhóm) cho nhóm có nhiều task.

Bề rộng cột sau khi cân lại thực tế: key 64 · phase **112** (pill "chờ design" cần trọn) · due 132
(nhãn dài nhất `Design 08/10 · 10d`) · design 68 · effort **90** (ô chỉ còn commit + dòng thêm) ·
act 104 (`white-space:nowrap`).

**Kết quả verify (đo bằng JS trên trang thật, 1920×1080 và 768×1024):**
`clippedDataCells: []` · `actionsWrapped: 0` · `docOverflowX: false` · `leftOverflowX: false` ·
`svg.ic: 34`. Chỉ còn ellipsis **có chủ ý** ở tên task dài + ghi chú 1 dòng (đều có tooltip đầy đủ).
