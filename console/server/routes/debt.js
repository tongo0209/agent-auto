const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON, todayStr } = require('../lib/fsutil');
const { readAllNeedYou } = require('../lib/board');
const { buildDebt } = require('../lib/debt');

const router = Router();

/**
 * GET /api/debt — nợ "Cần bạn" ở board cũ mà hôm nay không ai nhắc lại.
 *
 * KHÔNG cache TTL ở đây: chính console là bên ghi board, nên TTL sinh ra dữ liệu cũ ngay sau
 * cú tick (đo thật: tick xong `/api/debt` vẫn trả mục vừa đóng, `cached=true`). Việc đọc board
 * đã được `lib/board.js::readAllNeedYou` memo theo dấu vân mtime — đổi file là đổi dấu vân.
 */
router.get('/debt', (_req, res) => {
  const today = todayStr();
  const state = readJSON(file.state, { issues: {} });
  const boards = readAllNeedYou();
  res.json({
    today,
    ...buildDebt({ boards, today, state }),
    // Board viết lệch section (dòng Log lọt vào "Cần bạn") — phơi ra thay vì bỏ trong im lặng.
    stray: boards.filter((b) => b.stray).map((b) => ({ date: b.date, count: b.stray })),
  });
});

module.exports = router;
