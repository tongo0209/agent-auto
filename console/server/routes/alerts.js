const { Router } = require('express');
const { currentAlerts } = require('../lib/sources');

const router = Router();

/** GET /api/alerts — cảnh báo chủ động (mốc gấp · quá mốc · đứng yên · design chưa tải) */
router.get('/alerts', async (_req, res) => res.json(await currentAlerts()));

module.exports = router;
