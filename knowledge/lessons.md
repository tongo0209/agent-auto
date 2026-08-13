# Bài học

Mỗi bài học 1 block. Nguồn ghi: `fe-gate` fail tự append block nháp · `/daily wrap` · gõ tay.
`code-developer` đọc file này TRƯỚC khi giao dev.

## clone-khung-khong-mang-font-cua-design-moi

- Bắt được: GW-654 dựng bằng cách clone `2026-affiliate-2`; khung chỉ mang 2 font của đợt trước,
  thiếu 8 font design mới — gồm `PlusJakartaSans-SemiBold`, font nhiều nhất toàn trang (373 run).
- Nguyên nhân: CSS trỏ tới font không tồn tại vẫn là CSS HỢP LỆ → build 0 error, console browser
  sạch, browser fallback im lặng, 2 design-checker nhìn ảnh vẫn PASS. Lỗi thuộc loại THIẾU-VẮNG:
  không có gì "sai" để nhìn thấy, chỉ có thứ đáng ra phải có mà không có.
- Lưới chặn: `tools/fe-gate.mjs` check `font-file-missing` + `font-undeclared` + `design-font-unused`
  — so danh sách khai báo với danh sách file thật trên đĩa. Bắt buộc chạy trước khi báo xong FE.
- Nguồn: GW-654 · 2026-08-01

## metrics-phu-thuoc-buoc-go-tay-thi-khong-bao-gio-co-du-lieu

- Bắt được: sau 3 ngày chạy `/daily`, `knowledge/metrics.jsonl` 0 dòng và `history/issues.jsonl`
  không tồn tại. Dashboard vẫn hiện "metrics: 0 bản ghi" mà không ai coi đó là lỗi.
- Nguyên nhân: cả hai file chỉ được ghi bởi `/daily wrap` — một mode phải gõ tay, cuối ngày, đúng
  lúc dễ bỏ nhất. Vòng học phụ thuộc ý chí thì không chạy.
- Lưới chặn: console tự ghi `history/phases.jsonl` mỗi lần phase đổi (quan sát khi poll state) và
  `metrics.jsonl` 1 dòng/ngày/ticket đo TỪ GIT. `wrap` chỉ còn thêm nhận xét chủ quan.
- Nguồn: agent-auto · 2026-08-01

## thu-vang-mat-can-so-danh-sach-khong-phai-nhin-anh

- Bắt được: 3 lớp kiểm tra (build · console browser · design-checker qua ảnh) đều trượt cùng một
  lỗi font. Ảnh chụp và mắt người không phân biệt được font fallback gần giống.
- Nguyên nhân: mọi lớp đó kiểm "cái đang có có đúng không", không lớp nào kiểm "cái phải có có
  mặt không".
- Lưới chặn: với mỗi loại tài nguyên (font, ảnh, sprite), luôn có 1 check dạng
  *tập khai báo* − *tập file thật* = ∅. Rẻ, tất định, chạy < 1s.
- Nguồn: GW-654 · 2026-08-01

## sp-rest-clipboard-chet-doc-rest-bang-extension-thay-the

- Bắt được: `scripts/sp-rest.sh` (đường clipboard: `open -a Edge` → System Events `Cmd+A`/`Cmd+C`
  → `pbpaste`) trả về **nguyên văn clipboard cũ của user** và `exit 1`. Rất dễ tưởng là SharePoint
  chặn quyền, vì triệu chứng giống hệt ca `accessDenied` — nhưng REST hoàn toàn ăn.
- Nguyên nhân: `keystroke` qua System Events cần quyền Accessibility cho app đang chạy shell;
  không có quyền thì osascript **im lặng không làm gì** (không báo lỗi), clipboard giữ nguyên.
- Lưới chặn / đường thay thế đã verify thật: đọc REST bằng **extension Claude in Chrome** —
  `navigate` tới URL `/_api/...` **trong MCP tab group** rồi `get_page_text` → trả nguyên văn XML
  feed, đọc được `Name`, `Length`, `TimeLastModified`. Không cần clipboard, không cần bàn phím,
  không chiếm màn hình user. ⚠ Tab do `open -a` mở KHÔNG thuộc MCP group nên extension không thấy
  — phải `navigate` bằng chính extension.
- Cách phân biệt "REST bị chặn" vs "mình không đọc được": chặn thì body có
  `UnauthorizedAccessException`/`accessDenied`; không đọc được thì **không có body nào cả**.
  Chưa thấy body thì chưa được kết luận là hết quyền.
