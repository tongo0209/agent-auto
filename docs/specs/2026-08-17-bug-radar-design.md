# bug-radar — radar theo dõi buglist hậu bàn giao (17/8/2026)

## Vấn đề

Task code xong → đánh Done trên Jira → bàn giao Promotion/GS. Bên đó test rồi **dán link
buglist vào ticket**. Từ lúc đó ticket đã ra khỏi mọi lưới theo dõi:

- JQL chính là `statusCategory != Done` ⇒ task Done biến mất khỏi bảng `/daily`.
- Không ai soi *nội dung* sheet, nên bug QC gõ lúc 14:00 có thể tới hôm sau mới biết.
- Có ca ngược lại: QC dán link buglist **trước** khi mình kịp đánh Done ⇒ trạng thái ticket
  không phải tín hiệu đáng tin. Tín hiệu đáng tin duy nhất là **có link buglist**.

Mục tiêu: radar tự phát hiện bug mới trong ngày và tự fix, **không cần user bấm gì**.

## Bằng chứng đo được 17/8 (quyết định thiết kế dựa trên đây, không phải suy đoán)

| Phép đo | Lệnh | Kết quả |
|---|---|---|
| Drive MCP trong phiên nền | `claude -p` + `get_file_metadata` | ✅ `DRIVE=OK modifiedTime=2026-08-17T09:00:59.612Z` — 11.3s, $0.30 |
| Chrome MCP trong phiên nền | `claude -p` + `tabs_context_mcp` | ❌ `No matching deferred tools found` — `claude-in-chrome` KHÔNG nạp trong phiên non-interactive |
| Sheet QC đọc được không cần Chrome | `get_file_metadata(excludeContentSnippets:false)` | ✅ trả cả bảng bug: `BugID · Assignee Fix · Description · Image · Comment Thread · Reporter · DEV Check Status · Notes · QC/GS Recheck · Bug Type` |
| Poll nhiều sheet 1 call | `list_recent_files(orderBy:lastModified)` | ✅ `modifiedTime` của mọi sheet trong 1 lần gọi |

**Hệ quả cứng:** phiên nền **đọc** sheet được, **ghi ngược** sheet thì không. Mọi thiết kế
"radar tự ghi DEV Check Status lúc 3h sáng" đều bất khả thi — phải xếp hàng chờ phiên CLI.

## Kiến trúc: nhánh mới của `/daily`, KHÔNG đẻ skill riêng

State (`state.json`), vocab phase, board, console, launchd đều đã thuộc `/daily`. Tách skill
riêng nghĩa là hai chủ cùng ghi một `state.json` — hỏng đúng kiểu khó truy. Nên:

- **Mode mới `/daily bugwatch`** — lượt radar nhẹ chuyên soi sheet.
- `tools/bug-radar.mjs` — NEW, chứa toàn bộ phần *thuần tính toán* (parse sheet, hash dòng,
  diff, nhiệt, chọn prompt, prefilter sở hữu) để test bằng máy, không cần gọi LLM.
- `tools/radar-tick.mjs` — sửa: chọn prompt theo nhiệt, nới `ALLOWED_TOOLS`.

## Dữ liệu — `state.bugWatch`

Khoá theo **sheetId** (không phải theo ticket): một sheet phục vụ được nhiều ticket.

```jsonc
"bugWatch": {
  "1XFJ-8m6…": {
    "url": "https://docs.google.com/spreadsheets/d/…",
    "title": "BugList GNOTH: Chengdu Tournament Web",
    "keys": ["GW-660"],            // ticket gắn với sheet này
    "addedAt": "2026-08-17T10:00:00+07:00",
    "modifiedTime": "2026-08-17T10:18:10.494Z",  // mốc Drive lần cuối thấy
    "lastChangeAt": "2026-08-17T10:18:10.494Z",
    "heat": "hot",                 // hot | warm
    "lastPollAt": "…", "lastReadAt": "…",
    "seenBugs": { "12": "<hash>", "13": "<hash>" },
    "gates": { "g1": true, "g2": true, "g3": true, "g4": true, "at": "…", "why": null },
    "pendingSheetWrite": [ { "bugId": "12", "status": "Done", "note": "…" } ],
    "runs": [ { "at": "…", "bugs": 3, "result": "fixed", "reason": null } ]
  }
}
```

## Luồng một lượt

