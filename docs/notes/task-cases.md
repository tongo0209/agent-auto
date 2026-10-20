# Thư viện trường hợp task (task cases) — dev FE VNG

Tổng hợp 20/10/2026 từ lịch sử thật. Chỉ đọc nguồn, không sửa.
Nguồn viết tắt:
- `st:GW-x` = `agent-auto/state.json` → `issues['GW-x']` (note / lastAction / milestones / paths / parent).
- `mem:<tên>` = `~/.claude/projects/-Users-lap17727-VNG/memory/<tên>.md`.
- `les:<tiêu đề>` = `agent-auto/knowledge/lessons.md`.
- `git:` = `git log --no-merges --since=2026-06-01 -- <path campaign>` trong cdn-source. Đếm **mọi tác giả** (kể cả BE/mainsite-bot), nên là trần trên của effort FE. Dạng `Nc/Dd` = N commit / D ngày có commit.
- `flow:` = `agent-auto-lab/flows/*.json`, `sig:` = `tools/lib/autopilot/signals.mjs`.
- (suy) = suy luận của người tổng hợp, chưa có nguồn đo.

Mức tự chạy: **AUTO** = autopilot làm trọn tới commit · **DUYỆT** = chạy được nhưng phải dừng ở cổng duyệt người · **NGƯỜI** = chỉ người làm, autopilot chỉ hỗ trợ đo/soát.

---

## A. Bảng phân loại (19 loại)

### 1. Landing promotion MỚI từ PSD
- **Ví dụ:** GW-525 (LAN Trung Thu, H5 minigame), GW-901 (Ghost Story Big Update T10, 4 locale), GW-884/888/892 (TLBB SN 2 tuổi), GW-877 (NTH Creator Award vote).
- **Tín hiệu:** file `.psd/.psb` trong `designs/<KEY>/`, chưa có `_auto-export` (sig:hasRawDesign, !hasCutAssets); `st.paths` trỏ folder chưa tồn tại hoặc `scaffoldedAt` mới; `st.gameplay` / note có "Gameplay ticket ghi: …" (st:GW-881, st:GW-901).
- **Đầu vào bắt buộc:** PSD đủ màn + đủ trạng thái ô quà (rules/promo-states.md) · gameplay đã khoá (R-PM-11, `project-note lock`) · font của PSD đã cài (mem:font-psd-phai-cai-truoc-khi-boc) · folder gt-promotion đích. Thiếu → hỏi PM (gameplay, trạng thái) / designer (font, layer tách).
- **Đường nhanh đã chứng minh:** `psd-cut --precheck` → báo cảnh báo trước (mem:soat-design-bao-canh-bao-truoc) → `/psd-cut` → spec ra file trước code (mem:spec-truoc-khi-code-du-khong-co-anh) → `/code-developer full` → build-optimize → bàn giao gt-promotion. GW-888: "psd-cut PASS (12 lượt, 1 override C5) … pm-gate bàn giao --baseline none 0 🔴" (st:GW-888).
- **Cổng:** build-optimize (mem:verify-phai-tren-ban-build-optimize) · `pm-gate` + `--page` · `/check-promotion` · `/ui-check` PC+MB · `landing-parity` · `/clean-code` · `pm-gate --baseline none` trên file gt-promotion (mem:ban-giao-promotion-luon-qua-cong-kit).
- **Bẫy:** mem:psd-cut-rot-layer-ngoai-nhom-con · mem:design-an-trong-layer-psd · mem:lib-132-popup-bam-xuyen · mem:lib-132-khe-751-768-scalewidthmb-750 · mem:verify-landing-local-3-bay · mem:kiem-du-hover-focus-action · les:"spin-contract-3-lop" (vòng quay chết im) · mem:fe-khong-gia-lap-trang-thai-be-quan.
- **Tự chạy:** DUYỆT — flow `landing-new` đủ stage cut→commit, nhưng khoá gameplay + icon quà demo (st:GW-884 "ảnh quà demo (CN), chờ icon thật") + câu hỏi PM (st:GW-909 "hoi-pm 22 câu") cần người.
- **Effort:** GW-525 54c/14d · GW-901 32c/7d · GW-877 9c/4d · GW-884 2c/2d, GW-888 2c/1d, GW-892 2c/1d (cụm TLBB làm dồn 19/10) (git:).

### 2. Landing mới từ Figma
- **Ví dụ:** GW-796 (ZSM Đua Có Hội — "update theo design + dev note Figma 18/9", mem:gw-796-dua-co-hoi-trang-thai).
- **Tín hiệu:** link `figma.com/design|file` trong `tasks/<KEY>/brief.md` (sig:hasRawDesign) — hoặc trong `st.designLink` (sig CHƯA đọc field này).
- **Đầu vào:** token `~/.config/figma-cut/token` · node-id frame · text vùng data-bind lấy `textLive` (CLAUDE.md routing).
- **Đường nhanh:** `/figma-cut <url> --precheck` → `/figma-cut` → như loại 1.
- **Cổng:** như loại 1.
- **Bẫy:** mem:figma-api-starter-khoa-files-full (429 tính bằng ngày, đi `/nodes`) · subtask "Hình quà" GW-838 còn To Do ⇒ design chưa đủ (st:GW-796).
- **Tự chạy:** DUYỆT (cùng lý do loại 1) + rủi ro quota Figma.
- **Effort:** GW-796 14c/4d (git:).

