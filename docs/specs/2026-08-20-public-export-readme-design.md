# Xuất bản công khai + README cài đặt 2 hệ điều hành

**Ngày:** 20/8/2026 · **Trạng thái:** đã duyệt thiết kế, chưa thực thi

## Vấn đề

Hai việc, một gốc: repo này sắp được **publish**, mà nó vừa *thiếu* thứ để người khác
start được, vừa *thừa* thứ không được phép ra ngoài.

**Thiếu — cài xong vẫn không giống máy tác giả:**

| Thiếu | Bằng chứng | Hậu quả |
|---|---|---|
| `skills/check-promotion` | symlink `~/.claude/skills/check-promotion` → `gt-promotion-template/standard-html-templates/ai-template-check-skill` | `/daily` bước 04 (soát popup) không có skill để gọi |
| `skills/bug-fixer-lite` + `agents/bug-lane.md` | symlink → `cdn-source/products/tontagent/bug-fixer-lite/` | `bugRadar.autoFix=true` gọi vào skill không tồn tại |
| Nội dung `~/.claude/CLAUDE.md` | không có file nào trong repo chứa bảng routing / R-CS / luật git / luật verify | cài đủ skill nhưng **không có luật điều phối** — hành vi agent khác hoàn toàn tác giả |

**Thừa — 110/234 file tracked có tên nội bộ.** Nặng nhất là `rules/`: 7/8 file
(`pm-contract`, `cdn-source-standard`, `popup-library`, `html-handoff`, `repo-new-mainsite`,
`repo-vportal2view`, `repo-gt-promotion`) là spec platform nội bộ, **không genericize được**.
Kèm `docs/specs` (19), `docs/present` (slide), `knowledge/lessons.md`, `gameMap`,
`skills/daily/references/nexus.md`, host SharePoint thật, `vnggames.atlassian.net`.

**Chặn cứng:** publish repo hiện tại = publish cả git history. Commit `5fa5bb9`, `07fbe52`…
đã chứa toàn bộ rules nội bộ. Xoá file ở commit mới **không** che được lịch sử.

**README hiện tại:** 355 dòng, 15 heading, chỉ hướng dẫn macOS, và mở đầu bằng
"bản phát hành đi kèm cdn-source" — vô nghĩa với người ngoài team.

## Đối tượng & quyết định đã chốt

- Người đọc: **nội bộ VNG, ngoài team FE**. README **tiếng Việt**.
- Repo **được publish** ⇒ loại bỏ nội dung VNG khỏi bản publish.
- Hai skill ngoài repo: **copy vào repo**.
- `CLAUDE.md`: **file mẫu trong repo**, installer dán thêm, không đè.
- Chiến lược: **export sang repo mới, history trắng**.
- Windows: **README 2 nhánh, Windows dùng Git Bash** — không viết installer PowerShell.
- Phạm vi public: **toàn bộ engine + 11 skill, đã scrub**.

## Kiến trúc: hai repo, một chiều

```
agent-auto  (private — nơi làm việc, giữ nguyên cấu trúc hiện tại)
   │  tools/export-public.sh
   ▼
agent-auto-public  (repo mới, history trắng, chỉ sinh ra — không bao giờ pull ngược)
```

Bản public là **sản phẩm phái sinh**. Sửa gì cũng sửa ở private rồi export lại. Nhờ vậy
rules nội bộ + 19 spec vẫn ở cạnh người dùng hằng ngày, còn bản publish không có chúng
trong bất kỳ commit nào.

## Thành phần

### 1. `publish/manifest.txt`

Whitelist đường dẫn, mỗi dòng `+ <path>` (vào) hoặc `- <path>  # lý do` (loại).

Vào: `console/`, `tools/`, `hooks/`, `skills/` (11 skill), `agents/`, `rules/code-style.md`,
`schema/`, `templates/`, `config.example.json`, `state.example.json`, `README.md`, `docs/`
(3 file mới), `.gitignore`.

Ra: 7 file `rules/` nội bộ · `docs/specs/` · `docs/present/` · `docs/README.md` ·
`knowledge/lessons.md` · `skills/daily/references/nexus.md` · `tools/sync-to-cdn.sh` ·
`tools/radar-agent.plist` (đường dẫn cứng của máy tác giả) · `.janitor-log.jsonl`.

**Cổng chống lọt:** script duyệt `git ls-files`; file nào không khớp dòng include lẫn
exclude thì **fail**. File mới thêm sau này buộc phải được phân loại có ý thức.

### 2. `publish/redactions.tsv`

`<chuỗi thật>\t<placeholder>` — áp bằng thay thế chuỗi thuần (không regex) trên nội dung
**và** tên file:

| Thật | Placeholder |
|---|---|
| `cdn-source` | `web-assets` |
| `new-mainsite` | `web-main` |
| `gt-promotion-template` | `promo-template` |
| `vportal2view` | `portal-view` |
| `vnggames.atlassian.net` | `your-company.atlassian.net` |
| project key Jira | `PRJ` |
| host SharePoint | `<sharepoint-host>` |
| `vng.com.vn` | `your-company.com` |
| `/Users/lap17727` | `$HOME` hoặc `<repo>` |

Tên repo trở thành **tên logic**; người dùng trỏ đường dẫn thật trong `config.json`
(đã gitignore, không bao giờ vào git). Mapping tên logic ↔ tên thật + 7 rules nội bộ nằm
trong "VNG overlay" **không publish**, phát riêng nội bộ.

`gameMap` trong `config.example.json` rút về `{}` kèm `_doc` giải thích.

### 3. `publish/denylist.txt`

