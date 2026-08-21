---
name: check-design
description: Soát design đã giao có ĐỦ để dựng chưa — đủ file nguồn, đủ màn, đủ trạng thái mà brief/docx/Jira đòi — rồi xuất báo cáo kèm block gửi PM. Dùng khi user gõ /check-design, hoặc hỏi "design đủ chưa", "còn thiếu design gì", "design này code được chưa", "đòi PM cái gì"; và sau /daily prep hoặc trước khi giao /code-developer.
---

# /check-design — design đã giao có ĐỦ để dựng chưa

> 🇻🇳 Mọi giao tiếp với user bằng TIẾNG VIỆT.

`/daily` đã canh design ở **tầng file** (5 mức `designStatus` + coverage). Skill này canh phần
còn lại: **tải đủ file rồi, nhưng có đủ MÀN và đủ TRẠNG THÁI mà yêu cầu đòi hay không.**

Ca đã trả giá — `tasks/GW-713/brief.md` tự nó để ngỏ: *"Frame 2/4 popup: design content popup
nằm đâu?"*. Câu đó nằm im tới lúc dựng mới lòi ra, đáng lẽ phải đòi PM từ hôm nhận design.

## Đường dẫn cố định

- `AGENT_AUTO` = gốc repo agent-auto = **thư mục cha 2 cấp của skill này** (skill sống ở
  `AGENT_AUTO/skills/check-design/`, `~/.claude/skills/check-design` chỉ là symlink trỏ vào đây).
  Mặc định `~/VNG/agent-auto`; clone chỗ khác thì suy từ đường dẫn thật của symlink, đừng đoán.
- Yêu cầu: `AGENT_AUTO/tasks/<KEY>/brief.md` · Design: `AGENT_AUTO/designs/<KEY>/` (+ `_src/`, `_docs/`)
- Kết quả: `AGENT_AUTO/tasks/<KEY>/design-gap.md` + `design-gap.json` · tóm tắt trong `state.issues[KEY].design.gaps`
- Script của skill: `AGENT_AUTO/skills/check-design/scripts/`
- Dùng chung: `AGENT_AUTO/tools/psd-tree.py` · `~/.claude/skills/daily/scripts/sp-coverage.mjs`

## Cách gọi

| Lệnh | Làm gì |
|---|---|
| `/check-design <KEY>` | mặc định: nông trước → soi sâu PSD cho những mục chưa chắc |
| `/check-design <KEY> --fast` | chỉ tầng file + đối chiếu ảnh preview, KHÔNG mở PSD (mọi mục nghi ngờ dừng ở `CHƯA-CHẮC`) |
| `/check-design <KEY> --ask` | không soát lại, chỉ in lại block gửi PM của lần soát gần nhất |
| `/check-design` | soát mọi ticket trong `state.json` đang ở phase `waiting-design` hoặc `ready` |

## HAI LUẬT CỨNG

### Luật 1 — Chỉ cái NGUỒN đòi mới được gọi là THIẾU

Bạn có checklist nghề trong `references/ask-checklist.md` (mobile, hover, popup, ảnh share...).
Checklist đó **KHÔNG BAO GIỜ sinh ra mục THIẾU**. Hai rổ tách bạch:

- **Rổ 1 — THIẾU**: mục có `source.quote` — trích được đúng câu trong brief/docx/Jira đòi nó.
- **Rổ 2 — hỏi PM**: mục từ checklist, nguồn không nhắc. Ghi dưới nhãn "nguồn không nói", tuyệt
  đối không gọi là thiếu, không tính vào trễ mốc.

Vì sao: "đủ" phải đo theo nguồn. Tự định nghĩa tập kiểm rồi báo thiếu = báo oan designer và làm
user mất niềm tin vào cả báo cáo.

### Luật 2 — Chưa soi PSD thì chưa được nói THIẾU

Một mục chỉ được `THIẾU` sau khi đã làm **cả hai**:

1. Nhìn hết ảnh preview trong `designs/<KEY>/` (kể cả `_src/`), và
2. `python3 AGENT_AUTO/tools/psd-tree.py "<file.psd|psb>"` — dump cây layer, tìm không ra layer
   nào khớp.