```
launchd 30' → radar-tick
   ├─ cổng giờ/lock/human (giữ nguyên)
   ├─ pickPrompt(state, now)
   │     có sheet hot            → "/daily bugwatch"   (nhẹ)
   │     đầu giờ (phút < 30)     → "/daily delta"      (đủ, đã gồm bước bugwatch)
   │     nửa giờ + không sheet hot → skip 'cold'       (không tốn token)
   └─ claude -p <prompt>
         ├─ shouldRetire → sheet của task đã qua release: nghỉ theo dõi, bỏ khỏi vòng poll
         ├─ 1 call list_recent_files → modifiedTime mọi sheet + nhận sheet "BugList*" mới
         ├─ sheet nào modifiedTime ĐỔI (tối đa maxSheetReadsPerTick sheet mới mỗi lượt):
         │     ├─ read_file_content → bảng markdown → .cache/bugsheets/<id>.md
         │     ├─ node bug-radar.mjs scan → isBugSheet / settled / toSkill
         │     │     isBugSheet false → notBugSheet, thôi theo dõi (là file brief)
         │     ├─ firstScanMode = seed (sheet cũ, chưa có nền) → chỉ commit nền rồi DỪNG
         │     └─ toSkill > 0 → 4 cổng sở hữu
         │           PASS đủ 4 → Skill bug-fixer-lite (fix code, KHÔNG commit/push)
         │                        → xếp pendingSheetWrite → commit seenBugs
         │           rớt cổng   → 1 dòng "## Cần bạn" + notify, KHÔNG đụng code
         └─ phase ticket → bugfix (kèm reopenedFrom nếu trước đó closed/done-fe)
```

## Vào watchlist bằng đường nào

1. **Radar thường (`delta`)**: JQL hiện tại `assignee = currentUser() AND updated >= -4h`
   **không lọc status**, nên ticket Done vừa bị QC sửa description vẫn lọt vào. Chỉ cần sửa
   một chỗ: hiện `delta` thấy Done là gạt sang `closed` rồi thôi — sau nâng cấp vẫn phải bóc
   link sheet trong description + comment của cả ticket Done.
2. **Backfill 1 lần** khi bật tính năng — **1 call duy nhất, để JQL lọc hộ**:

   ```
   assignee = currentUser() AND updated >= -45d
     AND (description ~ "docs.google.com/spreadsheets" OR comment ~ "docs.google.com/spreadsheets")
   ```

   Đo 17/8: 23 ticket Done → chỉ **6 ticket** có link. Bản đầu tiên đi đường "đọc từng ticket
   bằng `getJiraIssue`" đã chạy **22 phút / $2.63 rồi bị giết** mà chưa ghi được gì — đó là lý
   do có luật cấm trong SKILL.md. Ghi `config.bugRadar.backfilledAt` để không quét lại.

   ⚠ **Không phải link spreadsheet nào cũng là buglist**: 2/5 link đo được là *file brief*
   (GW-629, GW-723). Lọc bằng NỘI DUNG (`looksLikeBugSheet` — có cột `BugID` không), không
   bằng nhãn quanh link.
3. **Kênh Drive (bắt buộc, không phải dự phòng)**: trong chính call `list_recent_files` đã dùng
   để poll, nhận file spreadsheet tiêu đề `BugList*` → nạp watchlist, ghép về ticket bằng
   `matchSheetToTicket` (khớp token tiêu đề, ngưỡng 0.5).

   ⚠ **Đây là kênh cứu thiết kế.** Đo 17/8: `BugList GNOTH: Chengdu Tournament Web` đang được QC
   sửa trong ngày, thuộc **GW-610** (task của user, đã Done) — nhưng ticket `updated` từ 29/7 và
   **không có link buglist nào**. Nếu chỉ đi theo link trong Jira thì radar mù đúng cái sheet
   nóng nhất. Fuzzy match đã khớp đúng GW-610, GW-660, GW-679 trên tiêu đề thật.

4. **`config.bugSheets`** — sheet cố định per-game, giữ nguyên cơ chế cũ.

## Nhiệt: nóng 30' / nguội 60'

Hàm thuần `updateHeat(entry, modifiedTime, now, cfg)`:

- `modifiedTime` khác giá trị đã lưu ⇒ `changed`, mốc `lastChangeAt` được cập nhật.
- `now - lastChangeAt < coolAfterHours (3h)` ⇒ `hot`, ngược lại ⇒ `warm`.
- **Lần đầu thấy một sheet**, `lastChangeAt` lấy chính `modifiedTime` của sheet chứ không lấy
  `now` — nếu không, sheet sửa lần cuối 3 tuần trước vẫn bị coi là nóng suốt 3 tiếng chỉ vì
  hôm nay mình mới nhìn thấy nó.
