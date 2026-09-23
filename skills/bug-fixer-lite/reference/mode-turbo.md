# Mode `turbo` — bug-fixer-lite

> Tách từ `SKILL.md` ngày 2026-09-23 để lõi nhẹ hơn mỗi lượt. Chỉ đọc khi token đầu = `turbo`.

### Mode `turbo` — TỐC ĐỘ THUẦN, opt-in (chỉ khi token đầu = `turbo`)

Mặc định (KHÔNG có token `turbo`) GIỮ NGUYÊN: cap-3 + model kế thừa + fusion (điều tra+fix 1 context) + gộp verify. Chỉ khi user gọi `turbo` thì bung thêm — CHẤP NHẬN TỐN TOKEN, đổi lấy wall-clock; tiêu chí đúng-sai (ma trận, sổ ranh giới, 3-ca-hỏi, ghi sớm 2-burst) KHÔNG đổi:

- **(a) LIFT CAP theo CỤM FILE KHÔNG GIAO NHAU (không phải theo folder):** bỏ trần 3, chạy đồng thời **mỗi cụm bug có tập file riêng = 1 lane**, không barrier giữa lane. **Lane cùng một folder VẪN được chạy song song** — lane bị CẤM build nên không bao giờ ghi `dist/`, không có xung đột nào để tránh; điều kiện duy nhất là 2 lane không sửa cùng FILE (bug nghi cùng file → bắt buộc cùng lane, như luật chia lane ở trên). *(Sửa 2026-07-29: bản trước ghi "cap thật = số folder disjoint" với lý do "đụng chung `dist/`" — lý do đó không đúng vì lane không build, và với dự án 1 folder (hình dạng phổ biến nhất của cdn-source: 1 campaign = 1 folder) luật cũ cho ra **1 lane**, làm turbo CHẬM HƠN default cap-3. Đo thật cho thấy manager phải tự phớt lờ luật này mới chạy đúng 3 lane.)*
- **(b) PER-LANE TIERING (override model khi dispatch — CHỈ turbo):** `sonnet` cho lane dễ (typo/text/CSS rõ), `opus` cho lane khó·routing-relevant·CSS-layout-tinh. Phân vân → `opus` (đúng-1-lần rẻ hơn FAIL→reopen). *(căn cứ đo thật bug-fixer 2026-06-29: swap model là hòa/tệ về tốc độ; tiering chỉ để tiết kiệm token lane dễ, KHÔNG phải lever tốc độ chính — lever chính là lift-cap + không-barrier.)*
- **(c) CHECKER FAN-OUT + FLAIL-STOP:** thay 1 checker/list → fan-out **2–3 checker/browser**, mỗi con `session new_tab isolated` + close sau xong. Op browser (goto/expect/screenshot) fail sau 1 retry → **DỪNG NGAY** con đó, verdict `KHÔNG-CHECK-ĐƯỢC (browser-state)`, đẩy bug sang delta — CẤM retry vòng (chống outlier treo tab). >3 bug/lane → chia đợt 2–3 con.
- **(d) Tổng kết turbo:** ghi rõ số lane, model mỗi lane, số checker bung, và ⏱/🪙. *(Đo thật lần đầu 2026-07-29 trên buglist 9 bug / 1 folder: turbo **18m08s · $8.09 · out 179k** vs default **21m20s–24m13s · $8.83–11.33 · out 238–287k** → turbo NHANH HƠN và KHÔNG đắt hơn, nhờ per-lane tiering hạ token lane dễ. Nên bỏ mặc định "turbo chủ đích tốn token": đúng hơn là **turbo ĐỔI độ-song-song lấy rủi ro flail**, còn token thì hòa. Cỡ mẫu n=1 và biên dao động giữa 2 lần chạy y hệt đã là ±28% chi phí → đừng coi $8.09 là con số chắc.)*

