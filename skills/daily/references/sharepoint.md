# Tra cứu: dò/tải design từ SharePoint (và các nguồn khác)

Cắt nguyên văn từ `SKILL.md` (gọn hoá lần nâng cấp 2026-08-03) — toàn bộ cơ chế dò/tải design:
`download.aspx?SourceUrl=`, Graph/REST listing, script pipeline `scripts/sp-*`, và danh sách các
cách KHÔNG ăn (đã thử, đừng lặp lại). `SKILL.md` giữ lại luật nghiệp vụ "design đã giao chưa"
(4 mức trạng thái) và các quyết định phase/báo cáo user — chi tiết kỹ thuật tải file nằm ở đây.

- **Dò design qua SharePoint** (verify 2026-07-30): `mcp__claude_ai_Microsoft_365__sharepoint_search`
  với `query` = TÊN EVENT/GAME (vd "Rừng Thu Kỳ Bí") — thấy được cả file OneDrive cá nhân
  người khác đã share (designer thường up `<tên-event>.zip`). Trúng → ghi tên file + webUrl +
  `lastModifiedDateTime` vào brief. **Ngày modified ≥ mốc "Design" = design ĐÃ GIAO** (phase `ready` chỉ set SAU khi tải được ảnh về local — xem dưới).
  `sharepoint_folder_search` KHÔNG thấy folder chưa từng mở — miss thì ghi link gốc +
  📎 "mở tay 1 lần (mở xong search sẽ index)" — ⚠ verify 31/7: `open` link folder bằng browser
  KHÔNG làm search index ngay (thử với folder design GW-654, mở rồi search lại vẫn trắng) →
  index là việc của SharePoint theo lịch, ĐỪNG mở-rồi-chờ-search; cách chắc cho folder chưa
  index là user mở + bấm Download (nấc 2 nhặt). Ảnh rời MCP tải được → lưu thẳng
  `designs/<KEY>/`. Zip/psd MCP KHÔNG tải được → chạy TẢI TỰ ĐỘNG 2 nấc (dưới).
