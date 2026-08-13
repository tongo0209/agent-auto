# Schema `run.json` và mẫu đầu ra

## 1. `run.json` — thứ bạn nộp cho `gap-store.mjs`

```jsonc
{
  "key": "GW-713",
  "depth": "deep",                    // "deep" (có soi PSD) | "fast" (--fast)
  "files": {                          // tầng file, lấy từ sp-coverage.mjs
    "downloaded": 6,
    "missingSource": 1,
    "newerAtSource": 0,
    "note": "PSB promotion 75.7MB chưa tải xong"
  },
  "items": [
    {
      "id": "frame4-popup",           // slug ỔN ĐỊNH giữa các lần chạy — đổi id = DELTA tưởng mục mới
      "label": "Popup content của menu frame 4",
      "kind": "màn",                  // màn | biến-thể | trạng-thái | asset | file-nguồn
      "source": {                     // BẮT BUỘC nếu muốn vào rổ THIẾU
        "from": "docx",               // brief | docx | jira-desc | jira-comment
        "ref": "note_dev_landing.docx",
        "quote": "mỗi menu mở popup content; animation zoom-in-out"
      },
      "milestone": "html",            // id mốc trong schema/vocab.json, có thì ghi
      "verdict": "THIẾU",             // ĐỦ | THIẾU | CHƯA-CHẮC | KHÔNG-ÁP-DỤNG
      "evidence": {
        "looked": ["SUBWEB-VLTT_PC.jpg", "SUBWEB VLTT_PC.psb (layer tree)"],
        "found": null,                // ĐỦ thì BẮT BUỘC: "file.jpg y≈2400–3100" hoặc "/Frame4/popup"
        "blockedBy": null             // CHƯA-CHẮC thì BẮT BUỘC: kẹt vì cái gì
      }
    }
  ],
  "asks": [                           // rổ 2 — từ references/ask-checklist.md
    { "id": "share-image", "label": "Ảnh share mạng xã hội", "why": "brief ghi 'PM update sau'" }
  ]
}
```

Script sẽ **tự sửa** verdict của bạn khi vi phạm luật cứng:

| Bạn khai | Điều kiện | Script đổi thành |
|---|---|---|
| `THIẾU` | `evidence.looked` không có file `.psd/.psb` | `CHƯA-CHẮC` + `blockedBy` "chưa soi PSD/PSB…" |
| `THIẾU` / `CHƯA-CHẮC` | không có `source.quote` | chuyển sang `asks[]` (rổ 2) |
| `ĐỦ` | không có `evidence.found` | `CHƯA-CHẮC` |
| bất kỳ chữ nào ngoài enum | — | `CHƯA-CHẮC` |

## 2. Mẫu bảng báo cáo cho user

```
GW-713 — soát design 13/08 15:20   ĐỦ 12 · THIẾU 2 · CHƯA CHẮC 1 · hỏi thêm 4
Tầng file: 6/7 file (PSB promotion 75.7MB chưa tải xong)
→ Kết luận: dựng được frame 1, 3, 5; frame 2 và 4 phải chờ design popup.

❌ THIẾU (nguồn có đòi)
 1. Popup content menu frame 4 — note_dev_landing.docx: "mỗi menu mở popup content"  [mốc HTML 05/08]
    đã soi: SUBWEB-VLTT_PC.jpg, SUBWEB VLTT_PC.psb (cây layer) — không có layer popup nào
 2. ...

❓ CHƯA CHẮC
 1. Popup frame 2 — kẹt: PSB promotion 75.7MB chưa tải xong

💬 Nguồn không nói — nên hỏi PM
 - Ảnh share mạng xã hội (brief ghi "PM update sau")
 - Trạng thái hover của 5 menu header
```

## 3. Mẫu block copy gửi PM

`gap-store.mjs` tự render sẵn ở cuối `design-gap.md`, dạng:

```
Chào anh/chị, em soát lại design cho GW-713 ngày 2026-08-13, còn mấy mục cần anh/chị bổ sung ạ:
1. Popup content của menu frame 4 — trong note_dev_landing.docx có ghi "mỗi menu mở popup content" (liên quan mốc html)

Mấy mục sau nguồn không nhắc tới, anh/chị xác nhận giúp em có cần không ạ:
- Ảnh share mạng xã hội
```

Cần sửa lời cho hợp ngữ cảnh thì sửa khi gửi — đừng sửa vào file.
