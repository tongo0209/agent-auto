# Chuẩn cdn-source — cách manager áp trong pipeline

Luật nằm ở `~/VNG/agent-auto/rules/` (R-CDN-*, R-POP-*, R-HO-*). File này chỉ nói **manager làm gì với chúng**.

## 1. Nhồi rules vào brief — không agent nào tự biết

| Giao ai | Dòng phải có trong brief |
|---|---|
| `frontend-developer` | `cdn-source-standard.md` + `popup-library.md` (+ `html-handoff.md` nếu có bàn giao) + `code-style.md` |
| `design-checker` | 3 file trên — chấm theo mã luật, mỗi lệch ghi `<mã> — file:line` |
| `design-analyst` | `popup-library.md` — spec phải liệt kê popup ↔ module có sẵn, và đoán loại promotion |

Trỏ **đường dẫn đầy đủ**, không copy nội dung luật vào brief (tốn token, dễ lệch bản).

## 2. Chốt thế hệ trước khi giao việc (R-CDN-1)

Manager tự xác định, ghi vào brief một dòng — đừng để mỗi agent tự đoán:

```
Thế hệ: assets-flat   (bằng chứng: assets/index.html.twig + config.folderUse)
Thế hệ: src-setup     (bằng chứng: src/<gameplay>/{js,scss,html} + src/setup/js/_promotion.js)
```

Dựng campaign mới → nguồn clone phải là assets-flat (R-CDN-2). Thấy task đòi clone campaign legacy →
đây là **điểm dừng hỏi user**, không tự quyết.

## 3. Cổng popup cuối luồng (R-POP-7)

Áp cho mọi mode có sinh/sửa code (trừ `design`, `check` thuần đọc):

1. Trang có gameplay promotion không? Cứ liệu: `prodTemplate` trong `configProduction.html.twig`, hook `pm__`,
   ticket Jira, design có popup nhận quà/điều kiện/lịch sử.
2. Chốt **loại promotion**: lấy từ ticket/spec. Không chắc → **AskUserQuestion đúng 1 câu** (skill
   `check-promotion` không tự đoán loại — người chốt loại là user).
3. Chạy `/check-promotion <loại> <file>`; dán bảng Pass/Fail vào Tổng kết.
4. Còn Fail → giao `frontend-developer` bổ sung popup theo `libraryMainsite-t-popup` (R-POP-1..3), không tự chế markup.
   Checklist đòi popup mà design không có → hỏi user/PM, ghi "Cần quyết định".

## 4. Mode `learn` — chỉ đề xuất, không ghi đè luật

`learn` quét code mới và cập nhật `~/.claude/knowledge/code-developer/base/`. Nó **KHÔNG** được sửa file trong
`~/VNG/agent-auto/rules/`. Thấy code thực tế lệch luật → in ra khối:

```
## Đề xuất sửa luật (user duyệt)
- R-CDN-<n>: luật nói <X>, code mới nhất làm <Y> — bằng chứng <file:line>. Đổi luật? (y/n)
```

Lý do: ảnh chụp code có thể chụp trúng campaign làm ẩu; để nó tự thành luật là cách chuẩn bị trôi mất.

## 5. Bàn giao HTML (R-HO-*)

Task có chữ "đưa lên gt-promotion", "apply mainsite", "giao platform" → brief phải kèm `html-handoff.md` và
nhắc 3 điểm chết người: URL CDN tuyệt đối · giữ `<% MODULE_CONTENT %>` ở bản `Promotion/` · soát **cả**
`Promotion/` lẫn `mainsite/`. Manager KHÔNG commit hộ user ở 2 repo đó — chỉ đưa `git diff --stat`.
