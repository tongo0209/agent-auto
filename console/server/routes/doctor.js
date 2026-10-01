const { Router } = require('express');
const { currentDoctor } = require('../lib/sources');

const router = Router();

/** GET /api/doctor — state.json có đúng hợp đồng vocab không; `hiddenClosed` = số dòng đã lọc */
router.get('/doctor', async (_req, res) => res.json(await currentDoctor()));

module.exports = router;