Chưa làm được (2) — PSB chưa tải xong, file quá lớn, `psd-tools` đọc không nổi — thì mức cao
nhất là `CHƯA-CHẮC`, kèm `evidence.blockedBy` nói rõ kẹt ở đâu.

> Script `gap-store.mjs` **tự hạ mức** nếu bạn khai `THIẾU` mà `evidence.looked` không có file
> `.psd/.psb` nào. Đừng nhét tên PSD vào cho qua cửa — hãy đi dump thật. Cũng vậy: khai `ĐỦ`
> mà không chỉ ra được file/vùng/layer thì bị hạ xuống `CHƯA-CHẮC`.

### Chuẩn để đọc design bằng con mắt thư viện

Khi soi popup trong design: đối chiếu với module có sẵn ở `libraryMainsite-t-popup/html/module/`
(`popup_login`, `popup_register`, `popup_pre_register`, `popup_condition`, `popup_confirm`, `popup_inform`,
`popup_reward`, `popup_doithuong`, `popup_history`, `popup_getlist`, `popup_bxh`, `popup_input`, `popup_rule`).
Popup nào **dùng lại được module** thì ghi kèm tên module — dev khỏi dựng lại (R-POP-1). Popup design vẽ
khác hẳn khung `base.html.twig` → không phải "thiếu design", mà là mục **hỏi PM** ("có buộc phải khác chuẩn không?").
Luật: `~/VNG/agent-auto/rules/popup-library.md`.

## Luồng 5 bước

### Bước 1 — Dựng danh sách yêu cầu

Đọc theo thứ tự, **nguồn chi tiết hơn / mới hơn thắng**:

1. `tasks/<KEY>/brief.md` — mục "Việc", bảng Timeline, mục "Việc còn mở".
2. Note PM trong `designs/<KEY>/` — `*.txt` (bản convert từ docx), `_docs/`, `*.xlsx`.
3. Jira: `description` + **toàn bộ comment** (MCP Atlassian `getJiraIssue`, `fields: description,comment,summary,duedate`).

Nguồn sau chi tiết hơn brief ⇒ **sửa `brief.md` ngay tại chỗ**, đừng chỉ nêu trong báo cáo. Lỗi
đã trả giá với `milestones`: đọc docx rồi chỉ chép vào báo cáo, để state/brief số cũ ⇒ console
vẫn cảnh báo theo số sai.

Chưa có `brief.md` ⇒ vẫn chạy với 2 nguồn còn lại, ghi rõ trong báo cáo: *"chưa prep, danh sách
yêu cầu có thể sót — nên chạy `/daily prep <KEY>`"*.

Mỗi hạng mục bóc ra là một item: `id` (slug ổn định giữa các lần chạy — dùng lại đúng id cũ
trong `design-gap.json` nếu là cùng một thứ, nếu không DELTA sẽ tưởng là mục mới),
`label`, `kind` (`màn` · `biến-thể` · `trạng-thái` · `asset` · `file-nguồn`), `source`, `milestone`.

### Bước 2 — Kiểm kê tầng file

```bash
node ~/.claude/skills/daily/scripts/sp-coverage.mjs \
  AGENT_AUTO/designs/<KEY>/sp-manifest.json AGENT_AUTO/designs/<KEY> --json
```

Ra 3 con số cho `run.files`: `downloaded` · `missingSource` (nguồn có mà local chưa có) ·
`newerAtSource` (nguồn mới hơn bản local). Không có manifest ⇒ đếm tay file trong thư mục và
ghi `note: "chưa có sp-manifest"`.

**File nguồn chưa tải mà tên nó gợi đúng thứ đang tìm** (vd `POPUP_frame4.psd` chưa tải) ⇒ item
liên quan phải là `CHƯA-CHẮC` với `blockedBy` = "cần tải `<file>` mới kết luận được", KHÔNG phải
`THIẾU`.

### Bước 3 — Đối chiếu nông