- Nguồn: GW-556 · 2026-08-03

## zsh-khong-word-split-bien-unquoted

- Bắt được: `for pair in "a.png b.png" ...; do for f in $pair` → zsh truyền **cả chuỗi** làm 1 tên
  file, dựng URL sai, 6/8 file tải trắng. Log in ra 2 tên trên cùng 1 dòng chính là dấu vết.
- Nguyên nhân: zsh (khác bash) KHÔNG word-split parameter expansion không nháy theo mặc định.
- Lưới chặn: lặp phẳng danh sách (`for f in a.png b.png c.png`) + đếm nhịp bằng biến; hoặc `${=var}`
  nếu buộc phải gom. Và luôn **đối chiếu số file tải xong với listing** — đừng tin vòng lặp đã chạy đủ.
- Nguồn: GW-556 · 2026-08-03

## ticket-bien-mat-khoi-jql-khong-co-nghia-la-done

- Bắt được: GW-654 rớt khỏi `assignee = currentUser() AND statusCategory != Done`. Luật cũ của
  `/daily` là "key biến mất → phase closed" ⇒ sẽ ghi sai thành đã xong, mất luôn dấu 4 việc còn mở.
  Thực tế: status vẫn `To Do`, `resolutiondate: null`, chỉ **đổi assignee** sang người khác.
- Nguyên nhân: JQL lọc theo assignee nên mọi thay đổi người phụ trách đều biểu hiện y như đóng ticket.
- Lưới chặn: key biến mất khỏi query → **luôn `getJiraIssue` xác nhận** trước khi kết luận. Phân biệt
  3 ca: Done thật (statusCategory=done) · `reassigned` (đổi assignee) · rời sprint/đổi project.
  Ca `reassigned` phải sinh việc **bàn giao**: code thì push là thấy, nhưng câu hỏi chưa gửi / mốc chưa
  chốt / việc dở nằm ngoài repo thì phải chuyển miệng.
- Nguồn: GW-654 · 2026-08-03

## browserpilot-luu-screenshot-o-goc-vng-khong-phai-cwd

- Bắt được: `screenshot` trả `.browserpilot/shots/<name>.png` (đường dẫn TƯƠNG ĐỐI) nhưng file thật
  nằm ở **`/Users/lap17727/VNG/.browserpilot/shots/`** — gốc workspace, KHÔNG phải cwd của agent.
  `Read` theo path trả về → "File does not exist".
- Đã trả giá 2 lần cùng ngày: lane MB của GW-556 chụp được full-page nhưng không đọc được ảnh nên
  **mất hẳn khả năng so pixel runtime** → verdict của lane đó tụt xuống "chỉ so code tĩnh + tên file",
  và đó chính là nguyên nhân nó kết luận "6/8 vùng ~100% khớp" trong khi lane PC (đo được) kết luận
  phải re-skin gần hết. Sai lệch ước lượng: 1.5 ngày vs 4.5 ngày.
- Lưới chặn: sau `screenshot`, nếu `Read` fail thì **đừng bỏ cuộc** — path đúng gần như luôn là
  `<gốc workspace>/.browserpilot/shots/<name>.png`. Dò 1 lệnh:
  `ls -t /Users/lap17727/VNG/.browserpilot/shots/ | head` (hoặc
  `find ~/VNG -maxdepth 3 -type d -name .browserpilot`). Chi phí 1 tool-call, cứu cả lượt verify.
- Nguồn: GW-556 · 2026-08-03

## rest-files-khong-de-quy-tai-sot-ma-verify-van-pass

- Bắt được: GW-556 ghi `design.status = đã-giao-đã-tải` với 8 file / 30.9MB, trong khi nguồn có
  **56 file / 2.42GB** (đo lại 3/8 bằng quét đệ quy). Tải đúng **1.28% byte** mà mọi khâu đều báo OK.
