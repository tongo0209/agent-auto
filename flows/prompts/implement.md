# Stage implement — {{KEY}} (luồng {{flow}})

Repo `{{repo}}` · Campaign `{{campaignDir}}`. Code theo `{{runDir}}/plan.md` đã được user duyệt. Góp ý thêm của user: {{rejectNote}}
Phương án user đã chọn (làm theo đúng phương án này): {{choice}} — để trống thì làm theo plan.

Luật đọc trước khi sửa (theo những gì chạm tới, đọc file, không đoán):
- Mọi code: `~/VNG/agent-auto/rules/code-style.md`
- cdn-source: `rules/cdn-source-standard.md`; JS landing: `rules/landing-js.md`; section/clone: `rules/landing-structure.md`; popup: `rules/popup-library.md`; list: `rules/layout-standard.md`; ô nhận thưởng: `rules/promo-states.md`; animation: `rules/animation.md`
- File có `pm__`: `rules/pm-contract.md` + AI-GUIDE của kit (cửa vào R-PM-11)

Làm theo skill `/code-developer` (đọc mục `## Chạy dưới autopilot` của nó). Tự build bằng lệnh của repo cho tới khi build PASS.
KHÔNG commit, KHÔNG push — stage commit làm việc đó sau khi user duyệt.

Verdict: `pass` + `files` = MỌI file đã sửa/tạo (đường dẫn tương đối với `{{repo}}`); `fail` khi kẹt.

Ticket nhiều campaign (mỗi dòng 1 folder):
{{campaignDirs}}
Từ 2 campaign trở lên: mỗi campaign 1 lane Agent riêng, tập file rời nhau, tối đa 5 lane song song; build chung do stage gates chạy từng campaign.

Landing nhiều section trong cùng campaign mà driver KHÔNG chạy pipeline section (plan chưa chia, hoặc file các section chồng nhau) — section theo plan (trống thì tự chia từ `{{runDir}}/plan.md`):
{{sections}}
- Section có tập file rời nhau → mỗi section 1 lane Agent; popup chung + JS chung (`main/`) là 1 lane riêng nếu rời file với các section. Tối đa 5 lane chạy cùng lúc. Chỉ 1 section hoặc file chồng nhau → làm tuần tự như trên.
- Brief từng lane: plan + ĐÚNG file của section đó (cấm sửa file ngoài) + luật `~/VNG/agent-auto/rules/`: `code-style.md`, `cdn-source-standard.md`, `landing-structure.md`, `popup-library.md`, `landing-js.md`, thêm `pm-contract.md` nếu có `pm__`. Lane KHÔNG build (webpack ghi chung `dist/`), không commit, không gọi Agent khác.
- Mọi lane xong thì phiên chính build 1 lần cho tới PASS; `files` = gộp `files` của mọi lane.