### 3. Clone-reskin landing (giữ cấu trúc, thay ảnh/chữ)
- **Ví dụ:** GW-720 (Tây Du tieu-bach-thu clone từ tam-tieu-nuong-nuong), GW-805 (4 event Tây Du clone, "không đổi thiết kế/quà"), GW-863 (JXM mua chung clone ban-goi-10-nam, chỉ thay cụm nút mua).
- **Tín hiệu:** field `cloneRef`/`cloneFrom` trong state (st:GW-720, st:GW-747); note chứa "clone"/"tham khảo <số>"; campaign nguồn tồn tại.
- **Đầu vào:** campaign nguồn chính xác · có giữ HTML giao hàng zero-edit không · ảnh mới.
- **Đường nhanh:** copy campaign → đặt lại `name`/folder (R-STR) → thay assets → build-optimize → **đồng bộ tên output theo campaign cũ** bằng `sync-optimized-names.mjs` (les:"GW-720 · Clone landing: đuôi file dist/optimized là quyết định RUNTIME") → giao "đổi link CDN" thay vì HTML mới (st:GW-720 lastAction 13/8).
- **Cổng:** build-optimize · `landing-parity` (CLAUDE.md) · `/ui-check` · prettier khớp bản giao cũ (mem:gt-promotion-format-va-chi-mainsite, st GW-863 "print-width 180 … khớp 0 dòng").
- **Bẫy:** đuôi `.png`↔`.webp` đổi theo ảnh ⇒ 70 file 404 (les GW-720) · mem:clone-tinh-loc-file-query-string · mem:lib-132-khong-gan-popup-opened (bộ ảnh logo lật png→webp).
- **Tự chạy:** AUTO khi chỉ thay assets + nguồn đã rõ (suy); hiện router đẩy nhầm sang `landing-new` (cut+spec thừa) — xem B.
- **Effort:** GW-720 3c/3d · GW-805 3c/2d (git:).

### 4. Template clone-được cho PM tự xoay tua
- **Ví dụ:** GW-727 (Ngọa Long Mobile, mẫu "2117 ân phúc tiên duyên" Tây Du; "cắt HTML thành TEMPLATE để PM tự clone", st:GW-727).
- **Tín hiệu:** note/brief chứa "template"/"tự clone"; mẫu tham chiếu ở game khác.
- **Đầu vào:** brief đính kèm Jira (st ghi "chưa đọc") · mẫu tham chiếu.
- **Đường nhanh:** clone mẫu (loại 3) + chuẩn hoá theo kit `ai-template-kit` → bàn giao.
- **Cổng:** loại 1 + soát hook sau khi BE sửa.
- **Bẫy:** BE ghi chèn bản final làm **mất `pm__changerole-form` + 2 id selectrole** (st:GW-727 15/9, R-PM-1) — mem:be-tu-maintain-markup-drift.
- **Tự chạy:** DUYỆT.
- **Effort:** 15c/7d (git:).

### 5. Một ticket – nhiều landing / nhiều game
- **Ví dụ:** GW-745 (Bomber convert 5 landing gno/gnmobinew/gpn/ovensmash/zsm), GW-723 (3 LDP Gunny Trung Thu), GW-813 (6 trang ANANTA), GW-713 (landing + subweb).
- **Tín hiệu:** `st.paths.length > 1` (sig chỉ lấy path ĐẦU — `paths.find(...)`).
- **Đầu vào:** map đúng game↔folder: `gn`=Gunny PC, `gnmobinew`=Gunny Mobi (les:"Tên folder products/ không suy được từ tên game") · design nằm ở ticket anh em (GW-732 cho GNO/ZSM, mem:gw-745-bomber-convert-trang-thai).
- **Đường nhanh:** fix theo lô cùng pattern cho mọi campaign (GW-745 "badge trạng thái vali cả 5 landing ăn theo class") → 1 build mỗi campaign → bàn giao từng folder.
- **Cổng:** loại 1 cho từng campaign; đo nửa deploy (mem:nua-nao-la-ban-deploy-phai-do).
- **Bẫy:** mem:landing-convert-be-tach-frame2-iframe · mem:nen-section-phai-tu-khop-day-header · les:"cold-build-xoa-dist-duoc-git-track" (GW-723 295 file `D`, st:GW-723).
- **Tự chạy:** DUYỆT; cần fan-out theo campaign (mem:toi-da-5-agent-mot-luot — làn rời file).
- **Effort:** GW-745 91c tổng 5 folder, 6–8d/folder · GW-723 28c/6d (1 folder đo được) (git:).

### 6. Cụm nhiều ticket cùng event
- **Ví dụ:** TLBB SN 2 tuổi: GW-884, 886, 888, 890, 892 (st:GW-886 "cùng cụm GW-884/888/890/892").
- **Tín hiệu:** cùng `game` + cùng mốc release + summary chung tiền tố (suy); paths cùng `products/tlbb/landing/`.
- **Đầu vào:** gameplay từng ticket · font GS chung (st:GW-892 "Treo: font GS").
- **Đường nhanh:** làm tuần tự từng ticket, dùng chung bộ popup/font đã dựng (mem:chay-tuan-tu-tung-game-gop-luot-cat — Photoshop độc chiếm).
- **Cổng:** loại 1, mỗi ticket 1 lần.
- **Bẫy:** mem:chay-tuan-tu-tung-game-gop-luot-cat · GW-886 Jira COMPLETED khi cdn chưa push + chưa có folder gt (st:GW-886).
- **Tự chạy:** DUYỆT, chạy nối đuôi (suy).
- **Effort:** GW-886 9c/1d · GW-890 6c/3d · 884/888/892 2c mỗi cái (git:).