- Nguyên nhân xếp chồng 5 tầng, tầng nào một mình cũng chưa đủ gây ra:
  1. REST `/Files` **chỉ trả 1 cấp**. Folder design luôn có subfolder (VN/EN/TH/Fonts/PSD) ⇒ gọi ở
     gốc ra rỗng. SKILL.md chỉ ghi "thêm `/Folders` để **biết có** subfolder", không ghi "lặp vào".
  2. **Verify tương đối**: tiêu chí là "tổng byte khớp listing" — nhưng listing đó là của tập MÌNH
     ĐÃ CHỌN tải. Tự chọn 8 file rồi tự verify 8 file ⇒ luôn PASS. Không có tiêu chí tuyệt đối.
  3. **Schema trạng thái không biểu diễn được "một phần"** (chỉ có chưa-có-link / đã-giao-chưa-tải /
     đã-giao-đã-tải) ⇒ buộc làm tròn LÊN thành "đã tải".
  4. **Luật skip idempotent** dùng điều kiện "folder còn file thật" ⇒ 8/56 cũng thoả ⇒ mọi lần
     `/daily` sau đều skip. Miss thành **vĩnh viễn và im lặng**.
  5. `design.manifest` ghi **tập đã tải** thay vì **cây nguồn** ⇒ lần sau so manifest↔nguồn cũng
     không lộ ra 48 file chưa từng tải.
- 🔑 Lỗi này **đã xảy ra 31/7 ở GW-477** (sót 48 PNG state trong subfolder) và bài học được ghi
  vào `state.issues['GW-477'].design.secondPass` — **một chỗ không ai đọc lại**. 3 ngày sau tái
  phạm nguyên xi. ⇒ Bài học loại "lưới chặn" mà chỉ nằm trong state của 1 ticket thì coi như
  chưa ghi: phải nâng lên `SKILL.md` (đổi quy trình) hoặc thành script chạy được.
- Lưới chặn (đã dựng 3/8, `~/.claude/skills/daily/scripts/`):
  `sp-scan.js` quét đệ quy → manifest cây nguồn tự tải về Downloads ·
  `sp-coverage.mjs` so kho local ↔ manifest, **exit 1 nếu thiếu** (đây mới là định nghĩa "đủ") ·
  `sp-fetch.js` phát lệnh tải hàng loạt · `sp-collect.mjs` nhặt + verify magic bytes.
  Quy tắc: **chỉ được nói "đã tải xong" khi `sp-coverage.mjs` exit 0.**
- Nguồn: GW-556 (tái phạm của GW-477) · 2026-08-03

## javascript-tool-co-tran-cung-45s

- Bắt được: phát 26 lệnh tải trong 1 lần `javascript_tool` (9 lô, sleep 2.5s) → CDP giết script ở
  45s: "Runtime.evaluate timed out". 24 file đầu về, **2 file cuối mất im lặng** — script không
  báo lỗi gì về phía đã chạy, chỉ có tool trả error.
- Nguyên nhân: `Runtime.evaluate` của CDP timeout cứng 45.000ms, không nới được từ phía script.
- Lưới chặn: mỗi lần gọi `javascript_tool` giữ tổng thời gian < 30s (≤12 file với BATCH 3 / GAP 2.5s);
  chia lô ở phía LOCAL. `sp-fetch.js` tự `throw` khi TODO vượt `MAX_PER_CALL`. Và luôn đối chiếu
  `sp-coverage.mjs` sau mỗi lô — đừng tin số lệnh đã phát.
- ⚠ Hệ quả kèm theo: timeout **KHÔNG huỷ** các lệnh đã phát — download vẫn chạy nền. Phát lại
  ngay mà không kiểm `~/Downloads` thì tải trùng (đã tạo 2 bản `VN_Sariel_PC.psd` chạy song song,
  1 bản stall). Sau mỗi timeout: chờ ~10s → `ls ~/Downloads/*.crdownload` → chỉ phát lại phần
  `sp-coverage --todo` còn báo thiếu.
- Nguồn: GW-556 · 2026-08-03

## browser-tu-ghi-file-xuong-dia-de-vuot-gioi-han-output-tool

- Bắt được: cần listing 56 file từ REST, nhưng output `javascript_tool` bị cắt ở ~1KB (2 lần thử,
  cả dạng JSON lẫn TSV rút gọn).
- Cách vượt: đừng trả dữ liệu qua context — cho trang **tự tải xuống**:
  `a.href = URL.createObjectURL(new Blob([JSON.stringify(data)])); a.download = "x.json"; a.click()`
  → file về `~/Downloads`, phía local đọc bằng `fs`. Tool chỉ trả 1 dòng tóm tắt.
- Áp dụng được cho mọi ca "trang biết dữ liệu lớn mà mình cần ở local": listing, bảng, log, export.
- Nguồn: GW-556 · 2026-08-03

## gate-font-undeclared-2026-08-03
- Bắt được: 1 ERROR (font-undeclared) trên dist — font-family "Barlow" dùng 1 chỗ nhưng KHÔNG có @font-face nào khai (browser sẽ fallback im lặng)
- Nguyên nhân: (điền — vì sao lọt tới đây)
- Lưới chặn: fe-gate check font-undeclared (đã bắt được, giữ nguyên trong luồng code-developer)
- Nguồn: 2026-birthday-sariel · 2026-08-03

