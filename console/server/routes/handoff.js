const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { dir } = require('../lib/paths');
const { parseChecklist } = require('../lib/board');
const { snapshot, writeAtomic } = require('../lib/backup');

/**
 * Sổ bàn giao `tasks/<KEY>/handoff.md` — sinh ra khi ticket đổi assignee (`phase: reassigned`)
 * để chở 4 việc NGOÀI REPO mà chỉ nằm trong field `note` của state.json (không ai ngoài user
 * đọc). Console hiện checklist này trong drawer ticket và tick được như "Cần bạn" của board.
 *
 * Lưu ý brief đoán tên hàm ghi atomic là `writeFileAtomic` — server/lib/backup.js phơi ra
 * `writeAtomic(filePath, content)` (không có tham số bucket) đi cùng `snapshot(filePath, bucket)`
 * lo phần backup. Dùng đúng khuôn 2 hàm này như routes/board.js đang làm.
 */
const router = Router();

// key phải khớp mẫu JIRA (VD: GW-654) TRƯỚC KHI ghép vào đường dẫn file — thiếu bước này là
// lỗ path traversal (key = "../../etc/passwd" chẳng hạn).
const KEY_RE = /^[A-Z]+-\d+$/;

const fileFor = (key) => path.join(dir.tasks, key, 'handoff.md');

router.get('/handoff/:key', (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return res.status(400).json({ error: 'key không hợp lệ (mẫu ABC-123)' });

  const p = fileFor(key);
  // Chưa có sổ bàn giao KHÔNG phải lỗi — phần lớn ticket còn trong tay mình thì không cần file
  // này. Trả 200 rỗng, KHÔNG tự tạo file rỗng (tạo file rỗng thì state-doctor W3 tắt cảnh báo sai).
  if (!fs.existsSync(p)) return res.json({ exists: false, items: [] });

  res.json({ exists: true, items: parseChecklist(fs.readFileSync(p, 'utf8')) });
});

/**
 * Tick / bỏ tick 1 mục bàn giao. Chống race giống hệt `routes/board.js`: client gửi
 * `expectText` (dòng markdown thô client đang thấy), lệch với dòng hiện tại trên đĩa → 409 và
 * KHÔNG ghi — vì agent `/daily` (sinh handoff.md ở Step 5) có thể đang ghi file này cùng lúc.
 */
router.post('/handoff/:key/check', (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return res.status(400).json({ error: 'key không hợp lệ (mẫu ABC-123)' });

  const p = fileFor(key);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'chưa có tasks/' + key + '/handoff.md' });

  const { text, expectText, done } = req.body || {};
  const clean = String(text || '');
  if (!clean) return res.status(400).json({ error: 'text trống' });

  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const i = lines.findIndex((l) => /^- \[[ x]\] /.test(l) && l.includes(clean));
  if (i < 0) return res.status(404).json({ error: 'không tìm thấy mục "' + clean + '" trong handoff.md' });

  if (expectText !== undefined && lines[i] !== expectText)
    return res.status(409).json({ error: 'handoff.md đã đổi từ lúc bạn mở trang', current: lines[i] });

  lines[i] = done ? `- [x] ~~${clean}~~` : `- [ ] ${clean}`;

  const backup = snapshot(p, 'handoff');
  writeAtomic(p, lines.join('\n'));
  res.json({ ok: true, line: lines[i], backup: backup ? path.basename(backup) : null });
});

module.exports = router;