### 7. Đổi cơ chế gameplay giữa chừng
- **Ví dụ:** GW-963 (con của GW-890: "đổi cơ chế sang khuyến mãi nạp → tích lũy nạp 20k nhận 1 mã code, log tính trong ngày", chat TLBB 20/10, st:GW-963) · GW-747 (bình chọn Cá Nhân → Bang Hội, giữ layout GW-713) · GW-863 (combo: "2 nút mua bỏ action JS, BE tự xử").
- **Tín hiệu:** ticket mới có `parent` trỏ ticket đã `wait-test/done-fe`, description trống, nguồn yêu cầu nằm ở chat (st:GW-963); gameplay trong note khác `st.target`/gameplay đã khoá.
- **Đầu vào:** gameplay MỚI để khoá lại (`project-note lock`) · hook BE của cơ chế mới · popup nào thêm/bỏ theo kit (AI-RULES cặp mới).
- **Đường nhanh:** đổi khoá gameplay → so kit cũ vs kit mới → cắt nguyên block thừa/thêm module theo kit → bàn giao lại (suy theo rules/pm-contract.md).
- **Cổng:** `pm-gate` theo gameplay mới + `/check-promotion` loại mới + `pm-gate --baseline none`.
- **Bẫy:** phase suy từ cha "chưa xác nhận đúng việc này" (st:GW-963) · không đoán gameplay từ hook (CLAUDE.md "Cấm đoán gameplay").
- **Tự chạy:** NGƯỜI quyết gameplay → DUYỆT phần code.
- **Effort:** chưa đo được (ticket 20/10, duedate cùng ngày — st:GW-963).

### 8. Sửa nhỏ / update design sau bàn giao (kể cả ticket đã đóng)
- **Ví dụ:** GW-720 ("apply assets-3 update", 17/8), GW-747 (3 commit trên ticket closed 10/9: đổi KV header), GW-776 (16 item quà + form), GW-814 (thu nhỏ icon mốc 200), GW-777 (popup nhận lượt nhỏ khi máy dọc), GW-877 (4 đợt review design 13–15/10).
- **Tín hiệu:** phase `wait-test|done-fe|closed` + commit mới trên `paths` (radar delta, st lastAction "commit mới trên folder ticket ĐÃ CLOSED"); ảnh/brief mới không kèm PSD.
- **Đầu vào:** ảnh/đoạn chat chỉ chỗ sửa · bản giao hiện hành ở gt-promotion (pull trước).
- **Đường nhanh:** sửa vặt ≤2 file làm thẳng (CLAUDE.md routing) → build-optimize → sinh lại file bàn giao "theo cùng lệnh" (mem:gw-863 How to apply).
- **Cổng:** `/ui-check` (MUST mọi làn) · `pm-gate` nếu chạm `pm__` · bàn giao lại qua cổng kit.
- **Bẫy:** mem:sua-local-chua-release-la-chua-xong · mem:ban-giao-landing-nguoi-khac-sua-tay (sinh lại bằng tool phình diff) · les:"build-lai-dist-lam-doi-185-file-cua-trang-da-release".
- **Tự chạy:** AUTO cho sửa CSS/asset có chỗ rõ (flow `landing-fix`); DUYỆT nếu chạm hook.
- **Effort:** GW-814 23c/4d · GW-776 12c/5d · GW-777 12c/3d (cả dựng + sửa) (git:).

### 9. Buglist Google Sheet
- **Ví dụ:** GW-660 (CFL Rừng Kỳ Bí), GW-477 (CFL Offline, nhiều ROUND), GW-950 (GS, không có BugID), GW-855 (mainsite X5 sau AT3).
- **Tín hiệu:** `st.bugSheets` chứa `docs.google.com/spreadsheets` (sig:inputIsSheet) · `phase=bugfix` · `bugWatch[<id>].keys` (30 sheet đang theo dõi).
- **Đầu vào:** cột BugID/Bug Type/Assign đủ (GW-477 "Rớt cổng G4 (Bug Type trống cả sheet) ⇒ không auto-fix", st:GW-477) · tab đúng · người QC.
- **Đường nhanh:** `/bug-fixer-lite` (triage → bug-lane theo cụm file → 1 build → design-checker → ghi Done qua extension Chrome). GW-950: r23/r31/r35 Done, MR !415 (mem:gw-950-…).
- **Cổng:** build-optimize · verify từng bug · `/ui-check` (MUST khi bàn giao UI) · ghi sheet chỉ cột Status (mem:khong-ghi-comment-bug-promotion).
- **Bẫy:** les:"Buglist GS không có cột BugID ⇒ bug-radar mù im lặng" · les:"parseBugTable dedupe BugID toàn file" · les:"BugID trùng giữa 2 đợt" · mem:mau-nen-o-la-trang-thai-bug · les:"autoclose nuốt phase bugfix".
- **Tự chạy:** AUTO khi sheet có BugID + Bug Type; DUYỆT ở bước ghi sheet nếu tab bị che (mem:excel-online-ghi-duoc-neu-tab-khong-bi-che).
- **Effort:** GW-660 20c/10d · GW-477 24c/14d (gồm dựng; nhiều round) (git:).