## gate-font-undeclared-2026-08-04
- Bắt được: 1 ERROR (font-undeclared) trên dist — font-family "PSL034PRO" dùng 2 chỗ nhưng KHÔNG có @font-face nào khai (browser sẽ fallback im lặng)
- Nguyên nhân: (điền — vì sao lọt tới đây)
- Lưới chặn: fe-gate check font-undeclared (đã bắt được, giữ nguyên trong luồng code-developer)
- Nguồn: 2026-vo-lam-tinh-tu-subweb · 2026-08-04

## ticket-dong-o-moc-html-van-con-moc-test-release-phia-sau

- Bắt được: **GW-610** `[496][GNOTH] Chengdu Tournament` bị Jira đóng (`COMPLETED`) từ **29/7** —
  đúng mốc HTML — trong khi mốc **link test 7/8** và **GS release 20/8** còn ở phía trước. JQL
  chính `statusCategory != Done` không thấy nó, nên **8 ngày code (28/7 → 5/8 18:12) nằm ngoài
  radar**: board 6/8 chỉ ghi được "folder có commit nhưng không gắn ticket nào".
- Nguyên nhân: PM đóng ticket ngay khi FE giao HTML, coi phần test/release là việc của QC/GS.
  Radar lại lấy "chưa Done" làm định nghĩa "việc còn của mình" ⇒ hai định nghĩa lệch nhau.
- Lưới chặn: quét **2 JQL**, không phải 1 —
  `config.jql` (việc chưa Done) **+** `config.jqlRecentDone`
  (`assignee = currentUser() AND statusCategory = Done AND updated >= -45d`). Ticket ở nhánh
  Done chỉ được rơi khỏi radar khi **mốc muộn nhất trong `milestones` đã qua**; còn mốc
  test/release chưa tới thì giữ phase thật (`wait-test`/`bugfix`), KHÔNG ghi `closed`.
  `closed` = việc của mình hết thật, không phải = Jira đóng.
- Dấu hiệu nhận ra sớm: có sub-task `[QC-Test]` đang In Progress (GW-642), hoặc description còn
  dòng mốc lớn hơn `duedate` (ở đây `duedate` 29/7 < HTML 30/7 < test 7/8 < release 20/8).
- Nguồn: GW-610 · 2026-08-06

## console-doc-thang-months-json-khong-suy-tu-state

- Bắt được: 6/8 GW-556 đóng lúc 12:48, `/daily delta` cập nhật `state.json` + board đầy đủ, nhưng
  tab **"Theo tháng"** của console vẫn vẽ `○ GW-556 08/05` (đang làm) — user chụp màn hình chỉ ra.
- Nguyên nhân: tab đó đọc **thẳng `history/months.json`**, KHÔNG suy từ `state.json`. File còn là
  snapshot `generatedAt: 2026-08-03`. Hệ quả kép: sai trạng thái (GW-556 ○ thay vì ✓), **thiếu hẳn
  ticket** (GW-713 không có dòng nào), và **mốc cũ** (GW-477 ghi 8/7 trong khi duedate đã dời 8/10).
- Lưới chặn: mọi mode có quét Jira — kể cả `delta` — phải refresh `months.json` khi
  `generatedAt` ≠ hôm nay (1 query, ghi đè, backup `.backups/months/`). Đã ghi vào `SKILL.md`
  mục mode `delta` bước (4) và `references/jql.md`.
- Luật rút ra: **cập nhật `state.json` KHÔNG tự lan sang các file console đọc riêng.** Trước khi
  nói "đã cập nhật xong", liệt kê đủ file console đọc: `state.json` · board hôm nay ·
  `history/issues.jsonl` · `history/phases.jsonl` · `history/months.json`.
- Nguồn: GW-556 / GW-713 / GW-477 · 2026-08-06