- **TẢI DESIGN TỰ ĐỘNG (zip/psd — idempotent, state là cache, đĩa là sự thật):**
  - **Chốt skip TRƯỚC — theo COVERAGE, không theo "có file hay không":**
    `state.issues[KEY].design.downloadedAt` có VÀ `node scripts/sp-coverage.mjs
    <manifest> designs/<KEY>` **exit 0** → BỎ QUA tải, board 1 dòng "design đã có local (N/N file)".
    ⛔ Điều kiện cũ ("folder còn file thật") là **cái đã biến miss thành vĩnh viễn**: tải 8/56
    file cũng thoả, nên mọi lần `/daily` sau đều skip và 48 file thiếu không bao giờ được nhắc
    lại. Không có manifest local (ticket cũ) → chạy `sp-scan.js` dựng manifest rồi mới xét.
    Coverage exit 1 → **tải bù phần thiếu**, không tải lại từ đầu. State có mà folder rỗng/mất → tải lại.
    ⚠ Coverage so LOCAL ↔ manifest CŨ nên **mù với file designer mới up** (nguồn đổi mà coverage
    vẫn exit 0) — câu "nguồn có bản mới không" là của `tools/sp-diff.mjs` (NGUỒN ↔ NGUỒN), chạy
    qua `/daily designwatch`; đừng lấy coverage exit 0 làm bằng chứng "design không đổi". `lastModifiedDateTime`
    mới > `design.sourceModified` đã lưu → designer up BẢN MỚI (cùng link — SharePoint đè
    file): tải lại vào `designs/<KEY>/_raw/v2/` (v3, v4… nếu đổi tiếp) rồi chạy **SO BẢN
    CŨ ↔ MỚI** (dưới), KHÔNG tự xoá bản cũ.
  - **SO BẢN CŨ ↔ MỚI (chỉ khi có bản mới):** giải nén v2 xong, so từng file với bản đang
    dùng trong `designs/<KEY>/` — theo TÊN + hash bytes (`shasum`) + kích thước ảnh
    (`sips -g pixelWidth -g pixelHeight`): phân loại **ĐỔI** (cùng tên khác hash — ghi rõ
    đổi kích thước nếu có) / **MỚI** / **XOÁ** / giữ nguyên. Kết quả:
    1. Backup ảnh hiện tại vào `_raw/prev-<ngày>/` → promote ảnh v2 lên `designs/<KEY>/`
       (kho luôn là bản MỚI NHẤT, bản cũ không mất).
    2. Ghi bảng diff vào brief + board + ⚠️ ĐẦU báo cáo: "design đổi bản: N ảnh đổi
       (tên + kích thước cũ→mới), M mới, K xoá".
    3. Task đã `coding`/xong UI → đề xuất trong kế hoạch: ảnh ĐỔI → `/code-developer
       compare` (so code hiện tại với ảnh mới, chỉ ra lệch) rồi `fix`; chỉ thêm ảnh MỚI
       → `code`/`fix` phần thêm. Task chưa code → chỉ cần dùng bản mới, không việc gì thêm.
       Cập nhật `state.design.sourceModified` = bản mới (đã xử lý xong thì thôi cảnh báo lại).
  - **Nấc 1 — `open` URL TẢI TRỰC TIẾP bằng browser mặc định (cách CHỐT, verify thật 31/7:
    tải trọn 400MB ~140s, KHÔNG hỏi nơi lưu, KHÔNG cần extension, KHÔNG dính account Claude
    — chạy được cả khi browser login `tont@` mà phiên CLI là account khác):**
    ```
    open -a "<browser mặc định>" "<direct-url>"   # browser của user, đã login sẵn SSO
    ```
    Browser mặc định = `LSHandlers`/`LSHandlerRoleAll` cho scheme `https` trong
    `~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist`
    (máy user 31/7 = `com.microsoft.edgemac`). Browser đó phải là browser user vẫn dùng để
    vào SharePoint/Drive — bằng chứng đã login: có `account_info` trong `Preferences` của
    profile (Edge có, Chrome trên máy này RỖNG → đừng chọn Chrome dù nó có cài).
    - **SharePoint/OneDrive business (kênh chính):**
      `https://<tenant>-my.sharepoint.com/personal/<owner>/_layouts/15/download.aspx?SourceUrl=<path urlencode>`
      với `<path>` = phần path của `webUrl` do `sharepoint_search` trả về (bỏ host). CÁCH
      KHÔNG ĂN, đừng thử lại: `<webUrl>?download=1` (tab trắng) · share link folder
      `/:f:/g/personal/…&download=1` (SharePoint bỏ qua param) · MCP `read_resource`
      (chặn cứng >100MB, design zip thường 300-400MB).
    - Nguồn khác: xem bảng **URL tải trực tiếp theo nguồn** dưới. Nguồn không có direct URL
      (Canva/Figma/ổ mạng) → bỏ nấc 1, giữ luật 📎 mở tay.
    - **AN TOÀN trước khi `open`:** pin cứng browser Chromium (Edge/Chrome) — **KHÔNG dùng
      `open` trần / Safari** (Safari "Open safe files" tự BUNG zip thành folder rồi xoá zip →
      mọi check `*.zip` fail dù tải thành công). Chỉ mở host trong allowlist
      (`*.sharepoint.com`, `drive.google.com`, `docs.google.com`, `www.dropbox.com`,
      `*.app.box.com`); host khác → DỪNG, hỏi user (link lấy từ Jira/chat mà mở vào browser
      đang login = mở với full session của user).
    - **Dựng URL chỉ từ path THẬT:** mã scope trong share link — `/:X:/r/` và `/:X:/s/` thì
      path server-relative nằm SẴN trong URL (cắt tiền tố là ra); `/g/ /t/ /u/ /p/` là token
      opaque → BẮT BUỘC resolve, KHÔNG đoán. Resolve theo 2 đường, MCP trước rồi browser:
      1. MCP `sharepoint_search`/`folder_search` (rẻ, im lặng) — nhưng hay trắng với folder
         designer share qua link vì không index cho account mình.
      2. **RESOLVE BẰNG BROWSER ĐÃ LOGIN (cách CHỐT, verify thật 31/7 với link `/:f:/g/` của
         GW-477):** `open -a "Microsoft Edge" "<share link>"` → `sleep 10` →
         `osascript -e 'tell application "Microsoft Edge" to return URL of tabs of windows'`
         → tab đó đã redirect thành `…/shared?listurl=…&id=<path urlencode>&shareLink=1`;
         **urldecode param `id=` chính là server-relative path THẬT** (ca GW-477 ra
         `/personal/tuyentln_vng_com_vn/Documents/VNGGAMES/GS9/CFL/CFL CMM - LDP Giải đấu`).
         Chỉ ĐỌC URL nên KHÔNG cần setting "Allow JavaScript from Apple Events" (setting đó
         tắt trên máy user — `execute javascript` fail, đọc URL vẫn chạy). Dùng path này để
         dựng `download.aspx` cho từng FILE con.
      ⛔ **KHÔNG dùng `screencapture` để đọc listing folder** — ảnh chụp lấy luôn cửa sổ khác
      đang đè (đã trả giá 31/7: dính chat Teams + buglist của user vào transcript). Cần biết
      tên file trong folder mà 2 đường trên đều trắng → nhờ user, đừng chụp màn hình.
      Mã loại: `:f:`=folder · `:u:`=zip/khác · `:w: :x: :p: :b: :i: :v:`=office/pdf/ảnh/video.
      Encode đủ: space→`%20`, `%`→`%25`, `#`→`%23`, `&`→`%26`, `+`→`%2B`; `_layouts` phải
      thuộc ĐÚNG site collection chứa file; library của OneDrive business LUÔN là `/Documents`
      (dù UI hiện "My files"). Teams chat file: luôn resolve, đừng đoán đường
      `Microsoft Teams Chat Files`.
    - **Chờ xong rồi mới verify:** trước khi `open` đặt mốc `T0=$(mktemp)`. Xong = KHÔNG còn
      `*.crdownload|*.part` VÀ `stat -f%z` bằng nhau ở 2 lần đo cách 3s (timeout 120s, file
      ≥100MB 600s). Đừng verify trên `.crdownload` dù byte đã đủ — ca thật 31/7 cho EOCD
      giả âm. **Nhặt file bằng MỐC THỜI GIAN, không bằng tên:**
      `find ~/Downloads -maxdepth 1 -newer "$T0" -not -name '.*' -not -name '*.crdownload'`
      (tên lưu về hay khác dự đoán: tiếng Việt về NFD, trùng tên thành ` (1)`) → `mv` ra kho
      design NGAY + normalize tên về NFC.
    - **VERIFY BẮT BUỘC — KHÔNG tin kích thước** (ca thật 31/7: file về đúng 400.257.088 byte
      khớp size Graph báo, hash 2 lần tải giống nhau, NHƯNG zip thiếu EOCD vì bản trên
      SharePoint hỏng — psd bên trong 437MB > cả zip, method=store không nén). Đủ 4 điều kiện:
      `file --mime-type` ≠ `text/html`/`inode/x-empty` · 512 byte đầu KHÔNG chứa
      `<!doctype html|<html|Sorry, something went wrong|Request access|Sign in` · magic bytes
      khớp đuôi (`504b0304` zip/docx, `89504e47` png, `ffd8ff` jpg, `25504446` pdf,
      `38425053` psd) · size > 1024. Zip thêm `bsdtar -tf` phải SẠCH ("Truncated ZIP file
      data" = nguồn hỏng/tải cắt). ⚠ `unzip -O UTF-8` KHÔNG TỒN TẠI trên macOS (Info-ZIP bản
      Apple) → luôn `bsdtar -xf`.
      Fail → xoá file rác, thử fallback KẾ TIẾP đúng 1 lần (`&download=1` / `?UniqueId=<guid>`
      / Drive `&confirm=t`); fail lần 2 hoặc ra hash y hệt = **LỖI TẠI NGUỒN** → BỎ CUỘC,
      KHÔNG đoán URL mới, **TUYỆT ĐỐI KHÔNG ghi đè bản design đang có local**, báo 1 dòng
      "⚠ file trên nguồn hỏng/thiếu — nhờ designer up lại" rồi giữ nguyên bản cũ.
      CHƯA in output verify thì KHÔNG được nói "đã tải xong".
    - Dọn tab đã mở sau mỗi file (`osascript` close tab), tối đa 3 tab tải cùng lúc.
      ⚠ Ngưỡng cũ "folder ≥8 file → nhờ user bấm Download as zip" **chỉ còn áp dụng khi REST bị
      chặn**. Có REST thì `sp-fetch.js` phát lệnh hàng loạt trong 1 tab, không tốn tab nào —
      56 file cũng chạy được. (Ngưỡng này từng bị bỏ qua lặng lẽ ở GW-556 vì nó nằm ở nấc 1 còn
      đường đang đi là REST — nay 2 đường dùng chung 1 tiêu chí đủ: `sp-coverage` exit 0.)
      Fail bất kỳ bước → nấc 2, KHÔNG chặn pipeline.
    - ⛔ **FOLDER KHÔNG CÓ URL TẢI — chốt lần 2 (verify 31/7 với path THẬT đã resolve của
      GW-477):** `download.aspx?SourceUrl=<path FOLDER>` chạy xong 18s không có file nào về
      `~/Downloads`. Đừng thử biến thể khác cho folder. Ca **link design là FOLDER mà không
      liệt kê được tên file con** (MCP không index + không được chụp màn hình) → đường duy
      nhất: mở sẵn tab folder bằng `open -a "<browser>" "<share link>"`, ghi việc cần user
      ĐÚNG 1 dòng — "GW-xxx: tab design đã mở, bấm chọn all → **Download** (cứ để nguyên
      trong `~/Downloads`, lần /daily kế tôi tự nhặt + giải nén)" — rồi ghi trạng thái
      `đã-giao-chưa-tải` và ĐI TIẾP, không chặn pipeline, không hỏi lại giữa luồng.
    - **IDEMPOTENT ca `đã-giao-chưa-tải` (đừng spam tab/thử lại):** ghi kèm
      `design.lastAttemptAt`. Lần chạy sau, ticket có `status = đã-giao-chưa-tải` thì thứ tự là:
      (1) dò `~/Downloads` (nấc 2) xem user đã bấm Download chưa → có thì nhặt, xong, xoá
      `blockedBy`; (2) chưa có VÀ `lastAttemptAt` trong vòng 24h → **KHÔNG mở lại tab, KHÔNG thử
      lại URL nào**, chỉ nhắc lại 1 dòng trong khối "Cần bạn"; (3) quá 24h → mở lại tab đúng 1
      lần (biết đâu designer đã đổi cách share) rồi cập nhật `lastAttemptAt`.
    - Extension Claude in Chrome: **ĐƯỢC dùng, và là đường chính cho REST + tải hàng loạt**
      (verify 3/8/2026: quét đệ quy 56 file + phát 24 lệnh tải, ăn thật). Ghi chú cũ "không dùng
      extension để tải file" là ca **lệch account 31/7**, không phải giới hạn của extension —
      khi `/chrome` nối đúng browser của máy này thì `javascript_tool` chạy `fetch`/`a.click`
      bằng đúng session SSO của user, không cần clipboard, không cần bàn phím, không chiếm màn
      hình. Kiểm 1 câu trước khi tin: `tabs_context_mcp` phải trả tab của **máy này**.
  - **Nấc 2 — dò `~/Downloads`:** tìm **FILE HOẶC FOLDER** khớp tên đã thấy qua SharePoint
    search (khớp chính xác trước, fuzzy tên event bỏ dấu sau) mtime ≤7 ngày → nhặt luôn,
    không hỏi. Dò cả **2 cấp folder con** (verify 31/7 qua lịch sử download: user hay
    Save As vào subfolder theo dự án, vd `~/Downloads/Game-Landing/<event>/`). Folder = user đã tự giải nén (2 ca thật 31/7: `cfl-rungkibi`,
    `DDTank - LDP Chengdu Tournament`) → move nguyên folder vào `_raw/`, bỏ bước giải nén.
    Nén `.7z`/`.rar` → cần `7z`/`unar` (kiểm `command -v`), thiếu thì ghi "Cần bạn: giải tay".
    Không thấy → "Cần bạn: tải tay — tải xong CỨ ĐỂ TRONG Downloads, lần /daily kế tôi
    tự nhặt" (user khỏi giải nén/move).
  - **Có file (chung 2 nấc):** move vào `designs/<KEY>/_raw/` → giải nén
    (`bsdtar -xf` — KHÔNG dùng `unzip -O UTF-8`, flag đó không có trên macOS; zip lồng zip →
    giải thêm đúng 1 cấp) → ảnh preview
    (jpg/png/webp) đưa lên `designs/<KEY>/` (trùng tên → giữ bản mới hơn), PSD/AI giữ `_raw/` +
    liệt kê tên vào brief → VERIFY đếm file thật rồi mới ghi brief + board ("đã tải & giải
    nén: N ảnh preview, K PSD") → ghi `state.issues[KEY].design =
    {downloadedAt, sourceFile, sourceModified, files:{previews,psd}, manifest?, lastScanAt?,
    scanDue?, sourceChanged?}` (`lastScanAt/scanDue/sourceChanged` do delta bước 5 +
    `designwatch` ghi — xem SKILL.md). KHÔNG
    xoá gì khác trong `~/Downloads`.
  - **Tải ALL hay chỉ file update?** Nguồn là **ZIP** → zip là 1 khối, bản mới = tải
    nguyên zip mới (1 file, rẻ) — selective nằm ở khâu SO CŨ↔MỚI sau giải nén (chỉ file
    ĐỔI/MỚI thành việc). Nguồn là **FOLDER nhiều file rời** → manifest là **ảnh chụp CÂY NGUỒN**
    do `sp-scan.js` sinh (`~/Downloads/sp-manifest-<KEY>.json`, chép vào `designs/<KEY>/`), KHÔNG
    phải danh sách file mình đã lấy. ⛔ Ghi manifest = tập đã tải là lỗi đã mắc ở GW-556: lần sau
    so "manifest ↔ nguồn" chỉ thấy 8 file đó có đổi hay không, **không bao giờ lộ ra 48 file
    chưa từng tải**. Lần sau CHỈ tải file `modified` mới hơn manifest hoặc chưa có local
    (`sp-coverage --todo` lo cả 2 ca) — KHÔNG tải lại cả folder.
    File tải về đi thẳng vào luồng SO CŨ↔MỚI như thường.
  - `phase → ready` CHỈ khi có ảnh thật trong `designs/<KEY>/` (mới "thấy trên SharePoint" chưa đủ).
  - **URL TẢI TRỰC TIẾP THEO NGUỒN** (dùng chung 1 cơ chế: `open -a "<browser mặc định>"
    "<direct-url>"` → poll `~/Downloads` → verify magic bytes; browser mặc định đọc từ
    LSHandlers của `com.apple.launchservices.secure.plist`, máy user 31/7 = `com.microsoft.edgemac`):
    | Nguồn | URL tải trực tiếp (1 FILE) | Trạng thái |
    |---|---|---|
    | SharePoint / OneDrive business / file Teams chat | `https://<tenant>[-my].sharepoint.com/<personal/<owner>\|sites/<site>>/_layouts/15/download.aspx?SourceUrl=<path urlencode>` | ✅ verify 31/7 (400MB, 2 lần hash y hệt) |
    | Share link SharePoint dạng FILE `/:u:/` (và `:x: :w: :p:`) | link gốc giữ nguyên `?e=…` + `&download=1` | doc — `/:f:/` (folder) thì KHÔNG ăn (đã thử) |
    | Google Drive (file nhị phân) | `https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t` (hoặc `drive.google.com/uc?id=<ID>&export=download`) — ưu tiên **MCP Google Drive** trước, dựng URL khi MCP không thấy | ✅ verify 31/7 (PNG 1MB, 4 giây) |
    | Google Docs/Sheets/Slides | `https://docs.google.com/<spreadsheets\|document\|presentation>/d/<ID>/export?format=<xlsx\|docx\|pptx\|pdf>` | ✅ verify 31/7 (xlsx 290KB) |
    | Dropbox (file VÀ folder) | link gốc giữ nguyên `rlkey` + `&dl=1` → folder ra .zip | doc (nguồn duy nhất tải được cả folder bằng 1 URL) |
    | Box | dùng **MCP Box** (`authenticate` rồi lấy link tải) — link `/shared/static/<hash>.<ext>` chính chủ thì dùng nguyên văn; KHÔNG dựng URL tay từ `/s/<token>` | doc — folder KHÔNG có |
    | Ổ mạng `X:\` (SMB) | không phải HTTP → `open "smb://<user>@<server>/<share>"` mount rồi `cp -R`/`rsync` | doc — nguồn duy nhất copy cả cây thư mục gọn |
    | Canva / Figma | KHÔNG có URL tải → giữ luật 📎 mở tay. Muốn auto thì nối **MCP chính thức** (`https://mcp.canva.com/mcp`, `https://mcp.figma.com/mcp` — OAuth mở browser 1 lần, Figma không cần PAT): tool export/download_assets trả link tải rồi `curl` về. ĐỀ XUẤT cho user, KHÔNG tự nối. | — |
    - **FOLDER (nguồn hay giao dạng folder!):** `download.aspx` và Drive `uc?export` CHỈ tải
      1 FILE; **không có URL GET nào zip được folder** (SharePoint dùng POST nội bộ
      `mediap.svc.ms/transform/zip` — không dùng được; Drive folder cũng không) → đường duy
      nhất bền: **liệt kê rồi tải từng file**. SharePoint: `sharepoint_folder_search` →
      `read_resource` trên uri folder = danh sách con (tên + size + uri từng file) → dựng
      download.aspx cho từng file (✅ verify 31/7 trên folder `CFL_Rừng Thu Kỳ Bí`).
      Drive: `search_files` với `parentId = '<folder id>'`. Dropbox thì cứ `&dl=1` lấy zip.
      ⚠ **Liệt kê chỉ ăn khi folder ĐƯỢC INDEX cho account mình** — folder designer share qua
      link thì thường KHÔNG (verify 31/7, 2 ca GW-477 + GW-654: `sharepoint_search` theo tên
      event EN/VI, theo `folderName` = tên folder thật, `folder_search` → đều trắng, dù folder
      mở bằng browser thì bình thường). Trắng = hết đường tự động cho folder đó: mở tab + nhờ
      user bấm Download (1 thao tác), ghi `đã-giao-chưa-tải`, đi tiếp. ĐỪNG vòng lại thử tiếp
      `download.aspx` trên path folder (đã verify không trả file).
      🔥 **NHƯNG TRƯỚC KHI NHỜ USER: THỬ REST LISTING BẰNG SESSION BROWSER — CÁCH NÀY ĂN THẬT
      (verify end-to-end 31/7: tải trọn 5 PSD / 370.7MB của GW-477 KHÔNG cần user bấm gì).**
      Graph/MCP mù không có nghĩa là hết đường: SharePoint REST của CHÍNH site đó vẫn trả listing
      nếu browser đã có session mở được share link.

      **QUY TRÌNH CHUẨN — 4 bước, mỗi bước có công cụ riêng trong `scripts/`, KHÔNG làm tay:**
      1. **Cấp session**: `open -a "Microsoft Edge" "<share link>"` (chỉ cần 1 lần/folder), rồi
         `navigate` **bằng chính extension Claude in Chrome** tới một URL `/_api/…` của site đó
         (tab do `open -a` mở KHÔNG thuộc MCP tab group nên extension không thấy).
      2. **QUÉT ĐỆ QUY → manifest NGUỒN**: `scripts/sp-scan.js` chạy qua
         `mcp__claude-in-chrome__javascript_tool` (sửa `KEY`/`SITE`/`ROOT` rồi dán nguyên file).
         Nó `fetch` REST bằng session của trang, đi đệ quy `/Folders`, và **tự tải
         `sp-manifest-<KEY>.json` xuống `~/Downloads`** — không nhồi listing qua context.
         🔥 **BẮT BUỘC ĐỆ QUY. `/Files` CHỈ TRẢ 1 CẤP.** Folder design gần như luôn có subfolder
         (VN/EN/TH/Fonts/PSD). Bỏ bước này là tải sót và KHÔNG BIẾT là mình sót — đã trả giá 2
         lần: GW-477 sót 48 PNG state, GW-556 tải 8/56 file (1.28% byte) mà vẫn ghi "đã tải".
         ⚠ Path phải **NFC** đúng như param `id=` của URL folder (đừng dựng lại từ tên tiếng
         Việt — dễ ra NFD và sai). Feed rỗng ở gốc là BÌNH THƯỜNG, không phải "folder trống".
      3. **TẢI**: `node scripts/sp-coverage.mjs <manifest> <designDir> --todo` sinh danh sách còn
         thiếu → đổ vào `TODO` của `scripts/sp-fetch.js` → chạy qua `javascript_tool`.
         ⚠ **Trần cứng 45s của CDP** (verify 3/8): `javascript_tool` giết script ở 45 giây và các
         lô chưa phát **mất im lặng** — lần đầu chạy 26 file mất đúng 2 file cuối. ⇒ mỗi lần gọi
         phát **≤12 file**, chia lô ở phía local. `sp-fetch.js` tự `throw` nếu TODO dài quá.
      4. **NHẶT + VERIFY**: `node scripts/sp-collect.mjs <manifest> <designDir>` nhặt từ
         `~/Downloads` theo **tên+size khớp manifest** (không đụng file lạ của user), xếp vào
         `designs/<KEY>/_src/<rel>` đúng cây nguồn, chặn file HTML login-wall + magic bytes sai.
         Rồi `node scripts/sp-coverage.mjs <manifest> <designDir>` — **exit 0 mới được nói "đã
         tải xong"**. Thiếu → quay lại bước 3 với TODO mới (idempotent, chạy lại vô hại).
         PSD → tạo preview `sips -s format png <file>.psd --out <file>.png` để có ảnh thật trong
         `designs/<KEY>/` ⇒ đủ điều kiện `phase = ready`.

      ⛔ **CẤM tự định nghĩa "đủ" theo tập mình chọn tải.** "Tổng byte khớp listing" chỉ chứng
      minh tập ĐÃ CHỌN về nguyên vẹn — nó không chứng minh đã tải đủ, và chính câu đó đã tạo
      cảm giác an toàn giả ở GW-556. Tiêu chí đủ CHỈ có một: `sp-coverage.mjs` exit 0.
      Mặc định là **TẢI FULL cả folder**. Muốn hoãn phần nào (PSD Hires vài GB) thì phải:
      ghi `design.status = đã-giao-tải-một-phần`, ghi `design.deferred` liệt kê phần hoãn +
      lý do, và **đưa 1 dòng vào khối "Cần bạn"** — hoãn có sổ nợ, không hoãn im lặng.
      ⚠ **REST có thể bị chặn theo TỪNG folder** (verify cùng ngày, GW-654): cả
      `GetFolderByServerRelativeUrl`, `GetFolderByServerRelativePath` và
      `_api/v2.0/shares/u!<base64url share link>/driveItem/children` đều trả
      `UnauthorizedAccessException`/`accessDenied` dù UI mở folder bình thường — designer share
      hẹp theo item nên session không có quyền web-level. Fail REST rồi thì MỚI nhờ user (dưới).

      **NGUYÊN NHÂN GỐC + CÁCH BẬT FULL-AUTO (điều tra dứt điểm 31/7, có bằng chứng từng mảnh):**
      cả 2 mảnh của full-auto đều CHẠY ĐƯỢC —
      (1) liệt kê: `read_resource` trên uri FOLDER trả đúng danh sách con
      (`file:///b!yx9…/01AR6VQ3OVQ5…` → `CFL_Rừng Thu Kỳ Bí.zip (file, 400257088 bytes)`);
      (2) tải từng file: `download.aspx?SourceUrl=` đã tải thật 400MB.
      Chặn duy nhất là **Graph có "thấy" folder hay không**: designer share kiểu *link* ("anyone
      with the link") thì item KHÔNG vào ACL/index của account user ⇒ mọi tool MCP đều mù. Bằng
      chứng: search `Affiliate` ra 147 kết quả của anhpnh/phuld/hoangnh11/tuch… mà KHÔNG một file
      nào thuộc `personal/tuyentln_…` (chủ 2 folder design đang vướng); ngược lại folder của
      anhpnh — người share trực tiếp — thì `folder_search` + `read_resource` liệt kê ngon.
      ⇒ Khi gặp ca folder mù, ĐỀ XUẤT ĐÚNG cho user là **đưa folder vào tầm nhìn Graph 1 lần**,
      chứ không phải bấm Download mỗi lần có bản mới:
        a. Nhờ designer Share **trực tiếp tới email user** (không dùng "anyone with link") — bền
           nhất, verify được bằng ca anhpnh.
        b. User mở link rồi bấm **"Add shortcut to My files"** — item vào drive user (root drive
           đọc được qua `read_resource file:///<driveId>/`, đã verify), từ đó skill tự liệt kê +
           tải, kể cả khi designer thêm/đổi file. ⚠ Cơ chế (b) suy từ 2 fact đã verify, CHƯA chạy
           thật end-to-end — lần đầu dùng phải verify lại rồi ghi kết quả vào memory.
      Đường đã loại, đừng thử lại: giải mã share token `Ig…` (35 byte = 1 flag + 2 GUID, KHÔNG
      chứa `driveId` dạng `b!…` mà MCP cần); extension Claude in Chrome (31/7 vẫn chỉ thấy
      `Browser 1` Windows `isLocal:false`).
    Nguồn lạ/không rõ pattern → ĐỪNG đoán URL, đi nấc 2. File tải về LUÔN verify magic bytes
    theo đuôi (`PK`=zip, `%PDF`, `\x89PNG`, `8BPS`=psd) — thấy `<!`/`<h` = trang lỗi HTML
    (login wall/hết quyền) → coi như fail, sang nấc 2, xoá file rác.