- Cổng giờ 08–18h do `radar-tick` chặn ở tầng trên, `updateHeat` không cần biết.

launchd hạ `StartInterval` 3600 → **1800**. Lượt nửa giờ mà không sheet nào nóng thì
`skipped:'cold'` — không gọi `claude`, nên chi phí ngày thường **không tăng**.

⚠ **`config.radar.everyMin` PHẢI giữ 60**, thêm `tickEveryMin: 30` riêng. Console suy ngưỡng
"radar chết" = `2.5 × everyMin` và **lọc bỏ dòng `skipped`** khi tìm lượt cuối
(`console/server/lib/radar.js:25`). Hạ `everyMin` xuống 30 ⇒ ngưỡng còn 75 phút trong khi lượt
đầy đủ vẫn 60 phút ⇒ chỉ cần 1 lượt bị cổng ③ nhường cho user gõ tay là console báo đỏ oan.

## Bốn cổng sở hữu — chỉ auto-fix khi PASS đủ 4

| Cổng | Kiểm | Nguồn | Rớt thì |
|---|---|---|---|
| G1 | `assignee` hiện tại còn là mình | `getJiraIssue` | "task đã sang người khác" — không đụng code |
| G2 | biết task sống ở folder nào | `state.issues[KEY].paths` + `pathsConfirmed` | gợi ý `/daily link <KEY>` |
| G3 | sheet đọc được bằng account mình | Drive trả 200 | "Cần bạn: xin quyền sheet" |
| G4 | `toSkill > 0` | prefilter dưới | "bug không thuộc mình" + note routing |

**Prefilter G4 cố tình LỎNG** (ưu tiên không bỏ sót hơn là chính xác) — quyền phán cuối cùng
thuộc `bug-fixer-lite` với ma trận Vùng×Bug Type đầy đủ:

```
mine    : Bug Type ∈ {Functional, Performance, Visual}   (mọi vùng)
mine    : Bug Type = Content  AND  Assignee = Mainsite
notMine : Bug Type = Content  AND  Assignee = Promotion
notMine : Assignee = GameStudio            (phủ quyết, kể cả bug code)
unknown : Bug Type để trống
```

⚠ **G4 đếm `toSkill` = mine + unknown, KHÔNG phải mine.** Đo trên sheet GNOTH thật 17/8:
**19/23 dòng bỏ trống `Bug Type`**. Lọc theo type thì `mine = 0` và radar chặn nhầm sạch sẽ
trong khi vẫn còn bug mở. `unknown` phải được giao cho skill phán, không được nuốt.

⚠ **Schema sheet KHÁC nhau giữa game — map cột theo TÊN, cấm theo vị trí.**

| | CFL | GNOTH |
|---|---|---|
| vùng | `Assignee Fix` | `Assignee` |
| ghi chú | `Notes` | `Evidence` |
| QC soát | `QC / GS Recheck` | `QC / GS Check` |
| cột riêng | — | `Frame` |

Thiếu map `QC / GS Check` là mất **hoàn toàn** khả năng bắt reopen trên sheet GNOTH.

## Nghỉ theo dõi sau release

`shouldRetire(entry, issues, now)`: mốc muộn nhất trong `milestones` của **mọi** ticket gắn
sheet đã qua ⇒ `retired: true`, bỏ khỏi vòng poll. Đúng ngày release vẫn theo dõi (bug hay về
đúng hôm đó). Không biết mốc ⇒ vẫn theo dõi — thiếu dữ liệu không phải bằng chứng đã xong.

Cùng tinh thần với `jqlRecentDoneNote` đã có: ticket chỉ rời radar khi mốc MUỘN NHẤT đã qua,
không phải khi Jira đánh Done.

## Hai lưới chặn "lượt đầu nã cả sheet cũ"

`isSettled` **một mình không đủ** — đo 17/8 trên GW-679: sheet để rỗng cả header
`DEV Check Status`, nên 12 bug đã fix từ tháng 7 vẫn mang trạng thái trắng và lọt qua lưới.

Lưới thứ hai `firstScanMode(entry)`: `seenBugs` rỗng **và** sheet sửa lần cuối quá
`freshFirstScanHours` (24h) ⇒ `seed` — chỉ gieo nền `seenBugs` rồi dừng, không fix. Sheet QC
vừa động trong 24h ⇒ `act`. Đúng tinh thần yêu cầu: radar theo dõi **thay đổi từ lúc bật**,
không đi đào lại quá khứ.

## Lọc bug đã xong — `isSettled`