## gate-asset-missing-2026-08-10
- Bắt được: 2 ERROR (asset-missing) trên dist — ref không tồn tại: assets/cfl-ms-25-gallery/images/banner-1.jpg
- Nguyên nhân: PRE-EXISTING, không do task alarm-clock. `index-en.html.twig` và `index-th.html.twig`
  ref `banner-1.jpg` 12 lần mỗi file NGAY TRONG BẢN GIT HEAD (kiểm bằng `git show HEAD:<file> | grep -c`),
  trong khi file thật trên đĩa là `banner-1.webp`; riêng `index.html.twig` (VN) đã sửa đúng nên 0 ref.
  Đây là hệ quả của việc `index-en`/`index-th` là file PHẲNG chép tay — sửa bản VN mà quên chép sang
  2 bản kia. **Chỉ lộ ở bản build-dev**: build-pro chuyển ảnh sang webp nên ref .jpg biến mất, fe-gate
  trên dist pro PASS 0 ERROR ⇒ chạy gate trên bản dev bắt được lỗi mà bản pro giấu.
- Lưới chặn: fe-gate check asset-missing (đã bắt được, giữ nguyên trong luồng code-developer).
  Bổ sung: chạy fe-gate trên **cả bản dev lẫn bản pro** khi repo có 2 lệnh build — mỗi bản giấu một loại lỗi.
- Nguồn: 2026-mainsite · 2026-08-10

## cold-build-xoa-dist-duoc-git-track-2026-08-10
- Bắt được: cold build của design-checker (`rm -rf dist && npm run build-dev`) đã XOÁ ~180 file thật
  được git track: toàn bộ `dist/optimized/**` (13 folder ảnh đã tối ưu) + `dist/fonts/*.ttf` (5 font)
  + `dist/mainsite.js.LICENSE.txt`. Không lệnh nào báo lỗi — build vẫn exit 0, checker vẫn PASS,
  console vẫn sạch. Chỉ lộ khi manager chạy `git status` lúc truy nguyên ERROR của fe-gate.
- Nguyên nhân: repo cdn-source **track cả `dist/`**, và `dist/optimized/` + `dist/fonts/` là artifact
  CHỈ do `build-pro` (`webpack.config.optimize.js`) sinh ra. `build-dev` không sinh chúng, lại còn dùng
  `CleanWebpackPlugin` nên **mỗi lần build-dev đều xoá sạch dist** — kể cả không cold build. Nghĩa là
  bất kỳ ai chạy `npm run build-dev` rồi commit là commit luôn một dist khuyết ~180 file.
- Lưới chặn: sau MỌI lượt verify có build-dev, trước khi bàn giao/commit phải (1) `git status <campaign>/dist`
  đếm dòng ` D` — khác 0 là dist đang khuyết; (2) chạy `npm run build-pro` để dist về đúng dạng git track;
  (3) chỉ khi đó mới chạy fe-gate lần cuối. `git checkout -- <campaign>/dist/` khôi phục được vì file
  còn trong git, nhưng khôi phục xong thì mất output mới ⇒ luôn kết bằng build-pro, không kết bằng checkout.
- Nguồn: 2026-mainsite (GW-627 alarm-clock) · 2026-08-10

## gate-font-file-missing-2026-08-10
- Bắt được: 2 ERROR (font-file-missing) trên dist — @font-face "CormorantGaramondBold" trỏ file không tồn tại: fonts/CormorantGaramond-Bold.ttf
- Nguyên nhân: (điền — vì sao lọt tới đây)
- Lưới chặn: fe-gate check font-file-missing (đã bắt được, giữ nguyên trong luồng code-developer)
- Nguồn: 2026-mainsite · 2026-08-10

## build-lai-dist-lam-doi-185-file-cua-trang-da-release-2026-08-10
- Bắt được: chạy `npm run build-pro` trên campaign đã release ⇒ `git diff` ra **185 file dist thay đổi**
  dù task chỉ thêm 1 popup. Trong đó 183 file là ảnh trong `dist/optimized/` bị nén lại ra bytes khác,
  và 2 file `.webp` (`bg-nav.webp`, `info-4.webp`) **bị xoá** vì lần này plugin chọn `.png` nhỏ hơn —
  kéo theo 5 trang HTML đổi ref `.webp` → `.png`. Push nguyên trạng = đụng vào trang đang chạy production.
- Nguyên nhân: plugin optimize ảnh KHÔNG tất định giữa các lần chạy (khác phiên bản encoder ⇒ khác kích
  thước ⇒ khác lựa chọn định dạng). `dist/` lại được git track, nên mọi dao động của plugin đều thành
  diff thật. Không có lệnh nào báo lỗi: build exit 0, fe-gate PASS, browser chạy đúng.
