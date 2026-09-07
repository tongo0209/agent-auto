# Bài học

Mỗi bài học 1 block. Nguồn ghi: `fe-gate` fail tự append block nháp · `/daily wrap` · gõ tay.
`code-developer` đọc file này TRƯỚC khi giao dev.

**Giữ file gọn** (file được nạp trước mỗi lần giao việc nên mỗi dòng thừa tốn context thật):
- Bài học cũ hơn 3 tháng mà đã thành luật có mã (`rules/*.md`) hoặc hook (`hooks/*.sh`) → rút còn
  1 dòng trỏ mã luật, bỏ phần kể lại câu chuyện.
- Block nháp `fe-gate` append mà "Nguyên nhân" vẫn để trống sau 1 tuần → xoá; số đo đáng giữ thì
  gộp 1 dòng vào block cùng chủ đề. KHÔNG xoá số đo có ngày tháng — chỉ xoá phần diễn giải lặp.

## metrics-phu-thuoc-buoc-go-tay-thi-khong-bao-gio-co-du-lieu

- Bắt được: sau 3 ngày chạy `/daily`, `knowledge/metrics.jsonl` 0 dòng và `history/issues.jsonl`
  không tồn tại. Dashboard vẫn hiện "metrics: 0 bản ghi" mà không ai coi đó là lỗi.
- Nguyên nhân: cả hai file chỉ được ghi bởi `/daily wrap` — một mode phải gõ tay, cuối ngày, đúng
  lúc dễ bỏ nhất. Vòng học phụ thuộc ý chí thì không chạy.
- Lưới chặn: console tự ghi `history/phases.jsonl` mỗi lần phase đổi (quan sát khi poll state) và
  `metrics.jsonl` 1 dòng/ngày/ticket đo TỪ GIT. `wrap` chỉ còn thêm nhận xét chủ quan.
- Nguồn: agent-auto · 2026-08-01

## thu-vang-mat-can-so-danh-sach-khong-phai-nhin-anh

- Bắt được: GW-654 dựng bằng cách clone `2026-affiliate-2`; khung chỉ mang 2 font của đợt trước,
  thiếu 8 font design mới — gồm `PlusJakartaSans-SemiBold`, font nhiều nhất toàn trang (373 run).
  3 lớp kiểm tra (build · console browser · 2 lượt design-checker qua ảnh) đều trượt: ảnh chụp và mắt
  người không phân biệt được font fallback gần giống.
- Nguyên nhân: CSS trỏ tới font không tồn tại vẫn là CSS HỢP LỆ → build 0 error, console sạch,
  browser fallback im lặng. Mọi lớp kiểm trên đều hỏi "cái đang có có đúng không", không lớp nào
  hỏi "cái PHẢI CÓ có mặt không" — lỗi loại THIẾU-VẮNG thì không có gì "sai" để nhìn thấy.
- Lưới chặn: với mỗi loại tài nguyên (font, ảnh, sprite), luôn có 1 check dạng
  *tập khai báo* − *tập file thật* = ∅. Rẻ, tất định, chạy < 1s. Đã dựng: `tools/fe-gate.mjs`
  check `font-file-missing` + `font-undeclared` + `design-font-unused`, bắt buộc chạy trước khi
  báo xong FE.
- Gate đó về sau bắt lại đúng loại lỗi này 3 lần trên dist thật: `font-undeclared` "Barlow"
  (2026-birthday-sariel · 3/8) · `font-undeclared` "PSL034PRO" (2026-vo-lam-tinh-tu-subweb · 4/8) ·
  `font-file-missing` `CormorantGaramond-Bold.ttf` (2026-mainsite · 10/8).
- Nguồn: GW-654 · 2026-08-01

## sp-rest-clipboard-chet-doc-rest-bang-extension-thay-the