Lưới thứ nhất, đọc trạng thái QC đã ghi sẵn trong sheet. Đo thật trên sheet GNOTH: 23 dòng,
**22 đã xong, chỉ 1 bug còn mở**.

```
recheck báo Failed/reopen        ⇒ CÒN MỞ  (thắng mọi dấu hiệu khác)
recheck hoặc devStatus = Skip/N/A ⇒ đã xong (QC quyết bỏ)
recheck = Confirmed fix           ⇒ đã xong (kể cả khi devStatus trống — ca thật bug 5)
devStatus = Done/Fixed            ⇒ đã xong
hai cột trống                     ⇒ CÒN MỞ
```

## Chống fix lại bug cũ

Mỗi dòng bug có `rowHash = sha1(bugId | desc | devStatus | recheck | assignee | type)`,
chuẩn hoá khoảng trắng và hoa–thường trước khi băm.

- `bugId` chưa có trong `seenBugs` ⇒ **MỚI**.
- `bugId` có nhưng hash khác ⇒ **ĐỔI** (QC sửa mô tả, hoặc recheck trả Failed = **REOPEN**).
- hash trùng ⇒ bỏ qua, kể cả khi `modifiedTime` của sheet đổi (QC sửa ô khác, tô màu…).

Chỉ ghi `seenBugs` **sau khi** lượt fix chạy xong — nổ giữa chừng thì lượt sau làm lại,
thà lặp còn hơn nuốt mất bug.

## Ghi ngược sheet — hàng đợi, do ràng buộc đã đo

Phiên nền không có Chrome ⇒ kết quả cần ghi (`DEV Check Status = Done`, `Notes` routing) xếp
vào `pendingSheetWrite`. Board ghi `🕐 chờ ghi sheet: N dòng`. Phiên `/daily` tương tác kế
tiếp **tự xả hàng đợi ở Bước 0**, không cần lệnh riêng; ai muốn xả tay thì `/daily bugwrite`.

## Phase

Ticket có bug mới ⇒ `phase = "bugfix"` kể cả đang `closed`, kèm `reopenedFrom: "closed"`.
**Không thêm phase mới** ⇒ `schema/vocab.json`, console, `state-doctor` không phải sửa.

## Luật an toàn — giữ nguyên, không nới

- KHÔNG `git commit` / `git push`, kể cả khi radar tự fix xong. User review rồi tự push.
- KHÔNG ghi gì lên Jira.
- Radar không hỏi — rớt cổng thì ghi `## Cần bạn` rồi đi tiếp.

## Rủi ro đã biết

| Rủi ro | Xử |
|---|---|
| Sheet lớn bị cắt nội dung — **đã loại trừ** | Đo 17/8: `read_file_content` trên sheet GNOTH 45MB trả `TRUNCATED=NO`, đủ 23 dòng bug (97s, $0.74) |
| Header lạ ở game mới | Thêm vào `COLUMNS` + test; radar không đoán ở tầng skill |
| Radar fix code khi không ai trông | Không commit/push; mọi thay đổi nằm trong working tree cho user xem diff |
| Chi phí tăng | Lượt nửa giờ không có sheet nóng thì skip; chỉ đọc nội dung khi `modifiedTime` đổi |
| QC sửa 1 ô vặt làm sheet "đổi" | `rowHash` chặn ở tầng dòng, không chạy fix |

## Phạm vi thay đổi

| File | Việc |
|---|---|
| `tools/bug-radar.mjs` | NEW — hàm thuần + CLI `scan`/`commit`/`pick`: `parseBugTable`, `looksLikeBugSheet`, `rowHash`, `diffRows`, `isSettled`, `classifyBug`, `prefilterMine`, `updateHeat`, `firstScanMode`, `shouldRetire`, `matchSheetToTicket`, `checkGates`, `mergeWatch`, `pickPrompt` |
| `tools/bug-radar.test.mjs` | NEW — 67 test, fixture chép nguyên văn từ 2 sheet QC thật |
| `tools/radar-tick.mjs` | chọn prompt theo nhiệt; trần riêng cho bugwatch; nới `ALLOWED_TOOLS` (Drive) |
| `tools/radar-agent.plist` | `StartInterval` 3600 → 1800 |
| `config.json` + `config.example.json` | khối `bugRadar`; `radar.tickEveryMin`, `timeoutMinBugwatch`; `timeoutMin` 5 → 10 |
| `skills/daily/SKILL.md` | mode `bugwatch` + `bugwrite` + mục "Bug-radar" |
| `tools/state-doctor.mjs` | W8 sheet chưa gắn ticket · W9 hàng đợi ghi sheet còn tồn |
