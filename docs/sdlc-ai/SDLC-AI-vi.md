# SDLC làm việc với AI — Frontend

AI = Claude Code chạy trong terminal, gắn bộ công cụ và bộ luật riêng của FE.
Người giữ 5 cổng quyết định; AI không tự đẩy code ra ngoài.


> **Bản tương tác (khuyên dùng khi trình bày):** mở [`sdlc-ai.html`](sdlc-ai.html) trong trình duyệt — 7 tab theo giai đoạn, hover lần theo luồng, click node xem chi tiết, nút ▶ chạy luồng dừng ở từng cổng người.


```mermaid
---
config:
  theme: base
  fontFamily: "Arial, Helvetica, sans-serif"
  themeVariables:
    fontSize: 15px
  flowchart:
    htmlLabels: true
    wrappingWidth: 420
    curve: linear
    nodeSpacing: 40
    rankSpacing: 50
---
flowchart TB

START(["BẮT ĐẦU"])

subgraph P1["GĐ 1 · NHẬN VIỆC"]
  direction TB
  S1["Nguồn việc: Jira · chat/mail · buglist QC"]
  S2["AI quét Jira, bóc brief, dò design"]
  S3["Suy tiến độ từ commit, không tin ticket"]
  S4["AI trình kế hoạch ngày"]
  S1 --> S2 --> S3 --> S4
end

H1{{"CỔNG NGƯỜI 1 · Duyệt kế hoạch"}}
START --> S1
S4 --> H1
H1 -- "sửa" --> S4

subgraph P2["GĐ 2 · DESIGN → ASSET"]
  direction TB
  D1{"Design đã giao?"}
  A1["Soát design, soạn nội dung đòi PM"]
  W1["Chờ PM / Designer"]
  A2["Tải design về kho ticket"]
  D2{"Nguồn design?"}
  A3["Bóc PSD qua Photoshop → file toạ độ"]
  A4["Bóc Figma qua API → file toạ độ"]
  A5["Bóc video thành mô tả text/số"]
  A6["Ảnh PNG/JPG dùng trực tiếp"]
  G1{"Đủ để dựng?"}
  D1 -- "chưa" --> A1 --> W1 --> D1
  D1 -- "rồi" --> A2 --> D2
  D2 -- "PSD/PSB" --> A3
  D2 -- "Figma" --> A4
  D2 -- "video" --> A5
  D2 -- "ảnh" --> A6
  A3 --> G1
  A4 --> G1
  A5 --> G1
  A6 --> G1
  G1 -- "thiếu" --> A1
end

H1 -- "duyệt" --> D1

subgraph P3["GĐ 3 · CODE"]
  direction TB
  C0["Nạp bộ luật nội bộ trước khi sửa file"]
  C1{"Quy mô?"}
  C2["Sửa vặt: dev làm thẳng, ≤2 file"]
  C3["Nhỏ: 1 AI, ≤4 file"]
  C4["Vừa: 1 AI code + 1 AI soát"]
  C5["Lớn: 3 AI — phân tích design · code · đối chiếu"]
  C6["Bug: truy nguyên nhân gốc trước"]
  C7["Hàng rào tự động chặn mọi lệnh"]
  C0 --> C1
  C1 -- "vặt" --> C2
  C1 -- "nhỏ" --> C3
  C1 -- "vừa" --> C4
  C1 -- "lớn" --> C5
  C1 -- "bug" --> C6
  C2 --> C7
  C3 --> C7
  C4 --> C7
  C5 --> C7
  C6 --> C7
end

G1 -- "đủ" --> C0

subgraph P4["GĐ 4 · TỰ KIỂM"]
  direction TB
  V1["Build thật, đọc log"]
  V2["Chặn asset thiếu: font, ảnh 404, dist cũ"]
  V3["Đối chiếu UI browser thật vs toạ độ design"]
  V4["Soát đủ popup theo loại chiến dịch"]
  V5["Soát chất lượng code theo luật"]
  V6{"PASS?"}
  V1 --> V2 --> V3 --> V4 --> V5 --> V6
end

C7 --> V1
V6 -- "FAIL · kèm file:dòng" --> RW

subgraph P5["GĐ 5 · NGƯỜI DUYỆT"]
  direction TB
  H2{{"CỔNG NGƯỜI 2 · Duyệt diff"}}
  M1["Commit chuẩn, ghi AI đồng tác giả"]
  H3{{"CỔNG NGƯỜI 3 · Lệnh push"}}
  M2["Push nhánh riêng + tạo MR"]
  H4{{"CỔNG NGƯỜI 4 · Bấm Merge"}}
  M3["Bàn giao HTML sang repo backend"]
  H2 --> M1 --> H3 --> M2 --> H4 --> M3
end

V6 -- "PASS" --> H2
H2 -- "chưa đạt" --> RW

subgraph P6["GĐ 6 · QC và BUG"]
  direction TB
  Q1["QC ghi buglist lên Google Sheets"]
  Q2["Radar buglist: lọc bug của FE"]
  Q3["Nhiều AI fix song song theo cụm file"]
  Q4["Ghi ngược sheet: Done + routing"]
  Q5{"Còn bug FE?"}
  Q1 --> Q2 --> Q3 --> Q4 --> Q5
end

M3 --> Q1
Q5 -- "còn" --> RW

subgraph P7["GĐ 7 · CHỐT và HỌC"]
  direction TB
  F1["Audit trước production"]
  F2["Chốt ngày, metrics đo từ commit"]
  F3["Ghi sổ bài học"]
  F4["Bài học → luật → hàng rào tự động"]
  F1 --> F2 --> F3 --> F4
end

Q5 -- "hết" --> F1
H5{{"CỔNG NGƯỜI 5 · Đánh Done Jira"}}
F2 --> H5
END(["KẾT THÚC"])
H5 --> END
F4 -. "áp cho mọi task sau" .-> RW

RW{"QUAY LẠI SỬA"}
RW --> C0

classDef ai fill:#d5f5e3,stroke:#27ae60,stroke-width:1.5px,color:#14532d
classDef human fill:#fdebd0,stroke:#e67e22,stroke-width:3px,color:#7e3f00
classDef gate fill:#d6eaf8,stroke:#2e86c1,stroke-width:1.5px,color:#12435e
classDef dec fill:#fff9e6,stroke:#b7950b,stroke-width:1.5px,color:#6b5200
classDef wait fill:#f2f3f4,stroke:#909497,stroke-width:1.5px,color:#424949
classDef term fill:#eaeded,stroke:#566573,stroke-width:2px,color:#212f3c

class S1,S2,S3,S4,A1,A2,A3,A4,A5,A6,C0,C2,C3,C4,C5,C6,M1,M2,M3,Q3,Q4,F2,F3,F4 ai
class H1,H2,H3,H4,H5 human
class C7,V1,V2,V3,V4,V5,Q2,F1 gate
class D1,D2,G1,C1,V6,Q5,RW dec
class W1,Q1 wait
class START,END term
```

| Màu | Nghĩa |
|---|---|
| Xanh lá | AI thực thi |
| Xanh dương | Cổng kiểm cơ học — phải có output thật mới qua |
| Cam, lục giác | Cổng người — AI dừng |
| Vàng, thoi | Rẽ nhánh |
| Xám | Chờ PM / QC |
