# agent-auto

Bộ điều phối công việc hằng ngày cho dev frontend, chạy trên **Claude Code**: quét ticket Jira của
bạn, dò design đã giao, suy tiến độ thật từ commit, trình kế hoạch cho bạn duyệt 1 lần rồi tự
chạy, và chặn lại ở cổng chất lượng trước khi bạn báo "xong".

```
Jira + design ──▶ /daily ──▶ board hôm nay + console web
                    │             │
                    │             └─▶ terminal thật: /code-developer, /bug-fixer, /ui-check …
                    └─▶ cổng chất lượng (fe-gate, check-promotion, hook guardrail)
```

Repo này chứa **11 skill**, **5 agent**, **4 hook guardrail**, **console web local** và các tool
đo/dọn. Cài bằng 1 lệnh; `~/.claude/` chỉ chứa symlink trỏ vào đây nên `git pull` là có bản mới.

---

## 1. Cần gì trước khi cài

| Cần | macOS | Windows (Git Bash) |
|---|---|---|
| **Claude Code** (bản CLI, không phải panel trong VS Code) | `npm i -g @anthropic-ai/claude-code` | như macOS |
| **Node.js ≥ 18** | `brew install node` | tải ở nodejs.org |
| **Bash** | có sẵn | **Git for Windows** — mọi lệnh dưới đây gõ trong **Git Bash** |
| **Python 3 + psd-tools** (chỉ cho `/check-design`) | `pip3 install psd-tools` | `pip install psd-tools` |
| **Plugin `superpowers`** | `/plugin marketplace add obra/superpowers` rồi `/plugin` → cài `superpowers` | như macOS |
| **Đã clone sẵn các repo code** bạn làm việc trên đó | | |

> **Windows — symlink:** Git Bash mặc định *copy* thay vì tạo symlink, khi đó `git pull` sẽ **không**
> cập nhật skill. Bật **Developer Mode** (Settings → Privacy & security → For developers) rồi chạy
> `export MSYS=winsymlinks:nativestrict` trước khi cài.

## 2. Cài — 5 bước

```bash
git clone <url> ~/agent-auto          # clone chỗ nào cũng được, script tự dò đường dẫn
bash ~/agent-auto/tools/install-skills.sh --write-hooks
```

Script symlink `skills/` `hooks/` `agents/` vào `~/.claude/`, tạo `config.json` + `state.json` từ
bản mẫu, tạo `~/.claude/CLAUDE.md` từ `templates/`, ghi hook + statusline vào `settings.json`.
Nó **không xoá gì**: gặp file thật trùng tên thì đổi tên `.bak-<n>` rồi mới link; `settings.json`
đã có hook của thứ khác thì chỉ in khối JSON để bạn gộp tay. Xem trước bằng `--check`.

Còn 4 việc phải tự làm — installer in sẵn danh sách kèm trạng thái máy bạn:

| # | Việc | Làm thế nào |
|---|---|---|
| 1 | **Nối MCP** | Trong Claude Code gõ `/mcp`. Chỉ **Atlassian** là bắt buộc (quét Jira). Google Drive (đọc buglist sheet) và Microsoft 365 (dò design trên SharePoint) thiếu thì mất đúng nhánh đó. |
| 2 | **Sửa `config.json`** | 3 chỗ: `cloudId` (hỏi Claude *"cho tôi cloudId Jira"*), `gitAuthor` (= `git config user.email`), `repos` (đường dẫn tuyệt đối tới repo trên máy bạn). Để nguyên `<...>` thì doctor báo `E10`. |
| 3 | **Nối browser** (tuỳ chọn) | `/chrome` → *Enabled by default*. Cần cho nhánh tải design cả folder và ghi ngược sheet QC. |
| 4 | **Mở phiên Claude Code MỚI** rồi `/daily doctor` | Skill chỉ nạp lúc khởi động. **0 ERROR** mới là cài xong. |

Chi tiết từng ca lỗi, bảng `config.json` đầy đủ, cách gỡ cài: **[docs/install.md](docs/install.md)**.

## 3. Console web (tuỳ chọn)

```bash
cd ~/agent-auto/console
npm install        # lần đầu thôi — `npm start` KHÔNG tự install
npm start          # rồi mở http://127.0.0.1:4747
```

Cockpit 4 tab (task/mốc/cảnh báo/git của bạn) **bọc terminal thật** — nút bấm chỉ gõ hộ lệnh vào
tab đang mở, mọi cổng duyệt vẫn nguyên vì bản chất vẫn là CLI. Console chỉ ghi 4 chỗ (board,
metrics, phase log, handoff) và **không bao giờ** commit/push.

`npm install` lỗi ở `node-pty`: macOS cần `xcode-select --install`, Windows cần **Visual Studio
Build Tools** (workload C++).

## 4. Có gì trong này

