const { Router } = require('express');
const path = require('path');
const { AGENT_AUTO, file } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { isOffMyPlate } = require('../lib/vocab');

const router = Router();

/**
 * GET /api/doctor — state.json có đúng hợp đồng vocab không (Task 5).
 *
 * `tools/state-doctor.mjs` là ESM (dùng `import.meta.dirname`), còn route CommonJS này
 * thì không được `require()` thẳng nó (Node sẽ nổ ERR_REQUIRE_ESM) — phải `await import(...)`
 * bên trong handler async, Node cho phép CJS dynamic-import module ESM.
 */
router.get('/doctor', async (_req, res) => {
  try {
    const { runDoctor } = await import(path.join(AGENT_AUTO, 'tools', 'state-doctor.mjs'));
    const r = runDoctor({ root: AGENT_AUTO });
    // Lọc ticket không còn của mình (đóng ở Jira / đã chuyển người): state của chúng có sai hợp
    // đồng thì cũng không phải việc phải làm hôm nay. Ca 13/8: GW-556 (`closed`) và GW-654
    // (`reassigned`, đã bàn giao) chiếm 3/4 số dòng doctor trên dải cảnh báo.
    // `hiddenClosed` để KHÔNG cắt im lặng — muốn xem đủ thì `node tools/state-doctor.mjs`.
    const issues = readJSON(file.state, { issues: {} }).issues || {};
    const mine = (f) => !f.key || !isOffMyPlate(issues[f.key]);
    const errors = (r.errors || []).filter(mine);
    const warns = (r.warns || []).filter(mine);
    const hiddenClosed = (r.errors || []).length + (r.warns || []).length - errors.length - warns.length;
    res.json({ ...r, errors, warns, hiddenClosed });
  } catch (e) {
    // Doctor chết (thiếu file, JSON hỏng nặng, ...) không được kéo sập cả cockpit — vẫn trả
    // HTTP 200 với mảng rỗng kèm lý do để UI biết mà im lặng thay vì tưởng "không lỗi gì".
    res.json({ at: new Date().toISOString(), errors: [], warns: [], failed: String(e.message || e) });
  }
});

module.exports = router;
