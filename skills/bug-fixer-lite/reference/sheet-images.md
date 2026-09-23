# Ảnh trong sheet — bug-fixer-lite

> Tách từ `SKILL.md` ngày 2026-09-23 để lõi nhẹ hơn mỗi lượt. Chỉ đọc khi sheet có ảnh in-cell hoặc cột `RecommendImage`.

## ẢNH-NHÚNG trong cell — 3 nấc, KHÔNG webhook

Chỉ chạy khi có bug tham chiếu hình ("như hình", "line này") mà không có link. Cell-scan nhẹ trước, đừng chạy vô điều kiện. Ảnh lưu về `<ctx>/bugs-lite/images/<project>-<ngày>/`.

1. **Nấc 1 — Chrome screenshot (luồng chuẩn — phiên có Chrome):** mở sheet, cuộn tới row của bug, click ảnh trong cell (phóng to), screenshot lưu vào thư mục trên, map theo row đang xem. Map CHẮC NHẤT (chụp đúng ô đang nhìn) và không phụ thuộc Google lưu ảnh kiểu gì bên dưới. Chỉ làm cho bug thật sự cần ảnh (từng ảnh một).
2. **Nấc 2 — xlsx export (CHỈ khi không Chrome VÀ sheet nhỏ/ít ảnh):** ⚠ connector `download_file_content` trả base64 thẳng vào context — sheet nhiều ảnh sẽ phình context nguy hiểm, CẤM dùng cho sheet lớn. Tải xlsx qua Drive MCP (ToolSearch `select:mcp__claude_ai_Google_Drive__download_file_content`) → chạy:
   ```bash
   node <SCRIPTS>/extract-xlsx-images.js <file.xlsx> <ctx>/bugs-lite/images/<project>-<ngày>
   ```
   → mỗi **ANCHOR** 1 dòng JSON `{"name","row","col","colLetter","path"}`. Map ảnh→bug theo `row` = SheetRow; **sheet có NHIỀU cột ảnh** (vd `Image` + `RecommendImage`) → lọc thêm theo `colLetter` khớp `recimg_col` trong sheet-map, nếu không sẽ lẫn 2 loại ảnh cùng dòng. Ảnh DÙNG LẠI ở nhiều ô → **nhiều dòng cùng `name`/`path`, khác row/col** (từ 2026-07-27 script xuất đủ mọi anchor, không còn cảnh giữ-anchor-cuối nên `row` tin được). `row/col: null` (ảnh in-cell kiểu mới — Google đang chuyển dần sang kiểu này nên nấc xlsx sẽ yếu dần theo thời gian) → đưa cả danh sách path cho lane tự đối chiếu nội dung; lane không chắc ảnh nào của bug nào → nấc 3, KHÔNG gán bừa. Connector không export được xlsx (chỉ trả text) → nấc 3.
3. **Nấc 3 — CẦN-ẢNH (tự route, không treo pipeline):** không lấy được ảnh → soạn note routing `<devTag> Ảnh nhúng không đọc được — nhờ QC đính LINK ảnh hoặc mô tả vị trí cụ thể` (GIAI ĐOẠN [5] tự ghi lên Notes cho QC thấy) + bug vào nhóm ↪/✋ đợt 1/đợt 2. User cũng có thể tự screenshot ảnh đó dán vào phiên — người chọn ảnh thì không bao giờ map sai. Khuyến nghị QC: ảnh nên dán link thay vì nhúng.

Khi giao lane: truyền **đường dẫn file ảnh tường minh** trong prompt.

## ẢNH RECOMMEND — cột QC gợi ý "sửa cho đúng" (chạy SAU triage đợt 1, TRƯỚC dispatch lane)

Chỉ chạy khi INTAKE.3 map được cột `RecommendImage`. Không có cột → bỏ qua toàn mục, luồng y như cũ.

**Vì sao phải gate:** ảnh recommend là lever **độ chính xác + tiến độ**, KHÔNG phải lever tốc độ — bóc ảnh nhúng là khâu chậm nhất cả pipeline (mỗi ảnh nấc Chrome ~4 lượt browser). Bật đại trà thì mất nhiều hơn được.

