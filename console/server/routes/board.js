const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { dir } = require('../lib/paths');
const { todayStr } = require('../lib/fsutil');
const { snapshot, writeAtomic } = require('../lib/backup');
const { parseNeedYou, setChecked, appendToSection, matchesExpect } = require('../lib/needyou');

const router = Router();

/**
 * Tick / bỏ tick một mục "Cần bạn" ngay trên console.
 *
 * Đây là CHỖ DUY NHẤT console được ghi vào board (mọi chỗ khác chỉ đọc). Quy ước ghi theo
 * đúng cách user đang gạch tay: `- [x] ~~việc đã xong~~`.
 *
 * Chống race với agent đang ghi board cùng lúc: client phải gửi `expectText`; không khớp
 * dòng hiện tại → 409, client reload rồi hiện lại chứ không ghi đè.
 *
 * Việc "một mục trải tới dòng nào" nằm trong `lib/needyou.js` — route này không tự bóc nữa.
 * Bản cũ tick bằng cách sửa ĐÚNG MỘT DÒNG nên mục nhiều dòng bị gạch nửa câu, nửa còn lại
 * treo lại ngoài mục (tái hiện được trên board 2026-08-12, 4/5 mục là mục nhiều dòng).
 */
function boardFile(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const p = path.join(dir.boards, date + '.md');
  return p.startsWith(dir.boards + path.sep) ? p : null;
}

router.post('/board/check', (req, res) => {
  const { date, index, done, expectText } = req.body || {};
  const p = boardFile(String(date || ''));
  if (!p) return res.status(400).json({ error: 'date phải là YYYY-MM-DD' });
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'không có board ' + date });
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'index không hợp lệ' });

  const md = fs.readFileSync(p, 'utf8');
  const items = parseNeedYou(md);
  const item = items.find((i) => i.index === index);
  if (!item) return res.status(404).json({ error: `section chỉ có ${items.length} mục, không có mục #${index}` });

  if (expectText !== undefined && !matchesExpect(expectText, item.text))
    return res.status(409).json({ error: 'board đã đổi từ lúc bạn mở trang', current: item.text });

  const out = setChecked(md, index, done);
  if (!out) return res.status(404).json({ error: 'board không có section "Cần bạn"' });

  const backup = snapshot(p, 'boards');
  writeAtomic(p, out.md);
  res.json({ ok: true, line: out.line, backup: backup ? path.basename(backup) : null });
});

/**
 * POST /api/board/append { date?, section: 'Cần bạn' | 'Log', text }
 *
 * Thêm 1 dòng vào board. Với `Log`, **server tự lấy giờ máy** rồi ghi `HH:MM — <text>` —
 * đây là cách chặn tận gốc lỗi ghi literal `HH:MM` (đã sai 3 board liền): người ghi không
 * có cơ hội gõ giờ sai vì không ai gõ giờ nữa.
 */
const SECTIONS = { 'Cần bạn': 'need', Log: 'log' };

router.post('/board/append', (req, res) => {
  const { date, section, text } = req.body || {};
  const clean = String(text || '').replace(/[\r\n]+/g, ' ').trim();
  if (!clean) return res.status(400).json({ error: 'text trống' });
  if (clean.length > 500) return res.status(400).json({ error: 'text quá dài (>500 ký tự)' });
  if (!SECTIONS[section]) return res.status(400).json({ error: 'section phải là "Cần bạn" hoặc "Log"' });

  const day = String(date || todayStr());
  const p = boardFile(day);
  if (!p) return res.status(400).json({ error: 'date phải là YYYY-MM-DD' });

  const md = fs.existsSync(p)
    ? fs.readFileSync(p, 'utf8')
    : ['# Board ' + day, '', '## Log', '', '## Cần bạn', ''].join('\n');

  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const line = section === 'Log' ? `- ${hhmm} — ${clean}` : `- [ ] ${clean}`;

  // Điểm chèn do `lib/needyou.js` quyết: SAU TRỌN mục cuối, không phải sau dòng bullet cuối.
  // Bản cũ neo vào dòng bullet nên chèn vào GIỮA mục nhiều dòng, rồi cú tick sau đó gộp khối và
  // xoá vĩnh viễn các dòng tràn của mục cũ (tái hiện thật trên board 3/8 và 12/8).
  const out = appendToSection(md, section, line);

  const backup = snapshot(p, 'boards');
  writeAtomic(p, out.md);
  res.json({ ok: true, line, date: day, backup: backup ? path.basename(backup) : null });
});

module.exports = router;
