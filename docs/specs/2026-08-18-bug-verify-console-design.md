# Bug đã fix — báo cho user và để user verify (18/8/2026)

Tiếp nối `2026-08-17-bug-radar-design.md`. Radar biết soi buglist và sửa bug rồi, nhưng **sửa
xong thì im**: user không có đường nào biết để kiểm tra. Spec này bịt đúng chỗ đó.

## Vì sao cần — đo thật 18/8

| Đo được | Số liệu |
|---|---|
| Radar đã tự fix bao nhiêu bug | **0** — cả 2 lượt bugwatch (17/8 11:06, 18/8 01:57) đều `fixed: 0`; 2 bug nó xử lý đều là user đã fix tay từ trước |
| Hàng chờ ghi sheet treo lâu nhất | GNOTH #22 xếp hàng 17/8 11:05Z, tới 18/8 04:2xZ vẫn treo — **17 giờ**, QC vẫn thấy "chưa Done" |
| Popup hiện có nói gì | `decideNotify` chỉ có `change`/`auth`/`dead`; loại `change` đếm dòng jsonl nên ra *"1 dòng phases"* — sửa code hay đổi phase đều báo y hệt |
| Console biết gì về bug | `grep -r 'bugWatch\|pendingSheetWrite' console/src console/server` = **0 hit** |
| Artifact dashboard có dùng được không | **Không** — headless không có tool Artifact (`SKILL.md:324`); `dashboard.html` đứng từ 3/8, cũ 15 ngày |

## Quyết định đã chốt với user

1. **Cổng duyệt trước khi ghi.** Ghi sheet là hành vi lộ ra ngoài, đứng tên user ⇒ không dòng
   nào tự lên sheet. Luồng vốn đã chặn ở đây (phiên nền không có Chrome), giữ cổng không tốn thêm.
2. **Console là kênh chính, popup là phụ.** Popup bắn một lần rồi biến; console là trạng thái
   thường trực, load lại lúc nào cũng thấy. Console tự đọc `state.json` mỗi 3s ⇒ radar nền chỉ
   cần ghi file, không cần Chrome, không cần Artifact, không phụ thuộc user có mở CLI hay không.
   **Hệ quả: bỏ hẳn tầng "nhắc lại theo nhịp"** — có trạng thái thường trực thì không cần nhắc nợ.
3. **Duyệt ở CLI** bằng `/daily bugwrite`. Console chỉ đọc, không ghi sheet.
4. **Ca chưa chắc: sửa code, KHÔNG đánh Done.** Code sửa sẵn để user khỏi gõ lại, dòng sheet để
   nguyên, chờ mắt người. QC không bao giờ thấy Done mà chưa ai nhìn.

## Kiến trúc — 3 mảnh

### Mảnh 1 · Máy chấm độ chắc — `tools/bug-radar.mjs`

```js
gradeFix({ buildOk, liveMatch, hasQcImage, repro }) → { grade, why, whyLabel }
```

`verified` chỉ khi `buildOk && liveMatch && (hasQcImage || repro)`. Còn lại `unverified` kèm lý
do **enum** (`build-failed` · `build-not-run` · `live-mismatch` · `live-not-checked` ·
`no-evidence`) — enum chứ không phải chuỗi tự do, vì có enum mới test được.