**Gate tầng 1 — bug nào được lấy ảnh.** Chỉ lấy khi bug rơi vào ít nhất một trong: nhóm **❓** (ưu tiên cao nhất) · `Bug Type = visual` · mô tả nhắc hình ("như hình", "xem ảnh", "hình bên", "line này") · cell recommend có prefix `ASSET:`.
KHÔNG lấy: bug `Done`/`Skip` không reopen · bug đã chắc chắn ↪ của bên khác theo sổ ranh giới · bug functional/content thuần chữ.

**Gate tầng 2 — hai cap, hai loại chi phí khác nhau:**

| Cap | Mặc định | Chặn cái gì |
|---|---|---|
| `maxEmbeddedImages` | 12 | lượt thao tác browser (ảnh nhúng) — chi phí **wall-clock** |
| `maxRecommendImages` | 30 | tổng ảnh đưa vào context lane — chi phí **token** (~1.5k/ảnh) |

Vượt cap nào cũng xử như nhau: ưu tiên **❓ → visual → còn lại**; bug bị cắt ghi `Ảnh recommend: bỏ (vượt cap <tên cap>)` vào board và **vẫn chạy bình thường** — không chặn pipeline, không đẻ việc tay cho user.

**Resolver — 3 nấc, dừng ở nấc đầu thành công:**

1. **L1 — LINK trong cell (ưu tiên tuyệt đối, rẻ hơn nhúng ~1 bậc).** Nhận diện theo dạng link:

   | Dạng link | Cách bóc |
   |---|---|
   | URL ảnh trực tiếp (CDN/imgur/`.png`…) | `curl -sL --max-time 10 --max-filesize 5000000 -o <dest> "<url>"` → kiểm `content-type: image/*` **hoặc magic bytes**. Không phải ảnh → thất bại, xuống L2 |
   | Drive **1 file** `/file/d/<id>` | **curl trước:** `curl -sL --max-time 10 -o <dest> "https://drive.google.com/uc?export=download&id=<id>"` — ăn khi link chia sẻ "anyone with link" (ca thường gặp khi QC gửi). Tải về ra HTML đăng nhập (kiểm magic bytes) → thử Chrome tải; cùng đường mới tới MCP (xem ⚠ base64 dưới) |
   | Drive **thư mục** `/drive/folders/<id>` | `search_files` với `query: "parentId = '<id>' and mimeType contains 'image/'"` → được danh sách **tên + fileId** → **map theo TÊN FILE** (luật dưới) → CHỈ tải đúng file đã map, **KHÔNG tải cả bộ** |
   | File `.zip` bộ asset | `unzip -Z1 <zip>` liệt kê tên → map theo TÊN FILE → `unzip -j <zip> <đúng-1-entry> -d <dest>` |
   | Trang web có nhiều `<img>` | `curl` trang → rút `src` → nhận khi **đúng 1 ảnh** hoặc tên file khớp asset trong code; nhiều ảnh không phân biệt được → CẦN-ẢNH |
   | Google Doc/Slides | ảnh **nhúng** trong Doc: KHÔNG bóc được đường rẻ → CẦN-ẢNH, note nhờ QC gửi link ảnh trực tiếp. Ảnh có link trong Doc thì xử như URL trực tiếp |

   ⚠ **`download_file_content` là ĐƯỜNG CUỐI cho ảnh, KHÔNG phải đường đầu** — nó trả **base64 thẳng vào context**: ảnh 1 MB ≈ 340k token, đủ giết cả phiên (đúng cái bẫy đã ghi ở ẢNH-NHÚNG nấc 2 cho xlsx). Chỉ dùng khi curl lẫn Chrome đều fail, **và** `get_file_metadata` cho thấy file **< 300 KB**; không xác định được kích thước → **KHÔNG dùng**, đi CẦN-ẢNH.
   ⚠ **Cạm bẫy đã biết:** ô dùng công thức `=IMAGE("url")` thì CSV export lẫn Drive MCP đều trả **ô RỖNG** (đọc được giá trị hiển thị, không đọc được công thức) → không lấy link kiểu này bằng đường đọc text, rơi thẳng xuống L2. Đừng mất thời gian debug lại chuyện này.

   **LUẬT MAP khi link chứa NHIỀU ảnh** (cùng hạng rủi ro với map-sai-dòng ở nấc xlsx — sai là thay nhầm ảnh vào code):

   | Tình huống | Kết luận |
   |---|---|
   | **Tên file trùng tên asset đang có trong code** (grep tên file trong khu vực bug) | **map CHẮC** → được ASSET-SWAP. Bằng chứng mạnh nhất, và GS/QC export thường giữ nguyên tên |
   | Bộ chỉ có **đúng 1 ảnh** và bug cũng chỉ có 1 | map chắc |
   | Tên file chứa chuỗi đặc trưng từ Description | map **nghi** → chỉ làm tham khảo cho lane, **KHÔNG** tự swap |
   | Còn lại | **KHÔNG map, KHÔNG tải** → Note-routing `<devTag> Có bộ ảnh nhưng không xác định được ảnh nào cho bug nào — nhờ QC ghi rõ TÊN FILE` |

   **CẤM map theo thứ tự xuất hiện** trong thư mục/zip. Thứ tự không phải bằng chứng.
