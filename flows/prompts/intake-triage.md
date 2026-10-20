# Stage intake-triage — buglist {{KEY}}

Đầu vào: {{input}} · loại sheet: {{sheetKind}} (google → Drive/extension Chrome · excel → đọc HTTP Range theo memory doc-xlsx-lon-bang-http-range)

Cổng đầu tiên: header phải có cột `BugID` hoặc `No.` — không có → verdict `fail`, blocking "sheet thiếu cột BugID/No.", dừng (radar không đọc được, cấm tự đánh số).

Chạy `/bug-fixer-lite` giai đoạn INTAKE + [1] TRIAGE-NGAY (đọc `## Chạy dưới autopilot`): đọc buglist, lọc bug của user, phân loại, ghi bug-board ra `{{runDir}}/bug-board.md`. KHÔNG fix, KHÔNG ghi sheet ở stage này.

Verdict: `pass` + `campaignDir` = thư mục campaign chính (tuyệt đối) khi run chưa có ({{campaignDir}}); `fail` khi không đọc được nguồn.
