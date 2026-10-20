export const VERDICT_FOOTER = `
---
Kết thúc câu trả lời bằng ĐÚNG MỘT khối dưới đây (khối cuối cùng được tính):

\`\`\`autopilot-verdict
{"verdict": "pass|revise|fail", "blocking": ["lỗi chặn, mỗi dòng 1 việc"], "advisory": ["góp ý không chặn"], "files": ["đường dẫn file đã sửa, tương đối với repo"], "note": "1 câu tóm tắt"}
\`\`\`

- pass: xong việc của stage này. revise: còn lỗi chặn (bắt buộc liệt kê trong blocking). fail: không làm được.
- KHÔNG hỏi user giữa chừng: câu hỏi cần user trả lời → verdict "fail", ghi câu hỏi vào blocking.`;

export function renderPrompt(template, vars, marker) {
  const body = template.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? '');
  return `AUTOPILOT_RUN: ${marker}\n${body}\n${VERDICT_FOOTER}`;
}
