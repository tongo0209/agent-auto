# Stage fix — {{KEY}} (sửa cho stage `{{callerOfFix}}`)

Bạn đang tiếp tục phiên đã code ticket này. Sửa ĐÚNG các lỗi chặn trong `{{feedbackFile}}`, không mở rộng phạm vi.
Góp ý của user (nếu có): {{rejectNote}}

`{{feedbackFile}}` là kết quả gom của nhóm stage chạy song song (có mảng `stages`) → đọc từng `file` có verdict khác pass, sửa hết lỗi chặn của mọi stage trong đó.
Mỗi lỗi: tìm nguyên nhân (không vá triệu chứng), sửa, build lại cho tới PASS. Lỗi là báo oan (có bằng chứng) → ghi vào advisory kèm lý do, không sửa.
KHÔNG commit, KHÔNG push.

Verdict: `pass` + `files` = mọi file đã sửa; `fail` khi không sửa được.

Nhiều lỗi chặn: gom theo tập file — lỗi cùng file vào cùng cụm; các cụm rời file nhau → mỗi cụm 1 lane Agent (tối đa 5 cùng lúc), 1 cụm thì tự sửa tuần tự.
Brief từng lane: đúng lỗi + file của cụm, chép câu "tìm nguyên nhân, không vá triệu chứng; báo oan thì trả lý do kèm bằng chứng", luật `~/VNG/agent-auto/rules/`: `code-style.md`, `cdn-source-standard.md`, `landing-js.md`, `landing-structure.md`, `popup-library.md`, thêm `pm-contract.md` nếu có `pm__`. Lane KHÔNG build, không commit; mọi lane xong thì phiên chính build 1 lần cho tới PASS, gộp `files` + advisory của mọi lane vào verdict.
