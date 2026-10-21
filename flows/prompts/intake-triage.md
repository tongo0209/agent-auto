# Stage intake-triage — buglist {{KEY}}

Đầu vào: {{input}} · buglist: {{sheetUrl}} · loại sheet: {{sheetKind}} (google → Drive/extension Chrome · excel → đọc HTTP Range theo memory doc-xlsx-lon-bang-http-range)

Cổng đầu tiên: header phải có cột `BugID` hoặc `No.` — không có → verdict `fail`, blocking "sheet thiếu cột BugID/No.", dừng (radar không đọc được, cấm tự đánh số).

Chạy `/bug-fixer-lite` giai đoạn INTAKE + [1] TRIAGE-NGAY (đọc `## Chạy dưới autopilot`): đọc buglist, lọc bug của user, phân loại, ghi bug-board ra `{{runDir}}/bug-board.md`. KHÔNG fix, KHÔNG ghi sheet ở stage này.

Verdict: `pass` + `campaignDir` = thư mục campaign chính (tuyệt đối) khi run chưa có ({{campaignDir}}); `fail` khi không đọc được nguồn.
Bug đã ghi trong `{{runDir}}/drift.md` (nếu có) là drift BE: đưa vào rổ note routing, không vào rổ FIX.
Trước khi kết luận "text do BE sinh lúc chạy": tìm chữ QC trích bằng `grep -rin` (không phân biệt hoa thường — QC gõ "Điểm Danh", source là "Điểm danh"), thử thêm bản bỏ dấu, trong cả campaign `{{campaignDir}}` lẫn bản bàn giao (nếu có) `{{handoffDir}}`.
