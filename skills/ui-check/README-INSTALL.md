# Cài skill ui-check (Claude Code)

Skill kiểm tra output build (`dist/`) của landing/skin cdn-source: ảnh vỡ, chữ cắt,
section trống, 404 asset, tràn ngang, font lỗi — và so với ảnh design khi có baseline.

## Yêu cầu

- Claude Code (CLI hoặc desktop app)
- Node.js (skill dùng `npx http-server` để serve dist)
- Browser MCP: browserpilot HOẶC Playwright MCP (không có → skill chỉ check tĩnh)

## Cài

Skill này sống trong repo `agent-auto` (`skills/ui-check/`) vì Bước 0a gọi
`agent-auto/tools/fe-gate.mjs`. Cài bằng script chung của repo:

```bash
bash ~/VNG/agent-auto/tools/install-skills.sh
```

Kết quả phải là `~/.claude/skills/ui-check` → symlink vào repo. Mở phiên Claude Code mới
là skill tự xuất hiện. Sửa skill = sửa file trong repo, không cần cài lại.

## Dùng

Mở Claude Code tại folder campaign (nơi có `package.json` + `config.js`), gõ:

```
/ui-check
```

hoặc nói tự nhiên: "check UI giúp tôi", "kiểm tra dist trước khi giao QC".
Muốn cho phép tự sửa path hỏng không nhập nhằng: `/ui-check --fix`.
So với design: đưa kèm đường dẫn ảnh design trong lời gọi.

## Update phiên bản mới

Chạy lại đúng lệnh unzip trên (ghi đè).
