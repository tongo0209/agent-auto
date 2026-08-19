# Gốc ngữ cảnh `<ctx>` + State qua phiên — chi tiết

> Tách từ SKILL.md 2026-08-06. Manager đọc file này khi cần chi tiết ngoài phần rút gọn ở core (lần đầu tạo `<ctx>`, entry state đầy đủ, luật git hygiene).

## Gốc ngữ cảnh `<ctx>` — context sống cùng product

Mọi artifact (spec, report, state, knowledge dự án) lưu dưới **gốc ngữ cảnh** `<ctx>`, để task dở dang phiên sau mở lên là có sẵn — không phân tích lại:

1. Khu vực code của task nằm trong `products/<product>/...` (vd repo cdn-source) → `<ctx>` = `<repo>/products/<product>/.claude/` — ngữ cảnh tích lũy **theo product**, dotfolder không bị sync lên CDN.
2. Không thuộc cấu trúc products → `<ctx>` = `.claude/` tại cwd như cũ.
3. Vì `<ctx>` gom cả product, **slug phải tự phân biệt campaign**: `<campaign>-<phần>` (vd `skin-2026-footer`, `landing-2026-cbt-hero`).
4. Khi giao việc cho agent: LUÔN render `<ctx>` thành **đường dẫn đầy đủ** trong prompt (cả đường dẫn knowledge dự án `<ctx>/knowledge/`) — agent không biết quy ước này.
5. **Git hygiene của `<ctx>`**: TOÀN BỘ `<ctx>` là file cá nhân từng máy — KHÔNG commit (specs, reports, state, knowledge dự án đều vậy). Lần đầu tạo `<ctx>` trong repo git: kiểm tra `.gitignore` đã có pattern `**/.claude/` chưa, chưa có thì NHẮC user thêm (không tự sửa .gitignore).

## State qua phiên — `<ctx>/state.md`

- **Khi khởi động pipeline**: `<ctx>/state.md` tồn tại → đọc trước. Có entry chưa DONE liên quan đến yêu cầu → tóm tắt cho user "đang dở gì, tới đâu" và xác nhận làm tiếp hay task mới (task mới thì giữ nguyên entry cũ).
- **Khi cập nhật** — tại MỖI điểm dừng hỏi user, mỗi lần một agent xong việc, và cuối pipeline — ghi đè entry của slug đang làm:

```markdown
## <slug> — cập nhật <YYYY-MM-DD HH:mm>
- Mode: full | Trạng thái: đang vòng 2 (dev fix theo check-1) / DONE
- Đã xong: spec ✓ specs/<slug>.md | dev v1 ✓ | check v1 FAIL 2 major
- Quyết định/waiver từ user: "vòng quay chỉ demo" (2026-06-05)
- Model đã dùng: analyst opus, dev v1 opus, checker sonnet
- Chi phí: 5 agent-call · 87 tool-call · 210k output · 34 phút máy
- Tiếp theo: dev fix 2 issue trong reports/<slug>-check-1.md
```

**Dòng `Chi phí` là BẮT BUỘC** ở entry cuối mỗi lần chạy (mọi mode trừ `quick`) — không có nó thì lần tối ưu sau lại phải đoán. Cách lấy số thật:

```bash
# RUN_START đã lưu ở Bước 0.5, đọc lại từ <ctx>/state.md
~/.claude/scripts/run-metrics.sh $RUN_START
```

Script không chạy được → ghi phần đếm được (agent-call, phút) và ghi `output: chưa đo`. **CẤM bịa số.**

- Task DONE → rút entry còn 2-3 dòng (kết quả + file). State là bảng tiến độ, không phải nhật ký — entry quá cũ thì xoá, giữ file ≤ ~150 dòng.