### 10. Buglist Excel SharePoint / OneDrive
- **Ví dụ:** GW-813 (`BugList ANATA.xlsx`, 6 tab), GW-745 (`BugList Bomber VNG.xlsx`, 5 sheet), GW-956 (Excel Online, "bug-radar không scan được").
- **Tín hiệu:** `bugSheets` chứa `sharepoint.com` / `.xlsx` (sig:inputIsSheet gộp chung với Google — chưa phân biệt).
- **Đầu vào:** quyền đọc file · sheet nào là của mình (GW-745: "`Bug LD Hub` không phải của mình") · token Graph nếu ghi.
- **Đường nhanh:** đọc bằng HTTP Range (mem:doc-xlsx-lon-bang-http-range) → fix như loại 9 → ghi Done bằng `tools/bug-sheet-tick.py` (Graph API, không cần Edge — mem:gw-745) hoặc xuất block dán tay cột G (mem:gw-813, 49 note chưa lên).
- **Cổng:** loại 9 + **curl so hash CDN với local trước khi bảo QC recheck** (mem:gw-813 — QC test nhầm bản chưa deploy).
- **Bẫy:** mem:xlsx-extractor-tron-anh-nhieu-sheet · mem:excel-online-ghi-duoc-neu-tab-khong-bi-che · mem:mau-nen-o-la-trang-thai-bug.
- **Tự chạy:** DUYỆT — ghi ngược chưa có writer chung; GW-956 paths "mượn GW-813, CHƯA confirm".
- **Effort:** GW-813 6 folder ×9–13c/4–5d (git:).

### 11. Bug thật ra là BE drift markup
- **Ví dụ:** GW-477 (BE gắn thừa `ot-drawer__item--sub`, thiếu `.ot-rank__podium`), GW-727 (mất `pm__changerole-form`), GW-745 (nửa `promotion/` mới là bản deploy).
- **Tín hiệu:** đã bàn giao gt-promotion + bug chỉ thấy trên live, source FE + `mainsite/` khớp (mem:be-tu-maintain-markup-drift); commit người khác trên `promotion/index.html` (st:GW-477 "tuch 840105dd").
- **Đầu vào:** HTML live (tải bằng curl `--compressed`, mem:curl-khong-gzip-bao-loi-gia).
- **Đường nhanh:** diff DOM live ↔ twig/source TRƯỚC khi soi SCSS; `grep -n "<script" <bản-BE>` trước khi đọc JS FE (mem:landing-ban-giao-ban-be-lech-khoi-source) → route bug sang BE.
- **Cổng:** bằng chứng diff đính vào note routing.
- **Bẫy:** les:"R-HO-5 — Promotion/ và mainsite/ phân kỳ" · mem:nua-nao-la-ban-deploy-phai-do · mem:fix-de-ra-bug-khi-de-css-doi-tac.
- **Tự chạy:** AUTO phần chẩn đoán + note routing (user "bằng chứng đủ thì tự quyết", mem:be-tu-maintain-markup-drift); không tự sửa HTML BE.
- **Effort:** nằm trong đợt buglist; không tách được (suy).

### 12. Landing / H5 đa locale
- **Ví dụ:** GW-525 (vn/en/th), GW-881 (5 ngôn ngữ, web + H5), GW-901 (4 locale), GW-909 (3 locale, iframe), GW-779 (4 ngôn ngữ, 17 HTML).
- **Tín hiệu:** note "N ngôn ngữ"; nhiều `dist/index-<loc>.html`; 2 path `-h5` (st:GW-881).
- **Đầu vào:** bản dịch chính thức (nếu không có, tự dịch phải BÁO — st:GW-909 "câu 22 = chữ ID/TH tự dịch") · font có glyph CJK/TH.
- **Đường nhanh:** dựng 1 locale chuẩn → nhân bản theo khối → kiểm cmap subset → ui-check từng locale.
- **Cổng:** `/ui-check` mọi locale × PC/MB (GW-909 "PASS 3 locale × PC/MB/820/740") · `data-lang` cả bản CDN.
- **Bẫy:** mem:landing-da-locale-dich-font-cjk · mem:data-lang-phai-kiem-ca-ban-cdn · mem:repo-dung-chung-nhieu-phien (thay chuỗi bundle đa locale khoá theo khối) · link đổi ngôn ngữ trỏ `index-<loc>.html` 404 là việc BE route (mem:gw-909).
- **Tự chạy:** DUYỆT (dịch + font).
- **Effort:** GW-881 12c/9d (2 folder) · GW-901 32c/7d (git:).