Regex chặn cứng, chạy **sau** redaction. Còn hit thì không sinh commit. Gồm: tên 4 repo,
`vnggames`, project key, `lap17727`, `vng\.com\.vn`, host SharePoint, mã game trong `gameMap`,
`tont@`. Chạy trên cả working tree **và** `git log -p` của repo export.

### 4. `tools/export-public.sh`

```
copy theo manifest → áp redactions → cổng denylist → chạy test → git init + 1 commit
```

Làm trong thư mục tạm, chỉ `mv` sang đích khi **mọi** cổng pass. Đích đã tồn tại → dừng và
yêu cầu xoá tay; script không tự xoá gì. Có `--dry` in danh sách file + số lần thay thế mà
không ghi.

### 5. `publish/bundled-sources.tsv` + `tools/check-drift.sh`

Copy skill vào repo đánh đổi bằng rủi ro lệch bản gốc. File `.tsv` ghi
`<path trong repo>\t<path gốc>` cho 6 skill + 5 agent đã bundle. `check-drift.sh` `diff` khi
repo gốc có trên máy, bỏ qua im lặng khi không có. Hôm nay đã đo: 4 skill + 4 agent bundle
**khớp 100%** với bản gốc (chỉ lệch một `.DS_Store`) — script này giữ trạng thái đó.

### 6. `templates/CLAUDE.md`

Bản dùng chung của `~/.claude/CLAUDE.md`: luật ngôn ngữ, bảng routing việc→skill, code style
R-CS-1..7, ghi chú guardrail, luật git, luật verify trung thực, luật tinh gọn context, quy ước
UI team. Đường dẫn repo thay bằng token `<AGENT_AUTO>`; installer điền lúc cài. Khối trỏ 7
rules nội bộ **chỉ in khi các file đó tồn tại** — bản public không có chúng nên không in.

Installer: chưa có `~/.claude/CLAUDE.md` → copy và điền token. Đã có → in ra + báo "dán thêm
phần thiếu", **không đè**. Cùng lý do như xử lý `settings.json`: đây là file của người dùng.

### 7. README mới + 3 file `docs/`

`README.md` khoảng 130 dòng, 6 mục:

1. **Đây là cái gì** — 3 câu + sơ đồ ASCII: Jira/design → `/daily` → board + console →
   skill code → gate chất lượng.
2. **Cài 5 bước**, mỗi bước 2 cột **macOS | Windows (Git Bash)**: phụ thuộc (node ≥18,
   python3 + psd-tools, git; Windows thêm Git for Windows + Developer Mode cho symlink) →
   clone + `bash tools/install-skills.sh --write-hooks` → `/mcp` (chỉ Atlassian bắt buộc) →
   sửa 3 dòng `config.json` → **phiên Claude Code mới** + `/daily doctor` = 0 ERROR.
3. **Console (tuỳ chọn)** — `cd console && npm install && npm start`; nói rõ `npm start` =
   `build && serve`, **không** tự install.
4. **Có gì trong này** — bảng 11 skill, 1 dòng/skill: làm gì + khi nào gọi.
5. **Windows chưa chạy được** — 4 mục kèm cách làm tay: notification (`osascript`), radar nền
   (launchd), tải design tự động (`open -a`), `tools/psd-export.py`.
6. **Gỡ cài & lỗi thường gặp** — trỏ `docs/install.md`.

Chi tiết dời sang: `docs/install.md` (bảng MCP đầy đủ, 4 ca `settings.json`, `radar-agent.plist`,
browserpilot vs Playwright MCP, gỡ cài) · `docs/skills.md` (11 skill + mode) ·
`docs/architecture.md` (cấu trúc thư mục, cái gì vào git và vì sao).

## Xử lý sai sót

- Bất kỳ cổng nào fail → **không** sinh repo export. Không có trạng thái nửa vời.
- Thư mục đích tồn tại → dừng, in đường dẫn, không xoá.
- Redaction chỉ thay chuỗi thuần, có in số lần thay mỗi cặp; **0 lần thay** cho một cặp là
  cảnh báo (cặp đó có thể đã sai chính tả).
- `check-drift.sh` phát hiện lệch → in `diff --stat`, không tự đồng bộ (đè bản nào là quyết
  định của người, không phải script).

## Verify

| Cổng | Lệnh | Đạt là |
|---|---|---|
| Unit của chính bộ export | `bash tools/export-public.test.sh` | fixture 5 file: manifest, redaction, denylist, ca "file chưa phân loại" đều pass |
| Test bản export | trong bản export: `npm test`, `npm run test:tools`, 4 `hooks/*.test.sh` | 31 file test pass |
| Installer bản export | `CLAUDE_CONFIG_DIR=<tmp> bash tools/install-skills.sh --check` | chạy tới dòng "Kết quả:" |
| Sạch | `grep -rIE -f publish/denylist.txt` trên working tree **và** `git log -p` | 0 hit |

**Chưa verify được, ghi rõ ngay đây:** máy này không có Windows. Nhánh Windows của README là
hướng dẫn **chưa chạy thử trên máy thật**. Trước khi publish, nhờ một đồng nghiệp dùng Windows
chạy đúng 5 bước và báo lại; tới lúc đó README phải giữ dòng ghi chú "nhánh Windows chưa được
kiểm trên máy thật".

## Không làm (YAGNI)

- Không viết installer PowerShell — chưa có máy Windows để test, viết ra là code không kiểm được.
- Không port `notify.js` / radar sang Windows — README chỉ nêu cách làm tay.
- Không rewrite git history của repo private.
- Không đồng bộ hai chiều giữa private và public.
- Không scrub `docs/specs` để mang ra public — 19 spec chứa quá nhiều chi tiết vận hành thật.