- Lưới chặn (đã dùng, hiệu quả 185 → 9 file): sau build trên campaign ĐÃ RELEASE, KHÔNG commit cả `dist/`.
  Làm: (1) backup ra ngoài repo những file dist THUỘC task (3 trang có markup mới + `mainsite.css/js`
  + `mainsite-sprite.css` + thư mục asset mới); (2) `git checkout -- dist/ && git clean -fdq dist/`
  đưa dist về đúng bản release; (3) chép ngược phần backup vào; (4) `grep` ref ảnh trong các trang vừa
  chép — nếu trỏ định dạng mới (`.png`) mà bản release là `.webp` thì `sed` về `.webp` cho khớp file thật;
  (5) `git status dist/ | grep "^ D"` phải RỖNG; (6) fe-gate lại lần cuối.
  ⚠ `git clean -fdq dist/` xoá cả file untracked HỢP LỆ (ca này: 2 font `.ttf` mà popup thật sự dùng) —
  sau khi clean phải chạy fe-gate và chép tay lại thứ nó báo thiếu.
- Nguồn: 2026-mainsite (GW-627) · 2026-08-10 · user cảnh báo "đừng change các file cũ, ảnh hưởng trang đã release"

## cdn-co-hai-goc-duong-dan-music-khong-qua-dist-2026-08-10
- Bắt được: gắn audio popup vào template mainsite bằng URL
  `cdn-mainsite-aka/products/lan/2026-mainsite/**dist/music**/alarm-*.mp3` — SAI. Đường thật là
  `.../2026-mainsite/**music**/alarm-*.mp3`, không đi qua `dist/`. User phát hiện trước khi deploy.
- Nguyên nhân: repo cdn-source có file mp3 ở CẢ HAI nơi — `music/` (nguồn) và `dist/music/` (do
  CopyPlugin sinh cho bản standalone dùng đường tương đối). Nhìn đĩa local thì cả hai đều "có thật"
  nên không lộ ra cái nào mới là cái CDN phục vụ. Suy từ pattern các asset khác (`dist/optimized/...`)
  càng dẫn tới kết luận sai vì asset build thì ĐÚNG là qua `dist/`.
- Lưới chặn: **URL CDN phải đối chiếu với một URL CÙNG LOẠI đang chạy thật trên trang**, không suy từ
  cây thư mục local. Ở đây `homepage.html.twig` đã có sẵn `music/music-lan.mp3` (nhạc nền) — chỉ cần
  grep đúng loại tài nguyên là ra. Rẻ hơn nữa: `page.request.fetch(url, {method:'HEAD'})` từng URL
  trước khi commit; file cũ phải 200, file mới 404 (chưa push) — 200 ở đường sai là bằng chứng ngược.
- Nguồn: GW-627 · new-mainsite · 2026-08-10

## promotion-haschannel-false-chi-dung-tai-thoi-diem-check-2026-08-10
- Bắt được: GW-477 mang `promotion.hasChannel:false` từ 31/7 ("landing thuần, không phase deliver",
  bằng chứng `ls gt-promotion/*/ | grep -- "-52017/"` trắng). 10/8 13:40 chính user tạo folder
  `A49-CFL/offlinetournament-52017/{huong-dan.md,mainsite/*.html}` và giao HTML — task CÓ kênh
  promotion, đi qua đúng phase `deliver`. Nếu tin cache cũ thì skill sẽ báo sai "task này không có
  khâu giao HTML" ngay lúc khâu đó vừa xảy ra.
- Nguyên nhân: `hasChannel` được ghi như một thuộc tính CỐ ĐỊNH của ticket, trong khi nó chỉ là kết
  quả `ls` tại một thời điểm. Folder promotion do người tạo về sau (FE hoặc BE), thường ngay sát mốc
  HTML — tức đúng lúc nhận định cũ đã nằm im trong state cả tuần.
- Lưới chặn: (1) `hasChannel:false` BẮT BUỘC kèm `checkedAt`, đọc ra phải hiểu là "chưa có LÚC ĐÓ",
  không phải "không bao giờ có"; (2) bước git-log gt-promotion của mọi lượt `delta` đã đủ để bắt —
  điều kiện là khi thấy commit chứa `-<nexusId>/` của ticket đang theo dõi thì phải LẬT NGƯỢC
  `hasChannel` + ghi `promoFolder` + append `paths`, chứ không chỉ báo "📦 promotion vừa cập nhật";
  (3) giữ lại `promotion.prevCheck` để lần sau đọc state biết nhận định đã bị đảo, không đảo qua lại.
- Nguồn: GW-477 · delta 2026-08-10 14:17

