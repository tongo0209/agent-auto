const BLOCK = /```autopilot-verdict\s*\n([\s\S]*?)```/g;
const VERDICTS = ['pass', 'revise', 'fail'];

const malformed = (note) => ({ verdict: 'fail', blocking: [], advisory: [], files: [], note, malformed: true });

export function parseVerdict(text = '') {
  const last = [...text.matchAll(BLOCK)].at(-1);
  if (!last) return malformed('thiếu khối autopilot-verdict');

  let raw;
  try {
    raw = JSON.parse(last[1]);
  } catch {
    return malformed('khối autopilot-verdict không phải JSON');
  }
  if (!VERDICTS.includes(raw.verdict)) return malformed(`verdict lạ: ${raw.verdict}`);

  const blocking = raw.blocking ?? [];
  // review "revise" mà không nêu lỗi chặn nào thì không có gì để sửa
  const verdict = raw.verdict === 'revise' && blocking.length === 0 ? 'pass' : raw.verdict;
  return { verdict, blocking, advisory: raw.advisory ?? [], files: raw.files ?? [], note: raw.note ?? '', malformed: false };
}
