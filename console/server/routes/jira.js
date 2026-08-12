const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { safeKey } = require('../lib/ticket');
const { scanPromo, webUrl } = require('../lib/promoScan');
const { evaluateDelivery } = require('../lib/deliver');
const jira = require('../lib/jira');

/**
 * Đánh Done ticket Jira khi đã bàn giao qua gt-promotion.
 *
 * Chốt 10/08: bằng chứng bàn giao là chính repo gt-promotion (file đã push lên remote), KHÔNG ghi
 * gì vào description Jira. Route này vì thế chỉ có 2 việc: soi repo, và đổi status khi user bấm.
 * Không tồn tại đường ghi description/comment trong toàn bộ tính năng.
 */
const router = Router();
const PROMO_REPO = 'gt-promotion-template';

/** Đường dẫn repo promotion, đọc lại mỗi lần để user sửa config.json không phải restart server */
function promoRepoPath() {
  return (readJSON(file.config, {}).repos || {})[PROMO_REPO];
}

async function deliveryOf(key) {
  const state = readJSON(file.state, { issues: {} });
  const issue = (state.issues || {})[key] || {};
  const repoPath = promoRepoPath();

  if (!issue.promoFolder)
    return {
      verdict: evaluateDelivery({ promoFolder: null }),
      scan: null,
      issue,
    };

  const scan = await scanPromo(repoPath, issue.promoFolder);
  if (!scan.ok)
    return { verdict: { state: 'error', canDone: false, message: scan.error, dirty: false }, scan: null, issue };

  const verdict = evaluateDelivery({
    promoFolder: issue.promoFolder,
    files: scan.files,
    remoteLog: scan.remoteLog,
    dirty: scan.dirty,
  });
  return { verdict, scan, issue };
}

/**
 * GET /api/jira/delivery/:key — ticket này đã bàn giao qua gt-promotion chưa?
 * Chỉ ĐỌC: soi repo + hỏi status Jira. Không đổi gì cả, gọi thoải mái.
 */
router.get('/jira/delivery/:key', async (req, res) => {
  const key = safeKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'key không hợp lệ (mẫu ABC-123)' });

  const { verdict, scan, issue } = await deliveryOf(key);
  const url = scan && verdict.canDone ? await webUrl(promoRepoPath(), scan.branch, scan.folder) : null;

  // Status Jira là phần TÙY: thiếu token thì phần soi repo vẫn dùng được, chỉ nút Done mới cần.
  let issueStatus = null;
  let jiraError = null;
  try {
    issueStatus = await jira.getIssueStatus(key);
  } catch (e) {
    jiraError = e.message;
  }

  res.json({
    key,
    promoFolder: issue.promoFolder || null,
    ...verdict,
    branch: scan ? scan.branch : null,
    fetched: scan ? scan.fetched : null,
    files: scan ? scan.files : [],
    url,
    jira: issueStatus,
    jiraError,
  });
});

/**
 * POST /api/jira/done/:key  { expectUpdated }
 *
 * Ba cửa trước khi đổi status, thiếu cửa nào cũng dừng:
 *  1. Repo phải chứng minh đã bàn giao (file có + đã push) — chưa push mà Done là báo cáo sai.
 *  2. `expectUpdated` phải khớp `fields.updated` hiện tại — ticket đổi từ lúc user mở trang thì
 *     bắt reload, cùng khuôn chống race của routes/handoff.js.
 *  3. Phải chọn được transition sang trạng thái hoàn thành thật (không phải Won't Do/Cancelled).
 */
router.post('/jira/done/:key', async (req, res) => {
  const key = safeKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'key không hợp lệ (mẫu ABC-123)' });

  const { verdict } = await deliveryOf(key);
  if (!verdict.canDone) return res.status(409).json({ error: verdict.message, state: verdict.state });

  try {
    const before = await jira.getIssueStatus(key);
    if (before.statusCategory === 'done')
      return res.json({ ok: true, already: true, status: before.status, message: `Ticket đã ở ${before.status}.` });

    const { expectUpdated } = req.body || {};
    if (expectUpdated && expectUpdated !== before.updated)
      return res.status(409).json({
        error: 'Ticket đã đổi trên Jira từ lúc bạn mở trang — tải lại rồi bấm lại.',
        current: before.updated,
      });

    const list = await jira.getTransitions(key);
    const pick = jira.pickDoneTransition(list);
    if (!pick)
      return res.status(409).json({
        error: 'Không có bước chuyển nào sang trạng thái hoàn thành — đổi tay trên Jira.',
        transitions: list.map((t) => ({ id: t.id, name: t.name, to: t.to && t.to.name })),
      });

    await jira.transition(key, pick.id);
    const after = await jira.getIssueStatus(key);
    res.json({ ok: true, from: before.status, status: after.status, via: pick.name, commit: verdict.commit });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

module.exports = router;