## scalewidthmb-la-be-rong-san-khau-mobile-khong-phai-canvas-design-2026-08-11
- Bắt được: GW-525 (LAN Trung Thu). Design canvas dọc **750**px, khung clone `2026-pre-register` để
  `scaleWidthMB: 768`. Manager suy "750 là canvas nên đổi 768→750" và đưa vào ràng buộc CỨNG cho dev.
  Kết quả: ở cửa sổ **768×1024 thật** (innerWidth 760), `#MS__wrapper` nhận `width: 2000px` — tức
  libraryMainsite rơi vào **nhánh PC** — và frame bị đẩy `left: 633px` = `(2000−750)/2 × 1.0133`,
  nội dung nằm ngoài màn hình. Mobile VỠ hoàn toàn.
- Nguyên nhân: `scaleWidthMB` trong `config.js` **không phải chiều rộng canvas design**; lib dùng nó
  làm **chiều rộng SÂN KHẤU mobile kiêm mốc chọn nhánh PC/MB**. Đặt 750 < innerWidth 760 ⇒ viewport
  rơi ra ngoài nhánh mobile ⇒ lib dùng `scaleWidthPC`. Không có gì báo lỗi: `build-dev` exit 0,
  `fe-gate` 0 ERROR, console sạch, `document.scrollWidth == innerWidth` nên **không có tràn ngang**
  để nhìn thấy — chỉ là nhìn sai phần sân khấu.
- Lưới chặn: canvas design lệch 768 thì **GIỮ `scaleWidthMB: 768`** và tôn trọng canvas bằng
  `section { max-width: <canvas>px; margin: auto }` trong `assets/main/main.scss`
  (ca này: 750 → ra 742px ở viewport 760, đúng tỉ lệ). Kiểm bằng 1 dòng JS trong browser THẬT:
  `getComputedStyle(document.getElementById('MS__wrapper')).width` — phải ra **768px** ở mobile;
  ra `2000px` (= `scaleWidthPC`) là đã rơi nhánh PC. Đo `getBoundingClientRect().left` của frame
  đang active: lệch ~`(scaleWidthPC − canvas)/2` là đúng triệu chứng này.
  ⚠ **Headless `set_viewport` KHÔNG tái hiện đủ tin** (lib đọc `window.outerWidth`) — dev báo là
  "artefact headless" và không sửa theo triệu chứng (đúng), nhưng cửa sổ THẬT cho thấy lỗi là THẬT.
  ⇒ Kết luận PC/MB của lib phải kiểm bằng cửa sổ browser thật, không phải viewport headless.
- Nguồn: GW-525 · 2026-08-11 · manager tự gây ra rồi tự bắt bằng đo cửa sổ thật

## 2026-08-13 · GW-720 · Clone landing: đuôi file dist/optimized là quyết định RUNTIME, không kế thừa được
- **Bắt được gì**: clone campaign + thay assets → build-optimize ra 70 file `.png` ở đúng chỗ campaign cũ ra `.webp` (plugin chọn format nhẹ hơn TỪNG BỘ theo ảnh thật) ⇒ HTML giao hàng kế thừa từ campaign cũ trỏ 404 hàng loạt. Vá HTML theo output mới cũng KHÔNG đủ: CSS/JS trong dist cũng bị plugin rewrite ref (browser bắt được sprite/bg-bar 404 sau khi HTML đã "sạch").
- **Nguyên nhân**: đuôi file optimized phụ thuộc nội dung ảnh lúc build; mọi file text trong dist (html+css+js) đều nhúng ref theo quyết định đó.
- **Lưới chặn**: (1) task clone+reskin muốn HTML giao hàng zero-edit → đồng bộ TÊN OUTPUT theo campaign cũ bằng script chạy sau build-optimize (mẫu: `products/taydu2/landing/2026-tieu-bach-thu/sync-optimized-names.mjs` — encode sharp đúng quality plugin, vá ref html+css+js, idempotent); (2) verify bằng 3 bất biến: tên optimized khớp gốc (diff listing) · tập ref optimized/ trong css/js/html khớp gốc · mọi ref → file thật; (3) LUÔN verify browser sau thay đổi asset — grep ref tĩnh không thấy CSS 404.
- **Nguồn**: GW-720 13/8, user chốt "đồng bộ tên hết với folder cũ tránh bị edit nhiều vào html".

