const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON } = require('../lib/fsutil');
const { activityForIssue } = require('../lib/activity');
const cache = require('../lib/cache');

const router = Router();
const TTL = 60 * 1000; // commit mới hiện sau ~1 phút; git log per-path khá nặng

function gitEmailOfThisMachine() {
  try {
    return require('child_process').execSync('git config user.email', { encoding: 'utf8' }).trim();
  } catch {
    return ''; // không có git config → lọc rỗng, thà không hiện gì còn hơn hiện của người khác
  }
}

function context() {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  return {
    // Fallback là email git của CHÍNH máy này, không hardcode email một người cụ thể: bản cũ
    // để sẵn email của người viết console, nên máy nào quên điền `gitAuthor` sẽ thấy commit
    // của người khác trong tab "Git của tôi" mà không hề báo lỗi. (state-doctor E10 cũng bắt.)
    author: config.gitAuthor || gitEmailOfThisMachine(),
    repos: config.repos || {},
    issues: state.issues || {},
  };
}

/** GET /api/activity — hoạt động git của MỌI ticket đang theo dõi (không kèm danh sách commit) */
router.get('/activity', async (_req, res) => {
  const { author, repos, issues } = context();
  const entries = Object.entries(issues).filter(([, i]) => i.phase !== 'closed');

  const { value: items, cached } = await cache.through(`activity:${author}:${entries.length}`, TTL, async () => {
    const all = await Promise.all(entries.map(([key, issue]) => activityForIssue(key, issue, repos, author)));
    // Bỏ commitList cho gọn — modal gọi endpoint riêng khi cần (biến đổi tên `_commitList`
    // để báo hiệu CỐ Ý không dùng, khớp argsIgnorePattern '^_' của eslint)
    return all.map(({ commitList: _commitList, ...rest }) => rest);
  });

  res.json({ author, cached, items });
});

/** GET /api/activity/:key — danh sách commit của riêng 1 ticket (cho modal) */
router.get('/activity/:key', async (req, res) => {
  const key = String(req.params.key).replace(/[^A-Za-z0-9-]/g, '');
  const { author, repos, issues } = context();
  const issue = issues[key];
  if (!issue) return res.status(404).json({ error: 'Không có ticket ' + key + ' trong state' });

  const data = await activityForIssue(key, issue, repos, author);
  res.json(data);
});

module.exports = router;
