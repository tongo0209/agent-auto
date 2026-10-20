# Stage verify — buglist {{KEY}} (vòng {{round}})

Verify từng bug đã fix trong `{{runDir}}/bug-board.md` như `/bug-fixer-lite` giai đoạn [4] VERIFY (1 lượt design-checker cho cả list, browser thật). KHÔNG sửa code.

Ghi `{{runDir}}/verify-r{{round}}.json` dạng `{"blocking":[bug còn FAIL + lý do],"advisory":[...]}` và cập nhật verdict từng bug trong bug-board.
Verdict: `revise` khi còn bug FAIL, `pass` khi hết.
