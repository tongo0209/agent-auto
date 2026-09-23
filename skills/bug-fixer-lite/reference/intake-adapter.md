# INTAKE ADAPTER — bug-fixer-lite

> Tách từ `SKILL.md` ngày 2026-09-23 để lõi nhẹ hơn mỗi lượt. Chỉ đọc khi nguồn KHÔNG phải Google Sheet chuẩn.

## INTAKE ADAPTER — buglist ngoài Google Sheet (xử lý TẠI CHỖ, không từ chối)

Mọi nguồn bóc về **bug-record chuẩn** (đúng bộ trường ở INTAKE.3) rồi chạy pipeline y hệt từ TRIAGE. Khác nhau DUY NHẤT: cách ĐỌC và cách GHI NGƯỢC.

| Nguồn | Đọc | srcRef (thay SheetRow) | Ghi ngược |
|---|---|---|---|
| Google Sheet | Drive MCP (luồng chuẩn) | SheetRow | Chrome Sheets — GIAI ĐOẠN [5] |
| Google Doc | Drive MCP `read_file_content` (URL `document/d/`) | đoạn/quote gốc | kết quả-block |
| Drive file (pdf…) | Drive MCP `download_file_content` (URL `file/d/`) → Read local (pdf theo `pages`) | trang + STT | kết quả-block |
| Excel Online (OneDrive/SharePoint) | M365 MCP: ToolSearch `+sharepoint` → `sharepoint_search`/`read_resource`; hoặc tải file xlsx | SheetRow | Chrome trên Excel Online (Name Box y hệt) — GIAI ĐOẠN [5]; lần đầu chưa nghiệm thu → 3 ô đầu chậm |
| File `.xlsx` đính kèm/tải về | **chữ:** `node <SCRIPTS>/extract-xlsx-text.js <file.xlsx>` → mỗi dòng 1 JSON `{"row":<SheetRow>,"cells":{"A":…,"G":…}}` (khoá theo CHỮ CÁI CỘT → khớp thẳng sheet-map; `row` dùng luôn làm srcRef). **ảnh:** `extract-xlsx-images.js` (ẢNH-NHÚNG nấc 2) | `row` trong file | kết quả-block |
| `.pdf` | Read trực tiếp (đọc theo `pages`, thấy cả ảnh) | trang + STT | kết quả-block |
| `.pptx` / `.docx` | script `node <SCRIPTS>/extract-office-text.js` (bóc text + ảnh theo slide/đoạn) | slide/đoạn + STT | kết quả-block |
| Text/chat/email dán | parse trực tiếp | STT | kết quả-block |

Luật chung:
- ⚠ **CẤM tự viết parser cho `.xlsx`** — đã có `extract-xlsx-text.js` (chữ) + `extract-xlsx-images.js` (ảnh) trong `<SCRIPTS>`, dùng thẳng. *(Đo thật 2026-07-29: chưa có extractor chữ nên manager phải `unzip -Z1` khảo sát rồi tự Write parser python mỗi phiên — việc lặp lại và dễ sai ở sharedStrings/inlineStr/entity/ô-công-thức.)* Script fail/thiếu `node`+`unzip` → khi đó mới tự parse, và ghi 1 dòng lý do vào board.
- **BugID:** nguồn có ID thì dùng; không có → tự sinh `L1, L2…` theo thứ tự xuất hiện, lưu kèm 40 ký tự đầu Description trong board (delta lần sau đối chiếu theo đoạn mô tả này, KHÔNG theo vị trí — nguồn phi cấu trúc hay xáo thứ tự).
- **Bóc xong in bảng bug-record NGAY TRONG ĐỢT 1** kèm 1 dòng: "nguồn phi cấu trúc — bóc được <n> bug, sai/thiếu thì nhắn, tôi vẫn đang chạy" — KHÔNG dừng chờ confirm (zero-babysit; fix chỉ đụng code, xem lại được bằng git diff; ghi ngược nguồn chỉ xảy ra với sheet ghi được).
- **Thiếu trường:** không có Bug Type → lane tự suy như luật sẵn có; không có Device → `defaults.device` registry; không có status → mọi bug coi như open.
- **Kết quả-block (đường ghi CHÍNH THỨC của nguồn chỉ-đọc, không phải fallback lỗi):** cuối phiên in bảng dán-được `BugID | Kết quả (Done/FAIL/↪) | Note <devTag>` để user gửi lại kênh gốc (reply chat/email/comment). Ghi rõ ở Tổng kết.
- Registry: lưu `sourceType` + URL/path nguồn — lần sau nhận ra ngay, không hỏi lại.