2. **L2 — ảnh nhúng (đắt):** dùng nguyên 3 nấc mục ẢNH-NHÚNG, thêm ràng buộc **phân biệt cột** — nấc Chrome cuộn tới đúng ô `<recimg_col><SheetRow>` rồi click; nấc xlsx lọc theo `colLetter == recimg_col`. Tab sheet mở ở đây thì **GIỮ LẠI** cho BURST NOTE (GIAI ĐOẠN [5]) dùng, không mở 2 lần.
3. **L3 — không lấy được:** board ghi `Ảnh recommend: — (không có)` hoặc `— (lấy thất bại: <lý do>)`. **Không phải lỗi, KHÔNG vào mục "Cần bạn"** — bug vẫn chạy như trước khi có cột này.

**Nơi lưu — tên tất định:** `<ctx>/bugs-lite/images/<project>-<ngày>/rec-<BugID>.<ext>` (ảnh recommend) và `cur-<BugID>.<ext>` (ảnh hiện trạng). Vừa hết lẫn 2 loại, vừa được lợi phụ: **chạy delta lần sau thấy file đã tồn tại thì DÙNG LẠI, không tải/chụp lại**.

**Nhãn ảnh — manager KHÔNG gắn.** Manager chỉ đọc `prefix` thô đầu cell (`ĐÚNG:` / `LỖI:` / `ASSET:` nếu QC có gõ) và truyền nguyên vào prompt lane. Việc gắn nhãn khi thiếu prefix là của **lane** — nó là chỗ duy nhất vừa nhìn được ảnh vừa đọc được code, và giữ đúng ràng buộc "Manager KHÔNG tự phân tích bug".

**Ảnh recommend được dùng ở ĐÚNG 3 chỗ, không hơn:**

| Nhãn | Chỗ dùng | Hiệu lực |
|---|---|---|
| mọi nhãn | đầu vào cho lane (chốt ❓, định vị) | luôn |
| `ASSET` | **ASSET-SWAP** — bug asset chuyển từ ↪ sang 🔧, lane tự thay file | chỉ khi đủ 6 điều kiện của lane **và** sổ ranh giới cho phép sửa asset ở vùng đó |
| `ĐÚNG` | **ảnh đích cho `design-checker`** (GIAI ĐOẠN [4]) | so ảnh MỘT CHIỀU — chỉ hạ verdict xuống `PASS-nghi-visual`, **không bao giờ nâng** thành PASS |

Cả 3 chỗ đều lệch về phía an toàn: không chắc thì mất giá trị, chứ không ra kết quả sai. Tắt hẳn phần so ảnh: `config.visualCompare: "off"`.