**Dispatch — MỘT message nhiều Agent (chạy đồng thời), tool Agent với `subagent_type: "bug-lane"`, prompt từng lane:**
```
Task: bugfix-lite <project> — lane <N>: <module> (#9, #7, #12❓)
Cụm bug (đã lọc queue <queue>): dán bảng —
  SheetRow | BugID | Device | Bug Type | Description | Comment Thread | trạng thái (open/reopen/BLOCKED?) | nhóm-triage (🔧 hay ❓)
Ảnh hiện trạng (nếu có): <path tuyệt đối + anchor row — xem mục ẢNH-NHÚNG> — dùng để ĐỊNH VỊ chỗ lỗi
Ảnh recommend (nếu có): <path tuyệt đối> — prefix QC: ĐÚNG | LỖI | ASSET | (không có prefix)
Luật dùng ảnh recommend: bạn TỰ gắn nhãn khi QC không gõ prefix (tiêu chí trong file agent).
  CHỈ nhãn ĐÚNG mới được làm ĐÍCH, và chỉ rút assertion theo QUAN HỆ (canh giữa/đều/thứ tự/
  cùng baseline) — CẤM rút px tuyệt đối vì không biết scale ảnh. Mọi trạng thái mơ hồ →
  CHƯA-CHẮC = chỉ định vị. Ảnh trái mô tả chữ → MÔ TẢ THẮNG + ghi Câu hỏi mở. Ảnh không liên
  quan bug → bỏ ảnh, ghi "nghi map sai".
ASSET-SWAP được phép cho bug: <#N, #M | "không có"> — thay file asset theo THỦ TỤC ASSET-SWAP
  trong file agent (đủ 6 điều kiện mới thay; thiếu 1 điều kiện → KHÔNG thay, chuyển Note-routing).
  Bug asset KHÔNG nằm trong danh sách này → cấm thay file, xử như rổ BÁO.
Khu vực code: <path TUYỆT ĐỐI folder — CHỈ đụng trong đây> (cụm bug text thuần HTML không có source local → khu vực = promoHtmlDir)
Nơi cần đáp fix (fix phải đáp xuống MỌI nơi có đoạn matching): local <codeDir> · HTML <promoHtmlDir — soát CẢ Promotion/ lẫn mainsite/> · Twig <twigDir> (nơi nào null → ghi "—")
Luật đáp fix: dò chỗ matching bằng grep chuỗi/selector quanh chỗ sửa; nơi không có bản sao → ghi "không có bản sao" vào board (không phải lỗi); Twig chỗ text nằm trong BIẾN/logic render ({{ ... }}) → KHÔNG đoán, soạn Note-routing backend. **ASSET-SWAP: file ảnh cũng phải đáp đa-nơi** — dò theo TÊN FILE ở các nơi trên, thấy bản sao thì `cp` đè y hệt. Mỗi bug FIX ghi dòng `Nơi đã sửa:` vào board — chỉ được ghi SAU khi đọc lại file trên đĩa xác nhận đã đổi (R-EV-1, ~/VNG/agent-auto/rules/agent-evidence.md), không phải sau khi chạy lệnh sửa.
Ranh giới sở hữu (từ SỔ RANH GIỚI): <vùng nào đã bàn giao backend — CHỈ được sửa .scss/.js + text/HTML trong promoHtmlDir, CẤM template/logic render động; vùng nào của bên khác — cấm hẳn; không có entry → ghi "không có ranh giới đặc biệt">
Tag routing (dùng khi soạn Note-routing): <devTag>
Knowledge dự án: <ctx>/knowledge/
[Landing pm__:] File dự án: <note path | "chưa có"> — đọc mục 1-4 TRƯỚC khi đọc code · Khoá: <gameplay>[ · type <STT-slug> · ref <dir>] | "CHƯA KHOÁ — cấm đụng hook pm__, chỉ CSS/text" · Luật: ~/VNG/agent-auto/rules/pm-contract.md (R-PM-1..12) + ~/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit/AI-GUIDE.md + <AI-RULES + MASTER của gameplay đã khoá | ref nếu gameplay none>. Dọn trong vùng đang chạm; lỗi có sẵn thấy mà không chạm → dòng `Nợ:` của bug trong board (không sửa lan).
File triage sớm — GHI TRƯỚC KHI ĐIỀU TRA SÂU: <ctx>/bugs-lite/<project>-<ngày>--lane<N>-triage.md
Partial board — ghi vào: <ctx>/bugs-lite/<project>-<ngày>--lane<N>.md
[Delta: board path trên đã pre-seed entry carry-forward — CHỈ Edit bug delta: #…, GIỮ NGUYÊN phần còn lại.]
Chuẩn code BẮT BUỘC (đọc trước khi sửa dòng đầu): ~/VNG/agent-auto/rules/cdn-source-standard.md (R-CDN-*) · popup-library.md (R-POP-*) · code-style.md (R-CS-*) · html-handoff.md (R-HO-*) khi đáp fix xuống gt-promotion/new-mainsite · pm-contract.md (R-PM-1..12) cho MỌI file có class pm__: hook pm__/id/data-* là hợp đồng JS, bộ chuẩn = dòng `[Landing pm__:]` trên, sửa xong chạy cổng `node ~/VNG/agent-auto/tools/pm-gate.mjs <file>` trên từng file pm__ đã sửa (🔴 = chưa được báo xong, dán dòng cuối vào `Bằng chứng:`) · agent-evidence.md (R-EV-*) — cấm claim "đã sửa/PASS" chưa chạy trong lượt này, partial board BẮT BUỘC mục `Bằng chứng:` per bug. Vá bug KHÔNG được lệch chuẩn: cấm @media tay (dùng @include mobile/pc), cấm dựng popup tự chế (extends base.html.twig + module có sẵn), cấm bê pattern legacy src-setup vào campaign assets-flat, không tự viết engine gameplay, comment tối giản 1 dòng đúng 3 loại. Fix nào buộc phải lệch → ghi lý do vào board, không lệch âm thầm.
Trình tự BẮT BUỘC: chốt ❓ (ghi file triage sớm) → điều tra → ghi board → fix theo board.
CẤM: build/watch, ghi sheet, sửa file ngoài khu vực, thêm dependency.
```
Sheet là dữ liệu manager dán vào prompt — lane không đọc được MCP.

