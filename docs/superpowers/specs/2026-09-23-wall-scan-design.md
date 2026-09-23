# wall-scan — đo thời gian thật theo skill

Ngày: 2026-09-23 · Dự án con 0 của đợt "tăng tốc nhưng giữ chất lượng" (hướng A: đo trước, sửa theo top).

## Vì sao

Đo nháp 14 ngày (1.292 phiên): model phiên chính sinh 70,4h · model subagent 25,6h · tool 26,5h · chờ user 81h.
Model là chỗ tắc, không phải tool. Hai đòn bẩy gần gấp đôi tốc độ mỗi lượt:
effort (`xhigh` 7,4s/lượt vs `medium` 4,0s) và cỡ context (<50k 4,4s vs >300k 8,2s).
`token-scan` chỉ đo token, không đo thời gian — thiếu số trước/sau cho từng skill.

## Đầu ra

```
node tools/wall-scan.mjs [--days 14] [--project <chuỗi>] [--skill <tên>] [--json]
```

- **Tổng quan**: máy chạy (model phiên chính · model subagent · tool) tách khỏi chờ user.
- **Theo skill**: số lần chạy, thời gian mỗi lần (trung vị / p90), chia vào model · tool theo tên · subagent.
- **Đòn bẩy**: thời gian model chia theo effort và theo cỡ context (<50k · 50–150k · 150–300k · >300k).
- `--skill <tên>`: top 10 lệnh Bash chậm nhất và số lượt model trung bình mỗi lần chạy của skill đó.
- `--json`: cùng dữ liệu, để lưu baseline.

## Luật cắt thời gian

| Khoản | Cách tính |
|---|---|
| Model | từ dòng có timestamp liền trước → dòng assistant. Khoảng > 15 phút = gián đoạn, bỏ |
| Tool | `tool_use` → `tool_result` cùng id. Khoảng > 1 giờ bỏ |
| AskUserQuestion | tính vào chờ user, không vào máy chạy |
| Chờ user | trả lời cuối của model → tin user thật (không phải tool_result, không `isMeta`). Khoảng > 24 giờ bỏ |
| Skill của một khoảng | `attributionSkill` của dòng assistant kết thúc khoảng (model) hoặc dòng assistant chứa `tool_use` (tool). Không có → `(ngoài skill)` |
| Một lần chạy skill | chuỗi dòng assistant liên tiếp cùng `attributionSkill`; thời gian = tổng máy chạy trong chuỗi (không tính chờ user) |
| Subagent | file dưới `<phiên>/subagents/**`: khoảng model + tool tính như trên, gắn vào skill của dòng assistant phát ra `Agent` tương ứng (nối qua `toolUseResult.agentId` ↔ tên file `agent-<id>.jsonl`). Không nối được → `(subagent không rõ skill)` |

`attributionSkill` chỉ gắn trên dòng assistant (đã kiểm 3 ngày: 3.172/11.370 dòng assistant, 0 dòng loại khác), nên không được giữ "dính" qua các dòng.

## Cấu trúc

- `tools/wall-scan.mjs` theo khuôn `token-scan.mjs`: 1 file, không phụ thuộc ngoài.
- Hàm thuần `sliceSession(lines, { skillOf })` trả các khoảng `{kind, skill, seconds, tool?, effort?, ctx?, cmd?}`; `summarize(slices)` gộp số. Phần đọc file/CLI tách riêng.
- `tools/wall-scan.test.mjs` (`node --test`) trên transcript giả dựng trong test, đủ: khoảng model, khoảng tool, AskUserQuestion vào chờ user, gián đoạn > 15 phút bị bỏ, subagent gắn đúng skill cha, chuỗi chạy skill tách đúng.

## Nghiệm thu

- Test xanh.
- Chạy thật `--days 14`: tổng model/tool/chờ lệch lượt đo nháp phải giải thích được (đo nháp gắn skill kiểu "dính", nên số theo skill giảm là đúng hướng).
- Lưu baseline `--json` vào `docs/notes/wall-baseline-2026-09-23.json` làm mốc so sau khi tối ưu từng skill.

## Ngoài phạm vi

Không sửa skill, không đưa vào console. Việc tối ưu từng skill là dự án con 1+ dùng số của công cụ này.