## 2026-08-13 · Radar nền · Giả định chưa đo mà thành LUẬT CẤM trong skill
- **Bắt được gì**: `skills/daily/SKILL.md` và `console/src/core/constants.mjs` cùng cấm chạy radar bằng cron/launchd, lý do ghi là "connector Jira/SharePoint auth theo phiên tương tác nên phiên nền không có token → quét ra trắng". Không ai từng đo. Hệ quả: nhiều tuần radar chỉ sống được khi user mở console → mở tab → bấm 2 nút, và chết theo tab.
- **Nguyên nhân**: câu cấm được viết như kết luận nhưng thực chất là phỏng đoán; nằm trong skill nên mọi phiên sau (kể cả AI) đọc và tin, không ai kiểm lại.
- **Đo bác bỏ mất 64 giây**: `claude -p "…searchJiraIssuesUsingJql…"` → OK GW-720 (16.6s); `claude -p "/daily status"` → ra báo cáo đầy đủ (47s). Sau khi dựng thật: launchd chạy `/daily delta` trọn vẹn, `git pull` gt-promotion "Already up to date" (11:54 board 13/8).
- **Lưới chặn**: (1) trước khi viết "KHÔNG được X" vào skill, phải kèm lệnh đã chạy + output, hoặc ghi rõ "chưa đo, nghi ngờ" — cấm mà không có bằng chứng thì lần sau chính mình đọc lại và tin; (2) ca này còn lộ bẫy env: launchd `zsh -lc` KHÔNG nạp `.zshrc` nên không thấy nvm — nhặt `/opt/homebrew/bin/node` 25.6.0 vỡ dylib và chết ở dyld (`OS_REASON_DYLD`, sổ trắng trơn). `node` và `claude` đều nằm dưới `~/.nvm` ⇒ plist phải tự `. "$NVM_DIR/nvm.sh"`.
- **Nguồn**: dựng radar nền 13/8 — `docs/specs/2026-08-13-radar-auto-design.md`, `tools/radar-tick.mjs`.

## 2026-08-13 · GW-525 · gt-promotion-template sống ở nhánh `develop` — so `origin/master` là báo oan "chưa push"
- **Bắt được gì**: kiểm "HTML giao hàng đã push chưa" bằng `git merge-base --is-ancestor <sha> origin/master` trong `gt-promotion-template` → trả FALSE ⇒ suýt báo user "commit chưa push". Thực tế repo đó checkout `develop` và commit ĐÃ ở `origin/develop`; `origin/master` là nhánh cũ nên `rev-list --count origin/master...HEAD` ra **ahead 596** (số vô nghĩa, đủ để nhận ra so sai gốc).
- **Nguyên nhân**: nếp verify push hình thành từ `cdn-source` (nhánh `master`) rồi bị mang nguyên sang repo khác nhánh mặc định.
- **Lưới chặn**: verify push luôn so với **upstream của nhánh đang checkout**, không hard-code tên nhánh: `git rev-list --left-right --count @{u}...HEAD` (hoặc `git branch --show-current` trước rồi mới so `origin/<branch>`). Dấu hiệu so sai gốc: ahead/behind ra số hàng trăm.
- **Nguồn**: /daily delta lượt 9 ngày 13/8 — GW-525 giao HTML `LAN/h5trungthu-53730` (`3a11f17b`, `a9cc99be`).

## 2026-08-13 · Radar `delta` chỉ soi 1 repo (gt-promotion) — mù đúng chỗ mình gõ code
- **Bắt được gì**: delta lượt 10 (21:08) báo "không có gì mới cho task của mình", nhưng 18:02 cùng ngày có commit `7f229442e` trên **new-mainsite** (`templates/boomzth/layout/article-clean-black.html.twig`, +49 dòng, đã push nhánh `dev`). Chỉ lộ ra ở lượt 22:5x vì tôi soi thêm `git log --since` cho cdn-source + new-mainsite ngoài kịch bản.
- **Nguyên nhân**: bước (2) của mode `delta` chỉ định nghĩa cho `gt-promotion-template` (repo bàn giao FE↔BE). Nhưng code FE thật nằm ở `cdn-source` (landing) và `new-mainsite` (mainsite) — chính hai repo KHÔNG được quét. Radar theo dõi được động tĩnh của người khác mà mù động tĩnh của chính mình.
- **Lưới chặn**: thêm bước (2b) vào `skills/daily/SKILL.md` — delta phải `git log --since` (KHÔNG pull, khỏi chậm) cho MỌI repo trong `config.repos`, không hard-code 1 repo. Chi phí ~1 lệnh/repo, vẫn dưới trần <1 phút của mode nhẹ.
- **Nguồn**: /daily delta lượt 11 ngày 13/8 22:52.