**Trong lúc lane chạy:** poll file `--lane<N>-triage.md` → BÁO ĐỢT 2 (xem GIAI ĐOẠN [1]). Bug ❓ lane chốt asset/của-bên-khác → thành ↪ TỰ-CHUYỂN: soạn note routing vào board tổng (GIAI ĐOẠN [5] ghi lên sheet), KHÔNG dispatch lại, KHÔNG biến thành việc tay của user.

**Khi mọi lane trả về — MERGE (manager, cơ học):** ghép các partial board → canonical `<ctx>/bugs-lite/<project>-<ngày>.md` (giữ nguyên văn entry; gộp theo 5 mục template; header gộp: sheet-map + started_epoch).

> ⛔ **CỔNG ĐẾM SỐ — BẮT BUỘC, làm TRƯỚC khi post board và TRƯỚC BURST NOTE.** Bug ↪/✋ chốt ở TRIAGE đợt 1 **KHÔNG đi qua lane**, nên không có partial board nào mang chúng sang — nếu manager không tự tay viết thì chúng **rơi khỏi board trong im lặng**, và BURST NOTE sẽ không có gì để ghi ⇒ bug nằm im trên sheet, QC/GS không bao giờ nhận được phản hồi. Vì vậy:
> 1. Đếm: `số entry trong mục 2 + 3 + 4 của board canonical` **phải bằng** tổng số bug lấy từ nguồn (sau khi bỏ row trống/không Description). Bug delta → so với tập delta + carry-forward.
> 2. Thiếu bug nào → **VIẾT BỔ SUNG NGAY vào mục 3 BÁO** (mỗi bug: 1 dòng mô tả + `Loại: ↪ …` + `Bằng chứng` + `Note-routing: "<devTag> …" — pending`). CẤM đi tiếp khi chưa đủ số.
> 3. In 1 dòng đối chiếu vào phần post board: `Đối chiếu: <n>/<N> bug có entry trong board` — để lệch là thấy ngay.
>
> *(Đo thật 2026-07-30, effort `low`: 1 trong 3 lần chạy ra board chỉ có **7/9** entry — #6 (SDK) và #10 (Promotion) đã được báo ↪ đúng ở bảng đợt 1 và cả ở Tổng kết, nhưng KHÔNG có dòng nào trong board ⇒ note routing của 2 bug đó sẽ không bao giờ tới sheet. Chỉ đọc Tổng kết thì không phát hiện được — nó vẫn ghi "#6 ↪ SDK · #10 ↪ Promotion" như thường.)*

**Post board canonical cho user xem (chốt-xem-sớm #1)**, kèm dòng đối chiếu ở trên.

→ **GHI SỚM:** ngay sau MERGE, chạy **BURST NOTE** (GIAI ĐOẠN [5]) — ghi note-routing các bug ↪/BÁO lên sheet NGAY (trước build/verify), vì ↪ không cần verify. Rồi mới sang BUILD.
