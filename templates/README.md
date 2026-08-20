# templates/ — luật chung được lắp ra `~/.claude/CLAUDE.md`

`tools/install-skills.sh` lắp file `~/.claude/CLAUDE.md` từ đây. Xem trước bản sẽ lắp:

```bash
bash tools/install-skills.sh --print-claude-md
```

Installer **chỉ ghi khi `~/.claude/CLAUDE.md` chưa có**. Đã có rồi thì nó in ra và để bạn tự dán
phần thiếu — file đó là của bạn, có thể đã chứa luật riêng.

| File | Vai trò |
|---|---|
| `CLAUDE.md` | Phần dùng chung: luật ngôn ngữ, routing loại việc → skill, code style `R-CS-1..7`, ghi chú guardrail, luật git, verify trung thực, tinh gọn context, quy ước UI |
| `rules-index.tsv` | Sinh bảng "chạm tới cái gì → đọc file luật nào". Chỉ in dòng có **file thật** trong `rules/` |
| `CLAUDE.internal.md` | *(không đi kèm bản public)* Luật riêng của nền tảng nội bộ, được **nối vào cuối** nếu file tồn tại |

## Thêm luật riêng của bạn

**Cách 1 — khối luật riêng của tổ chức bạn.** Tạo `templates/CLAUDE.internal.md`, installer tự nối
vào cuối `CLAUDE.md`, không cần sửa gì thêm:

```markdown
## Routing bổ sung
| Loại việc | Đường ray |
|---|---|
| Chạm file có class `xx__` (hợp đồng JS platform) | đọc `rules/xx-contract.md` TRƯỚC khi sửa |

## Hợp đồng platform của chúng ta
- `xx__…` / `id` đặc biệt / `data-*` = hook JS platform đọc: cấm đổi tên, cấm xoá.
- Bẫy: `xx__btn-a` (gạch ngang) vs `xx__btn_a` (gạch dưới) — copy nhầm là nút chết.
```

Bản public **không** mang file này. Nếu bạn thấy skill nhắc `pm__`, hợp đồng platform hay luật
`R-PM-*`/`R-CDN-*`/`R-POP-*`/`R-HO-*` mà không tìm ra file luật — đó chính là khối này, xem
[`../rules/README.md`](../rules/README.md).

**Cách 2 — thêm một file luật vào bảng.** Viết file vào `rules/`, khai 1 dòng vào `rules-index.tsv`
(3 cột, cách nhau bằng **tab**):

```
rules/xx-contract.md	File có `xx__` (mọi repo)	`rules/xx-contract.md` — R-XX-1..6
```

Rồi chạy lại installer. Dòng nào không có file thật thì tự biến mất khỏi bảng — không bao giờ trỏ
vào hư không.

**Cách 3 — sửa luật dùng chung.** Sửa `CLAUDE.md` ở đây rồi chạy lại installer (nếu
`~/.claude/CLAUDE.md` đã có, dùng `--print-claude-md` rồi dán phần đổi). Sửa trong repo thì commit
được và cả team pull về là có.