| Skill | Dùng khi |
|---|---|
| `/daily` | Điều phối ngày: quét Jira → kế hoạch → chạy → chốt. Có `plan` `week` `prep` `delta` `wrap` `status` `doctor`. |
| `/code-developer` | Dựng hoặc sửa UI frontend theo ảnh design / yêu cầu. Điều phối 4 agent. |
| `/check-design` | Design đã giao có ĐỦ để dựng chưa — thiếu gì thì đòi PM cái gì. |
| `/ui-check` | Soi output đã build (`dist/`) qua browser thật: ảnh 404, chữ bị cắt, tràn ngang, lệch design. |
| `/check-promotion` | Soát HTML landing đã đủ popup theo loại chiến dịch, trước khi giao QA. |
| `/bug-fixer` | Buglist QC (Google Sheets / doc / file): lọc bug của mình, điều tra, fix, ghi ngược. |
| `/bug-fixer-lite` | Bản gọn của trên: chạy 1 lệnh, fix song song theo cụm file, tự ghi sheet. |
| `/code-audit` | Soi source trước khi merge/push. Không sửa gì. |
| `/clean-code` | Dọn code rườm theo `rules/code-style.md` rồi build verify. |
| `/website-audit` | Audit trước production: validation, performance, ảnh, font, SEO. |
| `/commit` | Commit theo chuẩn Conventional Commits + footer co-author. |

Kèm **5 agent** (`agents/`) cho các skill trên, **4 hook guardrail** chặn lệnh nguy hiểm và cảnh báo
comment thừa, **`rules/code-style.md`** (R-CS-1..7) là nguồn luật dùng chung cho hook và
`/clean-code`. Một số skill còn trỏ tới các file luật **riêng của nền tảng nội bộ** không đi kèm bản
này — thiếu chúng thì skill vẫn chạy, chỉ mất đúng cổng kiểm đó; cách bù:
[`rules/README.md`](rules/README.md).

Danh sách mode từng skill: **[docs/skills.md](docs/skills.md)**. Cấu trúc repo, cái gì vào git, cổng
chất lượng, chi tiết guardrail: **[docs/architecture.md](docs/architecture.md)**.

## 5. Windows: cái gì chưa chạy

Skill, hook, console, `/daily`, các tool đo đều chạy. Bốn nhánh sau **hiện chỉ có trên macOS**:

| Chưa chạy | Vì sao | Làm tay thay thế |
|---|---|---|
| Thông báo desktop của console | dùng `osascript` | đọc dải cảnh báo trên console |
| Radar nền tự chạy theo giờ | job `launchd` | gọi `/daily delta` khi cần |
| Tải design cả folder tự động | mở browser bằng `open -a` | tải tay về `designs/<KEY>/` |
| `tools/psd-export.py` | `osascript` | export ảnh từ Photoshop tay |

> ⚠ Nhánh Windows **chưa được chạy thử trên máy Windows thật** — nếu bạn là người đầu tiên cài trên
> Windows, báo lại chỗ vướng để sửa README này.

## 6. Cái gì KHÔNG đi kèm bản này — và cách tự bù

Bộ này lớn lên trong một tổ chức cụ thể. Phần đặc tả riêng của nền tảng đó không phát hành kèm, nên
có vài chỗ bạn sẽ thấy skill nhắc tới file không tồn tại. Không có chỗ nào **chết**, chỉ mất đúng
cổng kiểm tương ứng — và mỗi thứ đều có đường tự thêm:

| Thiếu | Bạn sẽ nhận ra khi | Tự bù thế nào |
|---|---|---|
| 7 file luật nền tảng trong `rules/` (`pm-contract`, `popup-library`, `html-handoff`, …) | skill/agent nhắc mã luật `R-PM-*`, `R-POP-*`, `R-HO-*`, `R-CDN-*` mà không tìm ra file | viết file của bạn rồi khai 1 dòng vào `templates/rules-index.tsv` → [`rules/README.md`](rules/README.md) |
| Khối luật nền tảng trong `~/.claude/CLAUDE.md` (routing `pm__`, hợp đồng class/`id`/`data-*`) | agent sửa HTML platform mà không biết class nào là hook | tạo `templates/CLAUDE.internal.md`, installer tự nối vào cuối → [`templates/README.md`](templates/README.md) |
| Trục "hợp đồng platform" của `/code-audit` | báo cáo audit chỉ còn 4 trục | viết `skills/code-audit/references/pm-contract.md` theo khuôn có sẵn trong chính file stub đó |
| `knowledge/lessons.md` | `/code-developer` không có bài học nào để đọc trước khi giao việc | file tự sinh khi `fe-gate` FAIL lần đầu; khuôn ở [`knowledge/README.md`](knowledge/README.md) |
| `config.gameMap` rỗng | ticket của sản phẩm mới không tự nối được với folder chiến dịch | thêm cặp `"<3 ký tự đầu tên folder>": "<mã sản phẩm>"` vào `config.json` |
| 4 nhánh chỉ chạy trên macOS | xem mục 5 ngay trên | làm tay theo cột "làm tay thay thế" |

## 7. Ranh giới an toàn

- Skill **không** commit, **không** push, **không** ghi gì lên Jira — bạn review diff rồi tự đẩy.
- Hook chặn: `rm -rf /`, `curl | sh`, đọc file secret, force-push nhánh chung, câu lệnh xoá bảng/DB.
  Hỏi trước: `git push`, `git reset --hard`, script deploy, `rm` nhắm dữ liệu của bạn.
- `config.json` (đường dẫn máy bạn) và `state.json` (dữ liệu công việc của bạn) **không vào git**.
- Bản mẫu `config.example.json` dùng **tên logic** cho các repo (`web-assets`, `web-main`,
  `promo-template`, `portal-view`); bạn trỏ chúng sang đường dẫn thật trên máy mình.