Bằng chứng lấy từ máy: `buildOk` = exit code build · `liveMatch` = `curl` file trên CDN rồi
`cmp` với `dist/` local (tiền lệ CFM #3) · `hasQcImage` = cột `Image` của sheet · `repro` = tái
hiện được bug trước khi sửa.

Đặt ở tầng máy vì **cùng bằng chứng phải ra cùng kết luận mọi lượt**. Để LLM tự chấm thì mỗi
lượt một kiểu — đúng cái bệnh mà `bug-radar.mjs` sinh ra để chữa.

`whyLabel` (nhãn tiếng Việt) sinh ngay lúc chấm và lưu cùng dòng: console là CommonJS, tools là
ESM — để mỗi bên tự dịch enum là đẻ hai bảng nhãn lệch nhau.

### Mảnh 2 · Hàng đợi biết phân loại — `state.bugWatch[].pendingSheetWrite`

Xếp hàng bằng CLI để LLM không tự tay ghi state:

```
node tools/bug-radar.mjs queue <sheetId> '{"bugId","desc","note","fixCommit","verifyHint","evidence":{…}}'
```

`queueRow` chấm điểm ngay lúc ghi, đóng dấu `queuedAt`, và **thay dòng cùng `bugId`** thay vì đẻ
bản trùng. Lệnh `pending` trả `{total, verified, unverified}` cho radar-tick.

`commit` ghi thêm `lastScan` (`rowsTotal · settled · toSkill · fresh · changed · reopened là
DANH SÁCH bugId · mine/unknown/notMine`) để console kể được động tĩnh mà không cần LLM thuật lại.

### Mảnh 3 · Console + popup

- `console/server/lib/bugs.js::buildBugs` — hàm thuần, chia 2 rổ theo `grade`, tính `heldHours`,
  xếp dòng treo lâu nhất lên đầu, kèm danh sách sheet đang theo dõi. **`grade` thiếu hoặc lạ ⇒
  tính là `unverified`** — fail-safe, không bao giờ mặc định cho qua.
- `GET /api/bugs` — chỉ đọc, đúng luật console.
- Tab **Bug** (`console/src/panels/bugPanel.js`) + badge đếm. Badge nạp ngay lúc load trang và
  làm mới mỗi 15s, không đợi user bấm vào tab mới biết có hàng.
- `tools/radar-tick.mjs`: `pendingDelta(before, after)` chỉ đếm phần TĂNG ⇒ lượt vừa xả hàng đợi
  không bị hiểu nhầm là có việc mới. `decideNotify` thêm kind `bugfix`, xếp **sau** `auth`/`dead`
  (sửa được radar rồi mới nói chuyện fix) nhưng **trước** `change` (tin bug actionable hơn).

## Luồng đầy đủ

Radar tick → `/daily bugwatch` → phát hiện bug của mình, 4 cổng sở hữu pass → `bug-fixer-lite`
sửa code (vẫn **không commit, không push**) → thu bằng chứng → `queue` (máy chấm) → radar-tick so
`countPending` trước/sau → **popup** → user mở console thấy 2 rổ → `/daily bugwrite` → duyệt từng
dòng → ghi sheet qua Chrome, đứng tên user → xoá khỏi hàng đợi.

## Không làm (YAGNI)

Không nhắc lại nhiều lần trong ngày · không đẩy điện thoại · không duyệt trên web · không tự
commit/push · không đụng artifact dashboard.

## Ranh giới đã cân nhắc và bỏ

**Chặn cứng bằng máy việc ghi Done cho dòng `unverified`** — bỏ. Việc ghi sheet do LLM thao tác
qua Chrome trong phiên tương tác, không có tầng máy nào chặn thật được. Ghi thành luật trong
`SKILL.md` + phân rổ rõ ở console, và **không hứa trong test cái mà code không cưỡng chế được**.

## File đụng tới

| File | Việc |
|---|---|
| `tools/bug-radar.mjs` | `gradeFix` · `countPending` · `queueRow` · `saveState` · CLI `queue`/`pending` · `commit` ghi `lastScan` |
| `tools/bug-radar.test.mjs` | 6 test mới (73 tổng) |
| `tools/radar-tick.mjs` | `pendingDelta` · kind `bugfix` · đếm hàng trước/sau lượt |
| `tools/radar-tick.test.mjs` | 3 test mới (24 tổng) |
| `console/server/lib/bugs.js` + `.test.mjs` | `buildBugs` · 7 test |
| `console/server/routes/bugs.js` · `server/index.js` | `GET /api/bugs` |
| `console/src/panels/bugPanel.js` · `index.js` · `index.html` · `core/api.js` | tab Bug + badge |
| `console/src/styles/bugs.css` · `styles/index.css` | style tab Bug |
| `skills/daily/SKILL.md` | mục "Chấm độ chắc" + "Báo cho user — console là kênh chính" |

## Nghiệm thu

`npm run check` trong `console/`: lint sạch · **129 test pass** · webpack build OK · state-doctor
0 ERROR. Chạy `buildBugs` trên `state.json` thật: 2 dòng đang treo (GNOTH #22 17h, CFM #3 3h),
9 sheet đang theo dõi, 2 sheet `retired`, 2 sheet `not-buglist` — đúng thực tế.

Hai dòng cũ hiện `unverified` vì được xếp hàng **trước** khi có cơ chế chấm điểm; đây là fail-safe
hoạt động đúng, không phải phát hiện mới. Chúng sẽ được chấm lại khi chạy `/daily bugwrite`.

## Việc còn mở (KHÔNG thuộc spec này)

- Sheet mồ côi (`keys: []`) không bao giờ retire — `shouldRetire` trả `false` khi `keys` rỗng,
  hiện 5 sheet dính (`state-doctor` W8).
- `/daily delta` fail 2 lượt liên tiếp sáng 18/8 (`stop_reason: stop_sequence`, cost $0, 0 token)
  — khác hẳn ETIMEDOUT hôm 17/8, chưa điều tra.
- Nhánh auto-fix của radar **chưa chạy thật lần nào** — spec này làm cho đường báo sẵn sàng
  trước, nhưng vẫn cần một ca fix thật để nghiệm thu đầu-cuối.