- Bắt được: `scripts/sp-rest.sh` (script đã xoá 18/8/2026 — giữ bài học, đừng đi tìm file; đường clipboard: `open -a Edge` → System Events `Cmd+A`/`Cmd+C`
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
- Lưới chặn (đã dựng 3/8, `skills/daily/scripts/`):
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

## Chữ lồng chữ: text vừa bake trong ảnh vừa render HTML (17/8/2026, GW-760)

**Bắt được gì:** dòng subtitle "Hoàn thành tân thủ và khảo sát trên server test" hiện HAI lớp
chồng nhau trên landing TF v2 — một lớp nằm sẵn trong `textmain*.png`, một lớp render ở
`.header__sub`. Cả 4 ngôn ngữ. Build PASS, console sạch, design-checker vòng CHỐT cũng PASS;
chỉ user nhìn màn hình mới thấy (trông như chữ nhoè / có bóng đổ vì 2 lớp lệch vài px).

**Nguyên nhân:** hai nguồn sự thật không ai đối chiếu — job cắt ảnh gom layer chữ đó vào ảnh,
trong khi spec lại liệt kê chính chuỗi đó ở mục "toạ độ phần tử render bằng HTML". Dev làm đúng
cả hai. Đây là lỗi của người viết spec, không phải của dev.

**Lưới chặn:** `agent-auto/tools/baked-text-guard.py` — đọc CHÍNH file job đã đưa cho
`psd-export.py` (nên danh sách "đã bake" luôn khớp ảnh thật, không khai lại tay), gom mọi layer
`type` trong subtree các path `show`, rồi so với từng text node trong `dist/*.html`.

```bash
python3 ~/VNG/agent-auto/tools/baked-text-guard.py \
  --job /tmp/<job-pc>.json --job /tmp/<job-mb>.json \
  --dist <path>/dist
```

Chỉ báo khi chuỗi bake chiếm ≥60% một text node (nên "NHẬN THƯỞNG" bake không bị báo nhầm chỉ
vì note có cụm "để được nhận thưởng"), và bỏ qua chuỗi < 12 ký tự. Exit 1 khi có trùng.

**Quy tắc phân tầng để không tái phạm:** mỗi chuỗi chỉ được tồn tại ở ĐÚNG MỘT tầng.
- Bake trong ảnh: chữ nghệ thuật — có gradient/stroke/glow, font riêng của designer, nằm trong
  cụm đồ hoạ (tiêu đề, badge, dải bước, và mọi dòng nằm CÙNG cụm đó).
- Render HTML: chữ vận hành, đổi theo ngày/thị trường — timeline, điều kiện, menu, nav.
Khi cắt ảnh mà gom cả một cụm, thì MỌI dòng chữ trong cụm đó thuộc tầng ảnh — đừng tách lẻ một
dòng ra HTML "cho dễ sửa", đó chính là lúc sinh ra lồng chữ.

## Kiểm "chữ có tràn khung" là CHƯA ĐỦ — phải kiểm khung có VA vào phần tử bên cạnh (17/8/2026, GW-760)

**Bắt được gì:** nút "Thể lệ & Phần thưởng" bản ID mobile. Manager đo `chuRong 149 < khungRong 205`
rồi kết luận "không tràn, đạt"; design-checker cũng PASS. User chụp màn hình: **viền pill cắt
ngang icon social đầu tiên**. Đo lại bằng bbox: nút `545,92→750,135`, icon `707,132→750,175` ⇒
chồng 3px. Nguyên nhân: CSS đặt `top 92, height 43` trong khi PSD (`btn thể lệ/BG`) là
`top 82, height 46` — sai 10px, đáy nút tụt từ 128 xuống 135.

**Vì sao lọt:** cả người lẫn agent chỉ kiểm quan hệ *chữ ↔ khung chứa nó*, không ai kiểm quan hệ
*khung ↔ hàng xóm*. Phép đo "chữ có vừa khung không" luôn PASS dù khung nằm sai chỗ.

**Lưới chặn:** khi verify một phần tử có toạ độ tuyệt đối, ngoài "chữ vừa khung" phải thêm phép
kiểm giao nhau với các phần tử lân cận:
```js
const a = el.getBoundingClientRect(), b = neighbor.getBoundingClientRect();
const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
```
Và luôn lấy `left/top/width/height` từ **bbox của layer BG trong PSD**, không phải bbox của layer
chữ — chữ nằm thụt vào trong khung nên hai số này khác nhau.

## Font phải bóc từ `StyleRun` của PSD, không suy từ v1 hay từ mắt (17/8/2026, GW-760)

**Bắt được gì:** dev đặt nút thể lệ `Barlow-Regular` và note `Roboto-Regular`. PSD ghi
**Oswald-Light** và **HarmonyOS Sans Medium**. Oswald là font condensed — thay bằng font thường
là chữ phình ngang, tràn viền pill trên mobile (user phát hiện). Cùng lỗi này còn làm khối note
bản ID wrap thừa 1 dòng và bị nút CTA đè.

**Cách lấy đúng:**
```python
runs = layer.engine_dict['StyleRun']['RunArray']; fonts = layer.resource_dict['FontSet']
sd = runs[0]['StyleSheet']['StyleSheetData']
fonts[sd['Font']]['Name'], sd['FontSize'], sd['Leading']
```
⚠ `FontSize` là **số thô chưa nhân transform của layer** — đừng chép thẳng vào CSS, phải căn cho
ink chữ trùng bbox design ±1px.

⚠ Font PSD đòi mà repo không có (ca này: Barlow-Medium) thì GIỮ bản gần nhất đang có và ghi rõ là
hạn chế — đừng lặng lẽ đổi sang font khác hẳn.

## `updateHeat()` không có ai gọi ở production — `heat`/`modifiedTime` là số chết (18/8/2026, bug-radar)

**Bắt được gì:** lượt `/daily bugwatch` 14:55 thấy 13/13 sheet trong `state.bugWatch` đứng
`heat: "warm"` dù sheet CFL vừa đổi 07:47 cùng ngày. `grep -rn updateHeat tools console skills`
chỉ ra **2 nơi**: định nghĩa trong `tools/bug-radar.mjs:233` và `bug-radar.test.mjs`. Không một
đường chạy thật nào gọi nó — `radar-tick.mjs` chỉ đóng dấu `lastPollAt`, CLI `scan`/`commit`
không chạm `modifiedTime`.

**Nguyên nhân:** hàm được viết + test đầy đủ (7 test xanh) nên trông như đang chạy. Test xanh
chứng minh hàm ĐÚNG, không chứng minh hàm ĐƯỢC GỌI. `heat` chết im lặng vì cửa `stale` vẫn kéo
được lượt bugwatch, nên không ai thấy thiếu.

**Hậu quả đang gánh:** `modifiedTime` phải do skill (LLM) ghi tay sau mỗi lượt poll — đúng kiểu
việc đã làm `heat` chết lần trước. Ghi sớm (trước khi fix) = lượt sau tưởng sheet không đổi, bỏ
luôn lượt đọc; ghi muộn = đọc lại sheet ~90s không cần thiết. Lượt 14:55 chọn ghi muộn (giữ
`modifiedTime` cũ) để không nuốt bug #5/#6.

**Lưới chặn:** test "hàm đúng" phải đi kèm test/assert "có đường gọi" cho mọi hàm trạng thái —
hoặc `state-doctor` thêm WARN khi mọi entry `bugWatch` cùng một `heat` mà `lastChangeAt` chênh
nhau > `coolAfterHours`. Cách bền hơn: cho `radar-tick.mjs` gọi `updateHeat(entry, modifiedTime)`
ngay tại chỗ nó đã đóng dấu `lastPollAt`, và bỏ hẳn việc skill ghi `modifiedTime`.

**Nguồn:** `/daily bugwatch` 18/8/2026 14:55 · `docs/specs/2026-08-18-bug-verify-console-design.md`

## Cờ `muted` của bug-radar bị đè mất — board ghi 1 chuyện, `state.json` giữ chuyện khác

**Bắt được gì:** lượt `/daily delta` 18/8/2026 15:34 thấy `state-doctor` báo **W8 = 4**, trong khi
board 12:09 cùng ngày ghi "W8: 5 → 2 sau khi tắt 3 sheet nguội". Đối chiếu 8 bản `.backups/state`:
mọi bản từ 13:43 trở đi đều có 3 sheet đó `muted: false` — mute **không dính**; ngược lại
`BugList Kiếm Hiệp Tình Mainsite` (sheet còn nóng, board ghi rõ *không* nên tắt) lại `muted: true`
từ ~14:48. Tức trạng thái thật đúng NGƯỢC với quyết định đã ghi.

**Nguyên nhân:** `isWatched()` và nhánh W8 trong `state-doctor.mjs` đều đúng (dòng 94 có
`isWatched(entry) &&`), nên lỗi ở dữ liệu chứ không ở lưới. `state.json` là một file JSON ghi đè
toàn bộ, không có version/lock: phiên nào đọc trước rồi ghi sau sẽ xoá thay đổi của phiên khác.
Bằng chứng có phiên song song: `.backups/state/state-pre-unbackfill-20260818-150107.json` —
một tiến trình khác ghi state lúc 15:01, ngoài nhịp của cả `radar-tick` lẫn phiên `/daily`.

**Hậu quả đang gánh:** mỗi lượt `bugwatch` vẫn poll 3 sheet chết (16/7, 16/7, 14/7) và bỏ qua
1 sheet còn động — vừa hao token vừa mù đúng chỗ cần canh. Board thành nguồn KHÔNG đáng tin cho
trạng thái radar, vì nó ghi ý định chứ không đọc lại file sau khi ghi.

**Lưới chặn:** (a) mọi lệnh đổi cờ `bugWatch` (`watch`/`unwatch`/`queue`) phải **đọc lại
`state.json` rồi in trạng thái sau khi ghi**, và board chép đúng output đó thay vì chép ý định;
(b) `state-doctor` thêm WARN khi số sheet `muted` lệch so với lần chạy trước mà không có dòng nào
trong `history/` giải thích; (c) dài hạn: mọi ghi `state.json` đi qua đúng một hàm
read-modify-write có so `mtime` trước khi ghi, phát hiện file đã đổi thì merge lại thay vì đè.

**Nguồn:** `/daily delta` 18/8/2026 15:34 · `.backups/state/state-20260818-14*.json` ·
`tools/state-doctor.mjs:94`

## 19/8/2026 — `updateHeat()` là code chết: 3 field nhịp radar do LLM ghi tay, cửa `hot` chưa nổ lần nào

**Bắt được gì:** `grep -rn "updateHeat" tools console/server skills` chỉ ra **1 hit duy nhất** —
chính dòng `export function updateHeat` ở `tools/bug-radar.mjs:296`. Hàm có 5 ca test pass nhưng
KHÔNG có caller: không CLI, không `radar-tick.mjs`, không console. Hệ quả đo được trong state:
13/13 sheet `heat: "warm"`, tức cửa `hot` của `pickPrompt` chưa nổ lần nào kể từ khi bug-radar
ra đời 17/8 — mọi lượt bugwatch đều vào bằng cửa `stale`.

**Nguyên nhân:** hàm được viết + test theo TDD rồi bỏ quên khâu nối dây. Test đơn vị xanh nên
không ai thấy thiếu; `SKILL.md` lại ghi "Skill KHÔNG ghi `heat`, giao cho máy" nên phiên nào chạy
bugwatch cũng phải ghi TAY `modifiedTime`/`lastChangeAt` vào `state.json` để lượt sau còn so được
— đúng thứ luật đó cấm, và là một nhánh ghi state không qua `saveState` (không backup, dễ đè).

**Hậu quả đang gánh:** sheet vừa đổi không được vào ngay, phải chờ đủ 3h `pollEveryHours`;
`heat` trên console vô nghĩa; và `changed` — cổng quyết định có đốt 90s đọc sheet hay không — do
LLM tự so bằng mắt thay vì máy phán.

**Lưới chặn:** (a) đã thêm CLI `node tools/bug-radar.mjs heat <sheetId> <modifiedTime>` gọi
`updateHeat` + `saveState`, in `changed` để skill quyết định đọc/không đọc; `SKILL.md` bước 2 của
`bugwatch` giờ trỏ đúng lệnh này; (b) luật rút ra cho lần sau: **hàm export + có test mà `grep`
tên nó ra đúng 1 hit là code chết** — TDD xanh không chứng minh đã nối dây, phải grep caller.

**Nguồn:** `/daily bugwatch` 19/8/2026 15:41 · `tools/bug-radar.mjs:296` (hàm) + `:537` (CLI mới) ·
`node --test tools/bug-radar.test.mjs` 119/119 pass sau khi vá

## 19/8/2026 — Sprite gõ toạ độ tay: một icon sai từ lúc viết, không ai thấy

**Chuyện gì:** khảo sát cơ chế sprite để viết luật `R-SPR-*` thì đụng bug đang nằm sẵn trong repo —
`products/dt3q/landing/2026-sinh-nhat-7-ai/assets/dt3q-ld-sinhnhat-loichuc/dt3q-ld-sinhnhat-loichuc.scss:390`
gõ tay `background-position: -408px -212px` cho `.icon-vote-heart`, trong khi `scss/sprite.generated.scss`
không khai ô nào ở toạ độ đó (ô `btn-heart` thật nằm `527/137`, atlas 630×418). Icon đang cắt trúng
khoảng giữa các ô.

**Vì sao lọt:** build vẫn xanh — spritesmith không biết ai đọc toạ độ nào. Chỉ mắt người mở trang mới
thấy, mà icon 21×21 thì nhìn lướt không ra.

**Lưới chặn:** `R-SPR-5` (`rules/cdn-source-standard.md`) cấm gõ `background-position` số cứng và cấm
`url()` trỏ PNG lẻ trong `images/sprite/` — phải `@include sprite($tên)`. Toạ độ tay còn chết lần nữa
mỗi khi spritesmith xếp lại atlas.

**Chưa xử lý:** bug này thuộc campaign khác, ngoài phạm vi đợt viết luật — chưa sửa, ai vào
`2026-sinh-nhat-7-ai` thì sửa kèm. Quét cùng kiểu còn **123 dòng SCSS** + **179 thẻ Twig** trỏ thẳng
ảnh lẻ trong `images/sprite/` trên toàn repo.

**Nguồn:** khảo sát sprite 19/8/2026 · đã tự kiểm lại bằng `sed`/`grep`, không tin báo cáo agent

## 20/8/2026 — Tên folder `products/` không suy được từ tên game: `gn` là Gunny **PC**

**Chuyện gì:** `/daily link GW-723` (3 LDP Gunny: Origin + Mobi + PC). Đoán theo trực giác tên folder
thì `gn` = Gunny (Mobi) và `gnmobinew` = bản mobi mới — **sai cả hai**. Đọc `config.js` field `name`
của campaign `2026-worldcup` (có mặt ở đúng 3 folder này) mới ra thật:
`gno`=`Gunnyorigin` · `gn`=`Gunnypc` · `gnmobinew`=`Gunnymobi`.

**Vì sao lọt:** `SKILL.md` mục suy `<game>` đã cảnh báo "tên chữ thì không ổn định" (ca `496_GNOTH` →
folder thật `ddtank`), nhưng chỉ cấm tin **tag ticket**. Ca này tên FOLDER cũng lừa, mà folder là thứ
mình hay tin nhất vì nó nằm trên đĩa.

**Lưới chặn (rẻ, 1 lệnh):** trước khi nhận một folder products/ là của game X, đọc chính nó khai gì —
`grep -h "name:" products/<game>/landing/*/config.js | sort -u`. Field `name` là tên bundle build ra
(`site.css/js`) nên designer/dev bắt buộc điền đúng game; nó đáng tin hơn tên folder và hơn tag Jira.
Chọn campaign cùng series ở nhiều folder (ở đây `2026-worldcup`) thì so được 1 lượt ra cả bộ mapping.

**Nguồn:** `/daily link GW-723` 20/8/2026 · `products/{gno,gn,gnmobinew}/landing/2026-worldcup/config.js:2`

---

## Tick radar mù connector vẫn báo `ok` — im lặng đúng chỗ nguy hiểm nhất (21/8/2026)

**Bắt được gì:** lượt launchd `/daily bugwatch` 09:55 ngày 21/8 chạy trong một phiên **không có tool
connector claude.ai nào** — `ToolSearch select:mcp__claude_ai_Google_Drive__list_recent_files` và
`select:mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` đều trả *No matching deferred tools found*.
Không có Drive ⇒ không poll được `modifiedTime` ⇒ **toàn bộ bug-radar mất đầu vào**.

**Nguyên nhân:** MCP claude.ai là connector OAuth tương tác; nó **không register** vào phiên headless
lúc process khởi động (lý do transient — `claude mcp list` báo `✔ Connected`, và một `claude -p` mới
nạp được `list_recent_files` ra FOUND trong 5.6s). Tức không phải sai `--allowedTools`
(`radar-tick.mjs:139-145` truyền đủ 7 tên), cũng không phải đường headless chết.

**Vì sao lọt:** `radar-tick.mjs` chỉ đo lượt thành-công/thất-bại theo exit code + số dòng mới trong
`history/*.jsonl`. Phiên mù thì `claude` vẫn exit 0 và vẫn không có gì mới ⇒ ghi
`{"ok":true,"changed":false}` — **trùng khít với chữ ký của một lượt khoẻ mà sheet không ai chạm**.
Nhìn `radar.jsonl` không phân biệt được. Nghi ngờ hồi tố: 13 lượt bugwatch trước đó cũng toàn
`changed:false`, không có cách nào biết lượt nào thật sự đã poll được Drive.

**Lưới chặn (đề xuất, chưa làm — chờ user chốt):** đầu mỗi tick gọi
`ToolSearch select:mcp__claude_ai_Google_Drive__list_recent_files`; MISSING ⇒ ghi
`err: "mcp-not-registered"` + bắn popup, **không** ghi `ok`. Lượt mù phải trông khác lượt yên tĩnh,
nếu không thì radar càng im càng dễ tin là "không có bug".

**Đường phụ đã dùng được ngay trong lượt này:** uỷ thác riêng bước gọi Drive cho một `claude -p` con
(`--allowedTools ToolSearch,mcp__claude_ai_Google_Drive__*`, `--output-format json`) rồi parse dòng
JSON nó trả về. Lấy `modifiedTime` 2 sheet mất 13s/$0.38; `list_recent_files` 17 sheet mất 41s/$0.68.
Rẻ hơn hẳn bỏ trắng cả lượt.

**Nguồn:** `history/radar.jsonl` 13 dòng `/daily bugwatch` · `ps aux` pid 16857 (dòng lệnh đầy đủ) ·
`tools/radar-tick.mjs:139-145,154` · `boards/2026-08-21.md` log 10:03–10:08

## 2026-08-21 — Snapshot tháng: `fields` KHÔNG cắt được payload, phải đọc từ file kết quả
- **Bắt được gì:** bước 4 của `/daily delta` (refresh `history/months.json`) gọi
  `searchJiraIssuesUsingJql` với `fields: [summary,status,duedate,resolutiondate]` đúng như
  `skills/daily/references/jql.md` dặn, vẫn trả **288.005 ký tự** cho 66 ticket và bị chặn
  *"exceeds maximum allowed tokens"*. Lượt delta phình từ ~3' lên **52'**.
- **Nguyên nhân:** `fields` của connector Atlassian là danh sách MỞ RỘNG, không phải whitelist —
  mỗi node vẫn kèm `expand`, `self`, `id`, và `issuetype` đầy đủ (description + 2 URL avatar).
  66 ticket × ~4KB rác = vượt trần, không liên quan số ticket nhiều hay ít.
- **Lưới chặn:** đừng query lại và đừng chia nhỏ khoảng ngày trước — kết quả quá cỡ **tự lưu ra**
  `…/tool-results/mcp-…-searchJiraIssuesUsingJql-<ts>.txt`. Đọc THẲNG file đó bằng node/jq để
  dựng `months.json` (`d.issues.nodes[].fields.{summary,status,duedate,resolutiondate}` +
  `status.statusCategory.key === "done"`). Chia khoảng chỉ là phương án cuối.
- **Vì sao phải ghi ra đây:** lượt radar nền có trần `radar.timeoutMin` = 10' — gặp đúng bước này
  là **chết trần, đốt trọn 10' mà không ra kết quả**, và `months.json` là nguồn DUY NHẤT của tab
  "Theo tháng" nên console lặng lẽ vẽ số cũ. Đo 21/8: query 2026-02-01→2026-09-30 = 66 ticket.

## 2026-08-24 — `changed:false` của bug-radar KHÔNG chứng minh nội dung mới đã được đọc
- **Bắt được gì:** lượt `/daily bugwatch` 11:00 gọi `bug-radar heat` cho 2 sheet đang theo dõi, cả
  hai trả `changed:false`. Theo luật bước 2 (bản cũ) là DỪNG, không đọc nội dung — và nếu dừng thật
  thì bỏ lọt: đọc tay ra **6/6 bug sheet CFL (GW-660) đã sang `DEV Check Status = Done`** trong khi
  state còn ghi 4 bug đang mở, và sheet GW-525 đổi lúc 02:42 sáng hoá ra chỉ là tab account test
  (đúng là 0 bug, nhưng phải đọc mới biết — mốc TC review là chính hôm đó).
- **Nguyên nhân:** `radar-tick.mjs` cố ý đóng dấu `lastPollAt`/`modifiedTime` **kể cả lượt hỏng**
  (để không bắn lại ~$1 mỗi lượt). Lượt bugwatch nền 09:45 `ok:false` (`num_turns:1`,
  `output_tokens:0`) đã "tiêu" mốc mà chưa đọc gì ⇒ lượt sau so mốc thấy bằng nhau, kết luận
  "không có gì mới", cửa đọc đóng vĩnh viễn. Cùng họ với bẫy "commit sớm nuốt mất bug": trạng thái
  tiến lên trước khi việc thật xong.
- **Lưới chặn (máy, không phải trí nhớ):** `cacheStale(cacheMtime, modifiedTime)` trong
  `tools/bug-radar.mjs` — so `modifiedTime` của Drive với **mtime file cache**. Lệnh `heat` nay trả
  `mustRead = changed || cacheStale` (+ `cacheStale`, `cacheMtime`); `skills/daily/SKILL.md` bước 2
  của bugwatch đọc `mustRead`, cấm đọc `changed` suông. Cache là bằng chứng vật lý "đã đọc tới đâu",
  còn `modifiedTime` chỉ là bằng chứng "đã so tới đâu" — hai thứ khác nhau.
- **Số đo mù:** CFL `modifiedTime` 21/8 07:32Z vs cache 19/8 15:39 = **1.7 ngày**; LightAndNight
  23/8 19:42Z vs cache 20/8 11:58 = **3.3 ngày**.
- **Nguồn:** `history/radar.jsonl` dòng `2026-08-24T02:45:16.778Z` (`ok:false`, prompt
  `/daily bugwatch`) · `ls -la .cache/bugsheets/` · `tools/bug-radar.mjs` `updateHeat`/`cacheStale` ·
  `node --test tools/bug-radar.test.mjs` 120/120 pass.

## 2026-08-24 · Font PSD chưa cài ⇒ 38 asset chữ sai nét, và asset "cục gộp" bị dùng vì không đọc cờ plan

- **Bắt được gì:** GW-723 (3 LDP Gunny Trung Thu). Chạy `/psd-cut` trên `GNM_Trungthu_PC_Optimized.psd`,
  export tới 38/49 state thì **user phát hiện bằng mắt**: nhiều asset "dính nhiều hình 1 cục", và chữ
  bị cắt thành ảnh. Truy ra `survey.json` ghi `fontVerdicts` = **6/6 font MISSING** — Photoshop render
  bằng font thay thế ⇒ **mọi PNG có chữ sai nét, không dùng được**. Font thì nằm ngay trong kho design
  (`designs/GW-723/_src/Fonts/`, 9 file) — chỉ là chưa ai cài.
- **Nguyên nhân 1 (máy im lặng):** `psd-survey.py` ĐÃ đo `fontVerdicts` nhưng không chỗ nào chặn;
  `psd-plan.py` chỉ dùng nó để hạ verdict text xuống `CHƯA-CHẮC: font chưa cài`. Tín hiệu có, cổng không
  ⇒ pipeline chạy tiếp 1 tiếng Photoshop rồi mới lộ. Cùng họ với "`updateHeat` được export mà không ai gọi".
- **Nguyên nhân 2 (người bỏ qua cảnh báo):** `psd-plan.py` in đúng cờ `TEXT(sống được — render i18n,
  đừng dùng ảnh)` cho `1-misc`..`4-misc` và `DATA-ZONE(chữ mẫu bind backend — chỉ cắt khung/nền)` cho
  `frame-3`, nhưng manager vẫn copy chúng vào repo thành `point-1..4.png`, `ten.png`, `score.png`. Cờ
  đúng mà không ai đọc = như không có.
- **Lưới chặn (máy):** thêm `gate_font_installed()` vào `skills/psd-cut/scripts/psd-plan.py` — có font
  `MISSING` thì **DỪNG ở nấc plan**, in danh sách font thiếu + tự dò `Fonts/` trong kho design + in sẵn
  lệnh `cp … ~/Library/Fonts/` kèm nhắc **RESTART Photoshop**. Muốn chạy tiếp phải khai
  `--allow-missing-font` (có dấu vết). Test 2 chiều: survey font OK → không chặn; survey font MISSING → chặn.
- **Lưới chặn (quy trình):** trước khi copy BẤT KỲ asset vào repo, đọc cờ của state đó trong output plan.
  Cờ `TEXT(...)` hoặc `DATA-ZONE(...)` ⇒ **cấm dùng làm ảnh**, chỉ bóc phần `khung`/nền, text render từ twig.
- **Bẫy kèm theo, đã trả giá cùng lượt:**
  1. `pkill -f 'psd-export.py'` để dừng job của mình đã **giết luôn job psd-cut của phiên khác**
     (`Button_Download_Transparent.psd`, project ananta). Dừng job phải theo **PID lấy từ đường dẫn
     `job.json` của chính mình**, không pkill theo tên script.
  2. **Đọc tên/nhãn từ ẢNH là không đủ tin.** Đọc ảnh ra "PHỐ TRẠNG NGUYÊN", tên layer PSD ghi
     **"PHỐ TRĂNG NGUYỆN"**. Text trong PSD là nguồn chính xác (`survey.json` nodes `kind=="type"`,
     tên layer = nội dung chữ) — dùng nó, ảnh chỉ để xem bố cục.
  3. Mọi nút trong PSD này có cặp `nor`/`hov` ⇒ nút phải bóc **2 state**, thiếu `hov` là mất hover.
- **Nguồn:** `designs/GW-723/_auto-export/gnm-trungthu-pc-optimized/survey.json` (`fontVerdicts` 6 MISSING)
  vs `survey-v2.json` sau khi cài font (4 OK, còn `GS3TTSupermolotNeue-SemiBold` + `FS-Diavlo-Book` thiếu
  thật — kho không có) · `job-v1-fontsai.json` · output `psd-plan.py` với cờ TEXT/DATA-ZONE.

## 2026-08-24 (chiều) · 4 lỗi khi verify landing local — chẩn đoán sai vì không biết cơ chế

Cùng lượt GW-723, sau khi đã sửa vụ font PSD. Bốn lỗi này đều là **kết luận sai từ triệu chứng đúng**:

1. **Popup copy từ campaign khác mang theo `{% set status = 'active' %}`.**
   Copy `popup_register.html.twig` từ `2026-worldcup` sang, không soát dòng `status` ⇒ popup **mở sẵn ngay khi load trang**, che toàn màn hình. Lane dev báo là *"popup đăng nhập platform (`loginType: mto`) che màn, không tắt được vì thiếu backend"* và bỏ luôn phần chụp layout — chẩn đoán sai hoàn toàn, mất 1 vòng verify.
   ⇒ **Lưới chặn:** copy bất kỳ module popup nào thì soát ngay `{% set status = ... %}` — chỉ popup CHỦ ĐỘNG mở lúc load mới được `'active'`. Grep 1 phát sau khi copy: `grep -n "set status" html/module/*.twig`.

2. **Ảnh `data-src` + `MJ__lazyload` KHÔNG load khi mở local** (lib `libraryMainsite` không init vì không có platform) ⇒ trang trắng ảnh, dễ kết luận oan "thiếu asset".
   Đo thật: `curl` từng path ra **200** trong khi screenshot trắng. ⇒ Trước khi chụp/đo layout local, PHẢI ép nạp:
   `document.querySelectorAll('img[data-src]').forEach(el=>{el.src=el.getAttribute('data-src');el.classList.remove('MJ__lazyload')})`
   rồi mới screenshot. Số ảnh vỡ thật lấy từ `document.images` với `naturalWidth===0`.

3. **Font caps-only dùng cho khối text thường.** `SVN_Bango` là font CHỈ CÓ CHỮ HOA; khối text giấy phép footer đặt font đó ⇒ render in hoa toàn bộ (design là chữ thường) **và** wrap thêm 1 dòng ⇒ dòng cuối bị cắt khỏi section. Sửa: khối body-text dùng sans thường (`Arial, Helvetica, sans-serif`), font display chỉ cho title/nhãn.
   ⇒ Dấu hiệu nhận ra sớm: render in hoa mà design chữ thường = **font sai**, không phải `text-transform`.

4. **Hai lane dev dùng browserpilot cùng lúc thì tranh session.** Lane Footer tốn **54 tool-call** (ngân sách 25) chỉ để gỡ rối vì lane Frame4 đang chiếm browser; phải mở tab isolated mới xem đúng section của mình.
   ⇒ Luật đã có cho checker ("≥2 checker phải ghi dòng `đang chạy SONG SONG với checker khác`") **phải áp cho cả lane DEV nào có bước browser**. Manager tôi chỉ ghi dòng đó cho 1 trong 2 lane — đó là lỗi điều phối, không phải lỗi dev.

**Đo được sau khi sửa:** license 5 dòng đúng design (trước 6 dòng, bị cắt) · 7 nhãn social `overlap: []`, `Discordbook` 136px vs design 135px, khe nhỏ nhất 16px · `footerH` 473 = 493 × 0.96 (scale 1920/2000) — **đừng coi lệch do scale là bug**.

## gate-asset-missing-font-undeclared-2026-08-24
- Bắt được: 12 ERROR (asset-missing, font-undeclared) trên dist — font-family "GS3TTOctosquaresCondensed" dùng 3 chỗ nhưng KHÔNG có @font-face nào khai (browser sẽ fallback im lặng)
- Nguyên nhân: design GỐC bỏ trống artwork "Quả Hồn-Sơ" (GNPC phố 3 quà 2) — export/tooltips/popup đều không có hình; dev cắt asset không có gì để cắt nên bỏ qua im lặng. Xử lý 24/8: đặt PNG trong suốt cùng size (khớp design đang trống) + đòi PM artwork.
- Lưới chặn: fe-gate check asset-missing, font-undeclared (đã bắt được, giữ nguyên trong luồng code-developer)
- Nguồn: 2026-trung-thu · 2026-08-24

## 24/8/2026 — GW-723: 1px lệch hệ thống, mất chữ âm thầm, và 3 bẫy quy trình

**Bối cảnh:** đã báo user "mọi dải ≤ 8" nhưng user tự nhìn ra "từ Frame2 đổ đi vẫn còn đầy chỗ lỗi". Đo lại mới lộ.

1. **Lệch 1px toàn trang ăn 5–6 điểm mean|diff| MỖI DẢI.** `margin-top: -1px` thêm vào section iframe để bịt mạch nền đã kéo Frame2→Footer lên 1px. Bỏ ra: toàn trang **9.89 → 3.78**, 5/5 dải về ≤ 8. ⇒ Mọi dải cùng lệch 10–14 mà layout trông đúng thì **quét dịch render ±1..4px TRƯỚC** khi sửa phần tử. Và **không vá mạch nền bằng margin âm**.
2. **Dải thô pass ≠ đúng design.** Sau khi 5 dải đạt, phải quét ô nhỏ (250×100) tìm ổ > 8 rồi crop render↔design ghép trên–dưới mà NHÌN. Cách này lộ: pill nền của `.note` (cao 36 vs 50 thật), plaque bị khung đè, tiêu đề BXH mất hẳn.
3. **Chữ mất âm thầm.** Asset "khung" xuất ra rỗng chữ là ĐÚNG (cờ TEXT/DATA-ZONE) nhưng phải render chữ bù bằng HTML. Quét: mọi layer `kind=="type"` trong `survey.json` so với HTML build — **strip `alt`/`title` trước khi so**, vì alt làm chữ trông như đã có. Lộ 6 chỗ ở GW-723.
4. **Font caps-only đặt cho cả section** (`#Frame4 { font-family: "SVN_Bango" }`) → mọi chữ in hoa + tràn. Kiểm bằng computed `fontFamily`, đừng đoán theo tên biến.
5. **Thứ tự data phải khớp thứ tự Ô TRÊN DESIGN, không khớp thứ tự layer PSD.** Vòng quay GNO/GNPC bị xếp theo layer order ⇒ ô số 1 gắn tên quà của ô số 9. Map bằng **toạ độ** (`coords.json` so `$itemPos`), không bằng tên/thứ tự.
6. **`_control.png` thiếu ⇒ `psd-trim` SKIP TOÀN BỘ** (C5 không có tham chiếu). `psd-export.py` bỏ qua state có `showPath: []`. Lối ra hợp lệ: dựng `_control.png` từ chính ảnh design khi canvas khớp — đã verify ncc 1.0000 giữa asset export và ảnh design.
7. **CẤM `osascript quit Photoshop` khi còn job đang chạy** — suýt giết job GNPC 20 state. Muốn font mới có hiệu lực thì chờ hàng chờ rỗng.
8. **Đọc file lúc launchd radar đang `git pull --autostash`** thấy file bị revert tạm (Frame4.scss 271 dòng → 123 dòng rồi tự về). Trước khi báo "mất code" phải đọc lại + so `git hash-object` với `HEAD`/stash.
9. **Xếp nhiều job Photoshop phải TUẦN TỰ bằng file cờ** (`touch /tmp/chainN.done`), không dùng nhiều vòng `while pgrep psd-export` song song — khi job hiện tại xong, mọi waiter cùng bung một lúc.

## 24/8/2026 — GW-723: vì sao so-pixel toàn trang MÙ, và bộ dò thay thế

User chỉ ra 8 lỗi **nhìn là thấy** trên trang đã báo "mọi dải ≤ 8". Truy nguyên: `design-diff sections` mù 4 loại lỗi, mỗi loại có cách đo riêng — **không có cách nào là nhìn ảnh trung bình**.

| Loại lỗi | Vì sao mù | Máy dò đúng |
|---|---|---|
| Tooltip / popup | `display:none` khi tải → KHÔNG có trong ảnh; và design tooltip là **file PNG riêng** (`*_tooltips.png`) | force-show rồi so với ảnh design riêng: `#Frame2 .dao .tooltip{display:block!important}` |
| Phần tử cuộn theo `position:fixed` | ảnh full-page **làm phẳng** fixed; design composite không diễn tả hành vi | liệt kê con của container `fixed` (`tools/ui-defect-scan.js` mục `inFixed`) |
| Chữ tràn khung | vài trăm px² bị pha loãng trong trung bình dải | `scrollWidth > clientWidth` từng phần tử text |
| 2 khối chữ đè nhau | màu gần giống nên diff thấp | giao diện tích 2 `getBoundingClientRect` > 120px² |
| Asset trắng trơn | `naturalWidth>0` nên không phải "ảnh vỡ", vùng design cũng sáng | `tools/asset-blank-scan.mjs` — độ lệch màu < 6 |

**Công cụ mới (dùng lại cho mọi landing):** `tools/ui-defect-scan.js` (chạy trong `page.evaluate`, trả `overflow/collide/inFixed/hiddenByDesign`) và `tools/asset-blank-scan.mjs`. Copy `ui-defect-scan.js` vào `dist/` rồi `fetch('/_scan.js')` — build xoá `dist` nên phải copy lại sau mỗi lần build.

**Lỗi thật lộ ra nhờ 2 máy dò + soi mắt (8 cái, không cái nào bị `sections` bắt):**
1. **Font body sai cả trang** — Frame2/3/4 dùng `GS3_Harmoniqu_Bold` trong khi `fontVerdicts` của PSD chỉ có FS Diavlo / GS3TTSupermolotNeue / SVN Bango. ⇒ **Luôn đối chiếu `font-family` với `fontVerdicts` trong survey**, đừng tin font của scaffold.
2. **ĐĂNG NHẬP + XIN CHÀO nằm trong `#float_right`** (fixed) nên cuộn theo nav — design vẽ chúng ở Frame1.
3. Chữ tràn: `.note` Frame4 +10px, `.badge-name` +8px (đổi font rộng hơn là tràn ngay).
4. `.bxh-prize` dùng `opacity:0` vẫn chiếm chỗ → đè chữ tiêu đề BXH. Tooltip phải `display:none`.
5. **CSS bảng của campaign cũ còn trong `base.scss`** (93 dòng, `#cd422d`) với selector sâu hơn nên đè CSS mới. Xoá scaffold trước khi viết mới.
6. **Data nhân đôi ở 2 file** (`body.html.twig` + `body-diemdanh.html.twig`) → sửa 1 nơi, trang kia vẫn sai. Gộp về 1 file 2 chế độ (`pageMode`).
7. **Thứ tự quà tooltip lệch ô** — cùng bệnh vòng quay: data theo thứ tự brief, không theo Ô trên design. Lấy thứ tự ô từ **layer CHỮ** (`kind=="type"`) sắp theo bbox, KHÔNG dùng layer icon (ô thiếu icon sẽ làm lệch cả dãy).
8. **Layer nằm trong nhóm `chibi` bị nền che** — `Frame 3/chibi/Layer 77` (thỏ+bánh) design vẽ TRÊN khung info, nhưng gộp vào `bg` nên bị `.info` phủ. Phải tách thành overlay riêng có `z-index`.

**Sản phẩm phụ:** design GNM mốc 140 tự nó **đổi icon giữa ô 1 và ô 3** (icon "Lì xì nhỏ" mang nhãn "Cỏ Khô Thú Cưỡi"). Theo CHỮ, không theo icon, và báo PM.

## gate-asset-missing-2026-08-24
- Bắt được: 1 ERROR (asset-missing) trên dist — ref không tồn tại: assets/Frame2/images/item/gnpc/item-3-2.png
- Nguyên nhân: design GỐC bỏ trống artwork "Quả Hồn-Sơ" (GNPC phố 3 quà 2) — export/tooltips/popup đều không có hình; dev cắt asset không có gì để cắt nên bỏ qua im lặng. Xử lý 24/8: đặt PNG trong suốt cùng size (khớp design đang trống) + đòi PM artwork.
- Lưới chặn: fe-gate check asset-missing (đã bắt được, giữ nguyên trong luồng code-developer)
- Nguồn: 2026-trung-thu · 2026-08-24


## fix-round-gw723-2026-08-24 — 7 bài học từ vòng compare+fix trung-thu (user chỉ 10+ lỗi bằng screenshot)

| # | Lỗi | Bài học chống lặp |
|---|---|---|
| 1 | Chữ footer BÓNG ĐÔI — label bake sẵn trong sprite icon (120×141 gồm cả chữ), HTML render text sống đè lên lệch 2-3px | Trước khi render text sống lên vùng có asset: MỞ asset đo size — icon 120 nhưng cao 141 là dấu hiệu có chữ bake. Thí nghiệm chốt: ẩn element mà chữ vẫn còn = có bản bake. Đã tốn 3 vòng nghi font (PIL render cả 2 font đều sạch) trước khi tìm ra |
| 2 | Vòng quay chết + 0 ô quà: twig loop `g.wheel` nhưng data chỉ khai `wheelSlots` — build XANH, trang câm | Sau build: grep dist đếm phần tử của MỌI vòng loop twig (`gr_effect--item` = 0 là chết). Loop over key undefined không lỗi, không cảnh báo |
| 3 | NẠP XU MB trôi theo nav fixed — ĐÚNG bệnh lesson cũ "ĐĂNG NHẬP trong #float_right" đã ghi mà chỉ fix 1 nút | Lesson ghi cho 1 phần tử thì phải quét HẾT SIBLING cùng container ngay lúc đó (grep cả block #float_right xem nút nào design để tĩnh) |
| 4 | Cụm mốc Frame4 lệch cả cụm 30-40px dù agent match ncc 0.86-0.89 "khớp" — chỉ đo KHOẢNG CÁCH nội bộ, không chốt anchor tuyệt đối | Match cụm nhiều phần tử: đo toạ độ TUYỆT ĐỐI ≥1 phần tử neo vào design + render rồi so vector, không chỉ so dx/dy nội bộ |
| 5 | Loạt màu chữ sai (score-label #fbe6a2 vs #a56c31, .point, .num, .moc-point...) — dev đoán màu bằng mắt từ ảnh thu nhỏ | Màu chữ trên nền asset: sample glyph pixel từ design full-res (Counter màu tối/sáng phổ biến), cấm eyeball |
| 6 | Đo sections viewport 1920 trong khi scaleWidthPC=2000 → drift tuyến tính giả 52-95 toàn dải | Chụp đo = viewport đúng scaleWidth; assert `#MS__wrapper` transform matrix(1). Chi tiết: knowledge code-developer entry đo-khớp-design mục 9 |
| 7 | User thấy lỗi trên bản build CŨ (label thiếu icon strip, wheel cắt) → 2 vòng truy nguyên lỗi KHÔNG tồn tại | Trước khi truy lỗi user báo: rebuild + so screenshot bản MỚI trước; lỗi chỉ có trên bản cũ thì trả lời "đã fix ở build X" kèm crop, khỏi đào |

- Nguồn: 2026-trung-thu GW-723 · 2026-08-24 · phiên compare→fix full

## spin-contract-3-lop-2026-08-24 — vòng quay lib promotion chết im: 3 hợp đồng ngầm
Lib `promotion2.js` (libraryMainsite 1.3.0) có 3 hợp đồng KHÔNG có trong doc, vi phạm là chết im (không log console vì lỗi nằm trong handler):
1. Số lượt phải nằm ở class **`.spoint`** (lib đọc `el.cp` mặc định) — chỉ có `pm__point` thì `NaN >= 1` = false, không bao giờ gọi API.
2. Phải khai **`var currentPool;`** global (lib gửi biến này trong getData) — thiếu là ReferenceError.
3. Lib tra **`names[$('body').attr('class')]`** — body CHỈ được mang mã ngôn ngữ (`class="vn"`); marker `game-*`/`page-*` phải đặt trên `<html>`.
Pattern chuẩn: `products/gpn/landing/2026-he-ruc-ro`. Test local: x10 chạy (mock lib có getdatax5/x10), x1 KHÔNG có mock (knowledge librarymainsite-x1-spin-debug-limit), ô dừng cố định vì mock trả 1 key — random do BE.
- Nguồn: 2026-trung-thu GW-723 · 2026-08-24

## bg-cat-tu-anh-design-phang-2026-08-25
Cắt lại nền section (`bg.jpg`) mà lấy nguồn là **ảnh design phẳng** (`*_PC.png` composite) thì bake luôn tiêu đề/nút/BXH/chữ chú thích vào nền → chữ sống render đè = **lồng chữ**, và không phát hiện được bằng `design-diff sections` (chữ đè chữ giống nhau nên mean|diff| vẫn thấp, thậm chí ĐẸP hơn).
- Nguồn ĐÚNG là layer nền sạch đã bóc sẵn: `_auto-export/<slug>/bg.png` (full canvas, chỉ nền).
- Cách phát hiện rẻ nhất: mở thẳng file `bg.jpg` vừa cắt và NHÌN — thấy chữ/nút trong đó là sai. Đừng tin số đo band.
- Cùng họ với bẫy `fix-round-gw723` (chữ bake trong sprite Footer): **trước khi thêm/sửa text sống, kiểm ảnh nền/sprite bên dưới đã có chữ đó chưa.**
- Brief cho subagent cắt lại nền PHẢI chỉ đích danh file nguồn nền sạch, đừng để agent tự chọn giữa `bg.png` và `*_PC.png`.

## font-thieu-glyph-advance-0-2026-08-25
`FS-Diavlo-Black.ttf` thiếu glyph `Ộ` (U+1ED8): trình duyệt render advance width = **0** nên ký tự KẾ TIẾP vẽ đè lên → mất chữ ("KHAI LỘC" thành "KHAI LỘ"). Không phải clip/overflow: `scrollWidth == clientWidth`.
- Cách đo: canvas `measureText(ch).width === 0` quét cả bảng chữ hoa tiếng Việt cho từng font đã khai `@font-face`; hoặc `Range` từng ký tự trong DOM để thấy ký tự width 0.
- Fix 1 dòng, không đổi font đang dùng: khai thêm `@font-face` CÙNG family, `src` trỏ bản Bold, `unicode-range: U+1ED8`, đặt SAU khai báo gốc (rule sau thắng trong vùng giao).
- Quét font trước khi dựng landing tiếng Việt: `Ộ Ợ Ự Ẫ Ặ` là nhóm hay thiếu ở font FS/GS3 do studio giao.

## popup-chon-font-bang-iou-mask-2026-08-25
Chọn font cho chữ trên design KHÔNG được đoán theo tên file. Cách đo đã dùng và ăn tiền:
1. Bóc mask chữ trên design (ngưỡng độ sáng, tránh vùng deco/nút gây nhiễu — kiểm bằng cách in bbox từng dòng, các dòng ra CÙNG bề rộng = đang bắt nhầm nền).
2. Với mỗi file trong `assets/main/fonts/`, render cùng chuỗi bằng PIL, quét size để bề rộng khớp design, resize về đúng khung rồi tính **IoU** với mask design.
3. Font thắng phải hơn hẳn (vd popup Trung Thu: SVN-Bango 0.634 vs FS-Diavlo-Black 0.443 — kiểm chéo bằng chuỗi thứ 2 ở popup khác trước khi áp).
Dấu hiệu SAI FONT (không phải sai size): render và design **bằng bề rộng** nhưng render **cao hơn và nét mảnh hơn** (đo `ink px`, tỉ lệ design/render ≈ 1.2 là lệch typeface).
Suy size từ ink khi không bóc được mask sạch: `size ≈ size_hiện_tại / sqrt(ink_render / ink_design)`.

## popup-thu-tu-import-base-scss-2026-08-25
`scss/base.scss` mà `@import` module ở ĐẦU file rồi mới định nghĩa `.base { .box / .content }` thì mọi rule module cùng độ đặc hiệu (`.popup_x .box` = `.base .box`) **thua theo thứ tự nguồn** → module chết âm thầm, không lỗi build.
Fix gốc: dời cụm `@import` module xuống CUỐI base.scss (đã làm cho campaign trung-thu). Fix cục bộ: viết `.base.popup_x .box`.
Soát nhanh: `grep -n '^\.popup_' scss/module/*.scss` — rule nào đè `.box`/`.content` mà không có `.base.` phía trước là nghi phạm.

## popup-ngat-dong-thu-cong-2026-08-25
Chữ 2 dòng trên design mà 2 dòng gần bằng nhau (vd 437 vs 504 px) thì KHÔNG ép được chỗ ngắt bằng `width`: ngưỡng cắt dòng 1 luôn cắt luôn dòng 2. Đo bằng `canvas.measureText` trong trình duyệt để chứng minh, rồi ngắt bằng `<br>` trong markup và ghi chú BE bơm chuỗi khác sẽ tự xuống dòng. Đừng chỉnh font-size cho "vừa" — làm sai cả typeface.

## popup-base-btn-input-de-rule-module-2026-08-25
`base.scss` của libraryMainsite-t-popup có `.base .box .content .btn` (0,4,0) và rule cho `input` — mọi rule module viết `.popup_x .btn` (0,2,0) hay `.popup_x .content .btn` (0,3,0) đều THUA, đổi sprite/nền không ăn mà build vẫn xanh.
Muốn đổi phải bám `.base.popup_x .box .content .btn` (0,5,0). Dấu hiệu nhận ra nhanh: computed width vẫn là 229x84 (sprite `$btn` mặc định) dù module đã `@include sprite($btn-nhan)`.
Kèm: CSS lib đặt `::placeholder` màu đỏ — ghi đè `color` cho input KHÔNG đổi placeholder, phải viết `&::placeholder { color: …; opacity: 1 }`.
Kiểm nhanh cả bộ popup: đếm font-family thực tế của mọi leaf node có text (`getComputedStyle`) — thấy `Arial` là dấu hiệu element chưa được style (option/button), thấy 2 font khác nhau trên `th` vs `td` là bảng đang lệch.

## gate-font-undeclared-2026-08-26
- Bắt được: 1 ERROR (font-undeclared) trên dist — font-family "PSL034PRO" dùng 2 chỗ nhưng KHÔNG có @font-face nào khai (browser sẽ fallback im lặng)
- Nguyên nhân: (điền — vì sao lọt tới đây)
- Lưới chặn: fe-gate check font-undeclared (đã bắt được, giữ nguyên trong luồng code-developer)
- Nguồn: 2026-tinh-quang-chi-da · 2026-08-26

## 2026-08-27 — Delta mù ticket đổi trong "khe" giữa JQL và lastRun
- **Bắt được gì:** GW-805 COMPLETED trên Jira 26/8 15:50 nhưng delta 27/8 14:56 vẫn báo `waiting-design`; user phải tự báo "task 805 tôi done rồi mà".
- **Nguyên nhân:** delta quét `updated >= -4h` CỐ ĐỊNH. Lượt 26/8 chạy JQL ~15:37 (trước sự kiện 15:50) rồi ghi `lastRun` 15:56 (sau sự kiện). Lượt kế cách >4h nên cửa sổ -4h không với ngược tới 15:50 ⇒ thay đổi rơi vào khe, mù vĩnh viễn.
- **Lưới chặn:** SKILL.md mục `delta` đã đổi công thức: quét từ `state.lastRun` lùi 30 phút (đệm cho chính khe JQL→lastRun), fallback -4h chỉ khi thiếu lastRun.
- **Nguồn:** boards/2026-08-27.md log 15:03 · history/phases.jsonl GW-805 waiting-design→closed.