### 13. Source tĩnh / bundle đối tác (không có PSD)
- **Ví dụ:** GW-779 (pre-register ANANTA, build NetEase legacy, gỡ dấu vết global + gắn nhận diện VNG), GW-813 (6 trang worldbuilding, "đối tác giao FULL SOURCE TĨNH").
- **Tín hiệu:** campaign chứa `pc/` + `mobile/dist/` hoặc bundle webpack sẵn; không có `config.js` cdn-source chuẩn (suy); `_phaseNote` "task UPDATE trên source đã có, spec là slides GS".
- **Đầu vào:** asset nhận diện VNG (logo 18+, NetEase) · danh sách dấu vết phải gỡ · subpath deploy.
- **Đường nhanh:** sửa thẳng source (bundle không minify) — bỏ hướng override runtime (st:GW-779 20/8).
- **Cổng:** đo trên subpath thật · hash CDN == local trước recheck.
- **Bẫy:** mem:source-tinh-doi-tac-chay-o-subpath (Vite base "/") · chữ Anh nung trong PNG, FE không sửa được (mem:gw-813, 23 bug Fubao) · CORS API đối tác (CQLLC #6/#8 bỏ hẳn).
- **Tự chạy:** NGƯỜI — không có spec máy đọc được, mỗi bundle một kiểu.
- **Effort:** GW-779 61c/9d · GW-813 ~68c tổng (git:).

### 14. Clone site / wiki sang Twig
- **Ví dụ:** GW-806 (clone news.3kroh.com → Twig vportal2view, "bản clone Next.js hydrate hỏng").
- **Tín hiệu:** paths có `vportal2view` + campaign `-clone`; nguồn là URL site sống.
- **Đầu vào:** danh sách route nguồn (8 route rỗng bỏ, st:GW-806) · nhóm/nhãn phải bóc từ nguồn.
- **Đường nhanh:** bóc payload/chunk/API → JSON → Twig; đo network + `innerText.length` từng popup (mem:clone-site-phai-boc-tang-chi-tiet).
- **Cổng:** hồi quy real (26/26 PASS 28/9) · không claim verify runtime Twig ở local (R-VP2).
- **Bẫy:** mem:nhan-va-cau-truc-phai-boc-tu-nguon · mem:nguon-du-lieu-clone-nhieu-tang · mem:js-cua-ban-goc-co-bug-phai-sao-y · mem:chep-tay-html-react-mat-khoang-trang · mem:render-gia-lap-tu-hong-am-tham · hidden bị skin đè chỉ lộ trên dev.
- **Tự chạy:** NGƯỜI.
- **Effort:** GW-806 58c/9d (git:).

### 15. Task con fix bug của task cha
- **Ví dụ:** GW-950 (cha GW-901), GW-952 (cha GW-909), GW-958 (cha GW-918), GW-963 (cha GW-890, nhưng là đổi cơ chế — loại 7).
- **Tín hiệu:** `st.parent` có giá trị; `paths` rỗng (st:GW-950/952/958); description trống hoặc chỉ link sheet.
- **Đầu vào:** link buglist (GW-952 "Chưa có description/link buglist") · paths kế thừa từ cha.
- **Đường nhanh:** kế thừa paths + gameplay của cha → loại 9/10.
- **Cổng:** như loại 9 + bàn giao lại folder gt của cha.
- **Bẫy:** sheet không BugID (les 2026-10-19) · autoclose (les 2026-09-21).
- **Tự chạy:** AUTO nếu có sheet chuẩn; hiện router trả `flow:null` vì thiếu `campaignDir` (router.mjs:17) — xem B.
- **Effort:** GW-950 = 1 lượt (3 bug Done 19/10, mem:gw-950).

### 16. Bàn giao gt-promotion / new-mainsite / vportal2view
- **Ví dụ:** GW-909 (gt develop 202 file), GW-863 (prettier khớp bản cũ), GW-525 (R-HO-5), GW-720 (chỉ đổi link CDN), GW-777 (kênh portal vportal2view).
- **Tín hiệu:** `st.paths` có repo `gt-promotion-template` / `new-mainsite` / `vportal2view`; `promoFolder`; phase `deliver`.
- **Đầu vào:** folder nexus đúng (GW-886 "chưa có folder gt-promotion 62834") · nửa nào deploy (mem:nua-nao-la-ban-deploy-phai-do).
- **Đường nhanh:** chỉ giao `mainsite/` HTML + `dist/assets` (R-HO-12, mem:gt-promotion-format-va-chi-mainsite) → `pm-gate --baseline none` từng locale → commit đúng path → hỏi push.
- **Cổng:** `pm-gate --baseline none` 0 🔴 · `/check-promotion` · URL CDN tuyệt đối (R-HO).
- **Bẫy:** les:"gt-promotion-template sống ở nhánh develop" (so master báo oan) · mem:cms-vportal-release-tung-file · mem:host-dev-vportal-la-zing-vn · mem:data-lang-phai-kiem-ca-ban-cdn.
- **Tự chạy:** DUYỆT (push luôn hỏi — CLAUDE.md Git). Flow hiện không có stage này (B).
- **Effort:** thường 1 commit gt / đợt (st:GW-888, GW-909).

### 17. Mainsite / skin đang chạy production (+ mainsite Next)
- **Ví dụ:** GW-882 (TotalFootball renew — clone `skin-2026-renew`, cấm đụng `skin-2026` live), GW-627 (LAN mainsite popup theo lịch nhân vật, release tới 14/12), GW-855 (buglist mainsite X5), mainsite-next ovensmash (mem:mainsite-next-ovensmash-trang-thai, không có GW-key).
- **Tín hiệu:** path `products/<game>/skin-*` hoặc `<năm>-mainsite`; repo `new-mainsite`.
- **Đầu vào:** bản live hay bản renew · block CMS nào (mem:cms-mainsite-block-config) · locale chờ design (GW-882 EN/ID/TH 26/10).
- **Đường nhanh:** clone ra bản mới, làm nhánh riêng (mem:khong-sua-skin-dang-chay-truoc-design) → push dev `<slug>-test`.
- **Cổng:** `/ui-check` · đối chiếu game khác cho block CMS · `/website-audit` nếu lên production (suy).
- **Bẫy:** mem:khong-sua-skin-dang-chay-truoc-design (user bắt rút lại 7/10) · mem:framework-truoc-port-cu (Next) · mem:lib-132-khe-751-768-scalewidthmb-750.
- **Tự chạy:** NGƯỜI (rủi ro đụng live).
- **Effort:** GW-627 22c/11d · GW-855 14c/7d · GW-882 1c/1d tới 20/10 (git:).

### 18. Biến thể / đa kênh của landing có sẵn
- **Ví dụ:** GW-844 (Gunny PC /daitiecsinhnhat17 + bản UA 4 kênh; đo thật: URL đã HTTP 200, bản UA chỉ khác 28 dòng layout twig vportal2view, st:GW-844); GW-760 (V2 landing tĩnh dựng cạnh v1, không đụng v1).
- **Tín hiệu:** URL PM đưa đã tồn tại (curl 200); có tiền lệ bộ `-GG,-FB,-KW` cùng campaign.
- **Đầu vào:** link tải từng kênh · có cần design mới không (GW-844 "Thiết kế em sẽ gửi lại 22/09").
- **Đường nhanh:** curl đo URL trước → sửa twig/layout, không dựng campaign mới.
- **Cổng:** curl từng biến thể · `/ui-check`.
- **Bẫy:** đoán repo sai ("Repo ứng viên CHƯA confirm", st:GW-844).
- **Tự chạy:** DUYỆT (suy: thay href là cơ học, nhưng chọn repo phải xác nhận).
- **Effort:** GW-844 3c/3d · GW-760 6c/2d (git:).

### 19. Thiếu design / chờ design · assignee mơ hồ · tooling nội bộ (nhóm "không vào luồng code")
- **Chờ design:** GW-905 (`waiting-design`, subtask GW-919 Review design To Do), GW-912 (design đổi sang Drive, link SharePoint thành "CŨ", subtask GW-913 To Do), GW-747 (subtask GW-748 To Do tới mốc), GW-918 (popup_reward/history "dựng tạm"). Đường: `/check-design` → block gửi PM; landing MỚI được dựng khung trước (mem:spec-truoc-khi-code-du-khong-co-anh), skin live thì không (loại 17). Tự chạy: AUTO phần soát + dừng.
- **Assignee mơ hồ:** GW-901 ("Người làm chính: AnNLB" trong khi assignee là mình), GW-905 ("HTML ghi VuNBPP"). Đường: hỏi user 1 câu trước khi chạy; ticket `reassigned` thì bỏ hẳn khỏi timeline (mem:theo-doi-task-xong-toi-release). Tự chạy: NGƯỜI.
- **Ticket đóng ở mốc HTML:** GW-610 Jira đóng 29/7 khi test 7/8, release 20/8 còn phía sau (les:"ticket-dong-o-moc-html-van-con-moc-test-release-phia-sau") — radar phải giữ tới mốc muộn nhất.
- **Tooling nội bộ:** GW-856 fx-library (`products/tontagent/`, 34c/7d) — dùng `test-driven-development` + `verification-before-completion` (CLAUDE.md routing), không qua flow landing; mem:bo-qua-tontagent-browserpilot-trong-cdn-source.

---

## B. Khoảng trống so với router hiện tại

Router hiện có 5 luật (`flows/router.json`): sheet → buglist; `phase=bugfix` → buglist; PSD chưa cắt + campaign chưa có → landing-new; có design + campaign có → landing-fix; briefText + campaign có → feature. Tín hiệu chỉ gồm `inputIsSheet, phase, campaignExists, hasRawDesign, hasDesign, hasCutAssets, briefText` (sig:). Cổng `buglist.gates` chỉ có `build`; `landing-new.gates` = build/pm-gate/fe-gate/landing-parity/layout-gate (flow:).

| # | Khoảng trống | Ticket chứng | Đề xuất |
|---|---|---|---|
| G1 | Không có tín hiệu `parent` ⇒ subtask paths rỗng, router trả `flow:null` (router.mjs:17) | GW-950/952/958/963 | Signal `parentKey`; `campaignDir` kế thừa `issues[parent].paths`. Luật `{flow:"buglist", all:["hasParent","hasBugSheet"]}`; `hasParent && !hasBugSheet` ⇒ `ask` |
| G2 | Không có stage bàn giao + `/check-promotion` + `pm-gate --baseline none`; buglist chỉ gate `build`, không `ui-check` | GW-888/909/525 | Thêm stage `handoff` (sinh `mainsite/` → pm-gate baseline none từng locale → commit path gt) vào landing-new/landing-fix/buglist; buglist thêm `ui-check` + `pm-gate` khi diff chạm `pm__` |
| G3 | Không có luồng clone-reskin; field `cloneFrom`/`cloneRef` chưa được đọc ⇒ đi nhầm landing-new (cut+spec thừa) | GW-720/805/863/747 | Signal `cloneSource`; flow `landing-clone`: copy → rename (R-STR) → swap-assets → build-optimize → sync-optimized-names → landing-parity → ui-check → handoff (đổi link CDN) |
| G4 | Sheet Google vs Excel SharePoint gộp 1 signal; writer ghi ngược khác nhau; sheet thiếu BugID mù | GW-813/745/956, GW-950 | Tách `sheetKind: google|excel`; stage `write-sheet` chọn writer (extension Chrome / `bug-sheet-tick.py` / block dán tay); gate trước `intake`: có cột BugID hoặc `No.` — không có ⇒ `ask` |
| G5 | Design chỉ được nhận từ `designs/<KEY>/` và `brief.md`; bỏ `st.designLink` (Figma/Drive/SharePoint chưa tải) và phase `waiting-design` | GW-912/905/796 | Signal `designLinkPending`; luật `phase=waiting-design` hoặc `designLinkPending` ⇒ flow `design-intake` (tải → `/check-design` → block PM → dừng) |
| G6 | Đổi cơ chế gameplay không có luồng; `feature` đòi `briefText`, ticket GW-963 description trống | GW-963/747 | Signal `gameplayChanged` (note gameplay ≠ `target`/khoá); flow `gameplay-change`: relock → kit-diff → implement → pm-gate gameplay mới → check-promotion → handoff; luôn dừng ở `approve-plan` |
| G7 | Ticket nhiều campaign: signal chỉ lấy path đầu | GW-745/723/813 | `campaignDirs[]` + fan-out theo campaign (trần 5 lane, làn rời file) |
| G8 | Không chặn ghi lên skin/mainsite đang live | GW-882 | Luật cấm: path khớp `skin-*` / `*-mainsite` và không có hậu tố `-renew` ⇒ `manual` |
| G9 | Không có bước chẩn đoán BE-drift trước khi fix | GW-477/727/745 | Stage `drift-check` đầu buglist khi paths có gt-promotion: diff live ↔ `mainsite/` ↔ source, bug drift ⇒ note routing, không vào lane |
| G10 | Loại NGƯỜI (source đối tác, clone site, Next, tooling) không có lối thoát rõ | GW-779/813/806/856 | Luật `manual` cuối danh sách: paths có `vportal2view` + `-clone`, `pc/`+`mobile/dist/`, `tontagent/` ⇒ trả `flow:"manual"` kèm lý do thay vì rơi vào `feature` |

---

## C. Hỏi trước khi chạy (≤3 câu/loại)

1. **Landing mới PSD:** (a) Gameplay là gì — khoá theo cặp AI-RULES nào? (b) Font trong PSD đã có file chưa? (c) Folder gt-promotion/nexus đích?
2. **Landing mới Figma:** (a) Node-id frame PC/MB? (b) Vùng nào là data-bind (lấy `textLive`)? (c) Gameplay như loại 1.
3. **Clone-reskin:** (a) Campaign nguồn chính xác? (b) HTML giao hàng giữ zero-edit (đồng bộ tên output) hay giao mới? (c) Chỉ thay ảnh hay đổi cả chữ/quà?
4. **Template cho PM:** (a) Phần nào PM được tự đổi khi clone? (b) Mẫu tham chiếu thuộc game nào?
5. **Nhiều landing/1 ticket:** (a) Game ↔ folder `products/` (đo bằng `config.js`, không đoán)? (b) Design của game nào nằm ở ticket anh em?
6. **Cụm ticket cùng event:** (a) Thứ tự làm theo mốc release? (b) Font/icon quà dùng chung từ đâu?
7. **Đổi cơ chế gameplay:** (a) Gameplay mới là gì, có nguồn bằng chữ (Jira/chat)? (b) Hook BE cho cơ chế mới đã có tên chưa? (c) Bỏ/thêm popup nào?
8. **Sửa sau bàn giao:** (a) Ảnh/chỗ sửa cụ thể? (b) Bản gt-promotion có ai sửa tay sau lần giao cuối?
9. **Buglist Google Sheet:** (a) Tab nào, cột BugID/Bug Type có đủ? (b) Lọc bug theo Assign/Vùng nào là của mình?
10. **Buglist Excel:** (a) Sheet nào của mình? (b) Ghi ngược bằng Graph API hay xuất block dán tay? (c) QC đang test bản CDN nào (đã deploy chưa)?
11. **BE drift:** (a) URL live đang chạy? (b) Nửa nào (`mainsite/` hay `promotion/`) là bản deploy?
12. **Đa locale:** (a) Có bản dịch chính thức cho mọi locale không — không thì được tự dịch và báo? (b) Font có glyph locale đó?
13. **Source đối tác:** (a) Subpath deploy? (b) Danh sách nhận diện VNG phải gắn / dấu vết phải gỡ? (c) Asset chữ nung sẵn ai cấp bản VN?
14. **Clone site/wiki:** (a) Danh sách route bắt buộc / được bỏ? (b) Đồng bộ dữ liệu với gốc định kỳ hay không?
15. **Task con fix bug:** (a) Link buglist? (b) Kế thừa paths của cha có đúng không?
16. **Bàn giao:** (a) Folder nexus đích đã tồn tại chưa? (b) Giao HTML hay chỉ đổi link CDN?
17. **Mainsite/skin live:** (a) Sửa bản live hay clone bản renew? (b) Block CMS nào, push nhánh dev nào?
18. **Biến thể/đa kênh:** (a) URL đã tồn tại chưa (curl)? (b) Repo đích (cdn-source vs vportal2view)? (c) Link tải từng kênh?
19. **Chờ design / assignee:** (a) Mốc design thật là ngày nào? (b) Người làm chính là mình hay người ghi trong description?

---

## D. Luật chuyển phase (user chốt 20/10/2026)

**Dây chuyền hiện có** (`agent-auto/skills/daily/SKILL.md:39-41`): `waiting-design → ready → coding → deliver (chỉ task có kênh promotion) → wait-test → bugfix → done-fe`; rẽ nhánh `reassigned`, `closed`. Các luật liên quan đang có: phase chỉ TIẾN khi có bằng chứng (`:50-51`); task thuần mainsite `coding → wait-test` (`:49`); `/daily done` chuyển `coding|deliver → wait-test` (`:227-228`); `bugfix` chỉ khi `bug-radar scan` ra dòng chưa settled (`:286-294`); git chỉ NÂNG phase, không hạ (`:389-390`); autoclose `closed` khi hết mốc tương lai + Jira done (`:70-72`).

**Luật mới:**
1. Jira `COMPLETED` hoặc comment "push code rồi" mà **mốc test chưa qua** hoặc **chưa có buglist** ⇒ `phase = wait-test`. KHÔNG nhảy thẳng `done-fe`.
2. `done-fe` CHỈ khi một trong hai:
   - mốc test đã qua **VÀ** `bug-radar scan` mọi `bugSheets` không còn dòng chưa settled;
   - hoặc bug đã tách sang ticket con (`issues[*].parent == KEY`), cha giao phần canh bug cho con.

**Ca thật:**
- GW-881 — sai: delta 5/10 ghi "Phase coding → done-fe" chỉ vì Jira COMPLETED 2/10 trong khi release 22/10 còn phía trước (st:GW-881 lastAction). User sửa về `wait-test` 20/10 (theo coordinator; state.json lúc đọc vẫn còn `done-fe`).
- GW-901 — đúng: `done-fe` hợp lệ vì bug đã tách sang GW-950 (`st:GW-950.parent = GW-901`, đang `bugfix`).

**Chỗ cần thêm vào `skills/daily/SKILL.md`:**
- Sau `:51` (cuối gạch "Phase chỉ TIẾN khi có bằng chứng thật"): chèn luật 1-2 làm định nghĩa chung của `wait-test`/`done-fe`.
- `:227-228` (`/daily done`): chỉ được ghi `wait-test`; ghi rõ "cấm `done-fe` ở bước này".
- `:389-390` (Bước 2b, git chỉ nâng phase): thêm "Jira COMPLETED không phải bằng chứng để nâng lên `done-fe`".
- `:292-294` (bug-radar → bugfix): thêm chiều ngược `bugfix → done-fe` theo luật 2 (scan sạch + mốc test đã qua).
- Router (B): signal `phase=done-fe` nên bị `state-doctor` soát lại theo luật 2 (suy).

---

## E. Route thật sau khi vá G0–G10 (20/10/2026, `node tools/autopilot.mjs route <KEY>` trên state.json thật, chỉ đọc)

Thứ tự luật (`flows/router.json`): an toàn trước (paths chưa confirm → ask · skin live / clone site / source đối tác / tooling → manual · >5 campaign → ask · assignee mơ hồ → ask) → buglist/đổi gameplay/task con → phase chờ (manual) → design-intake → clone → landing-new/fix → feature → **manual cuối** (không còn "không luật nào khớp"). Khớp luồng mà thiếu đầu vào → `ask` theo khối `ask` (≤3 câu) của chính luồng đó.

| Ticket | Kết quả | Lý do (tín hiệu) |
|---|---|---|
| GW-950 | ask (buglist) | task con GW-901, kế thừa paths + sheet Google; note "không có cột BugID" ⇒ cổng G4 hỏi thêm cột/định danh bug |
| GW-952 | ask | task con GW-909, chưa có buglist ⇒ hỏi link buglist + paths cha có đúng không |
| GW-958 | ask | task con GW-918, chưa có buglist ⇒ như GW-952 |
| GW-963 | gameplay-change | note "đổi cơ chế sang khuyến mãi nạp"; kế thừa campaign GW-890 (đã khoá luckydraw) ⇒ relock → diff kit → dừng approve-plan |
| GW-956 | ask | `pathsConfirmed=false` (paths mượn GW-813, 7 path > trần 5 lane) ⇒ hỏi folder thật trước khi đụng Excel buglist |
| GW-912 | landing-fix | design đã tải + đã cắt (`_auto-export`), campaign scaffold có sẵn, gameplay khoá trong file dự án |
| GW-905 | ask | note "HTML ghi VuNBPP" ⇒ hỏi người làm chính trước (nếu là mình: phase waiting-design ⇒ design-intake) |
| GW-882 | landing-fix | path `skin-2026-renew` (bản clone, không phải skin live) + design đã cắt; không phải landing ⇒ không đòi khoá gameplay |
| GW-884 | landing-fix (+handoff) | phase deliver, design đã cắt, gameplay khoá; path gt-promotion ⇒ handoffDir: chạy stage handoff + pm-gate `--baseline none` + check-promotion |
| GW-918 | manual | phase wait-test, chưa có buglist ⇒ chưa có việc code (con GW-958 sẽ nhận buglist) |
| GW-881 | manual | phase wait-test (luật D), chưa có buglist |

An toàn (G0): mọi stage có repo chạy trong `runs/<KEY>/<runId>/wt/<repo>` (nhánh `autopilot/<KEY>-<runId>`); commit chỉ trong worktree, `git pull` + commit repo thật + `write-sheet` chỉ bật khi `AUTOPILOT_LAB_WRITES=1`. `design-intake` không đụng repo (`usesRepo: false`).