Cắt ảnh dài trước khi nhìn (đọc thẳng ảnh 2000×5300 vừa tốn context vừa mất nét chi tiết):

```bash
python3 AGENT_AUTO/skills/check-design/scripts/img-slice.py "<ảnh>" --outdir /tmp/<KEY>-slices
```

Mỗi lát in kèm `y gốc <a>–<b>`. Thấy hạng mục ở lát nào thì ghi `evidence.found` theo **tọa độ
ảnh gốc**: `"SUBWEB-VLTT_PC.jpg y≈2400–3100"`. Gán `ĐỦ` cho những mục thấy rõ.

### Bước 4 — Soi sâu, chỉ cho mục chưa `ĐỦ`

```bash
python3 AGENT_AUTO/tools/psd-tree.py "designs/<KEY>/_src/<file>.psb" --max-depth 3
```

Tìm layer/group khớp từ khóa của item (tên frame, `popup`, `mobile`, `hover`, `mb`, `sp`...).
Thấy layer khớp (kể cả layer **ẩn**) ⇒ `ĐỦ`, `evidence.found` ghi đường dẫn layer. Không thấy ⇒
`THIẾU`, `evidence.looked` phải liệt kê đúng những file đã dump.

`--fast` thì bỏ hẳn bước này; mọi mục chưa `ĐỦ` dừng ở `CHƯA-CHẮC`.

**Ngưỡng đẩy subagent**: > 6 item cần soi sâu **hoặc** tổng ảnh cần đọc > 50MB ⇒ giao subagent
theo nhóm màn (mỗi subagent một nhóm, nhận về `items[]` đúng schema). Phiên chính chỉ gộp kết
quả — đừng ôm hết ảnh vào context chính.

### Bước 5 — Nộp cho script và báo cáo

Viết `run.json` theo schema trong `references/output-format.md` rồi:

```bash
node AGENT_AUTO/skills/check-design/scripts/gap-store.mjs \
  --root AGENT_AUTO --key <KEY> --in /tmp/<KEY>-run.json
```

Script ghi `design-gap.md` + `design-gap.json`, cập nhật `state.issues[KEY].design.gaps`, vá mục
"Việc còn mở" trong brief (giữa marker `<!-- check-design:begin -->`), và tính DELTA so lần trước.
**Con số cuối cùng lấy từ output của script, không phải từ nhận định của bạn** — script có thể đã
hạ mức của bạn theo hai luật cứng.

Báo cáo cho user (tiếng Việt) gồm:

1. Một dòng tổng: `ĐỦ n · THIẾU n · CHƯA CHẮC n · hỏi thêm n` + **kết luận code được chưa**.
2. Rổ 1 (thiếu/chưa chắc) — mỗi dòng kèm câu nguồn đòi nó.
3. Rổ 2 (nguồn không nói) — gọn, dạng câu hỏi.
4. **Thứ tự dựng**: "code được ngay" (mọi item của màn đó `ĐỦ`) / "phải chờ design".
5. DELTA nếu có lần soát trước (mục đã có, mục vẫn thiếu sang ngày thứ N).
6. Block copy gửi PM (đã nằm sẵn cuối `design-gap.md`).

## Cấm

- **KHÔNG** đổi `state.issues[KEY].phase` — quyền đó của `/daily`.
- **KHÔNG** `git commit` / `git push` (luật global: hỏi user từng lần).
- **KHÔNG** ghi ngược Jira, không comment lên ticket.
- **KHÔNG** đoán khi không mở được design ⇒ mọi item liên quan `CHƯA-CHẮC` + 📎 "cần mở tay",
  không bịa nội dung design. Nhưng Canva/Figma **đã có MCP từ 20/8/2026**: phải thử
  `ToolSearch "+canva"` / `"+figma"` TRƯỚC, chỉ khi server chưa OAuth (chỉ ra tool
  `…__authenticate`) mới được hạ về `CHƯA-CHẮC` + 1 dòng "Cần bạn: `/mcp`".
- **KHÔNG** sửa file trong `designs/<KEY>/` (kho design là bản gốc, chỉ đọc). Ảnh cắt lát để ở
  `/tmp`.
