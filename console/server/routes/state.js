const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { file, AGENT_AUTO, dir } = require('../lib/paths');
const { readJSON, readJSONL, todayStr, daysBetween } = require('../lib/fsutil');
const { readBoard } = require('../lib/board');
const { observePhases } = require('../lib/learn');
const { OFF_MY_PLATE_PHASES, MUST_DELIVER_IDS } = require('../lib/vocab');

const router = Router();

const hasDir = (p) => {
  try {
    return fs.statSync(p).isDirectory() && fs.readdirSync(p).length > 0;
  } catch {
    return false;
  }
};
const hasFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** GET /api/state — nguồn dữ liệu cho tab "Hôm nay" + KPI row */
router.get('/state', (_req, res) => {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const board = readBoard();
  const today = todayStr();

  // Vòng học: phase đổi thì ghi 1 dòng history/phases.jsonl (tác dụng phụ của poll,
  // không cần /daily wrap — xem lib/learn.js)
  try {
    observePhases(state);
  } catch {
    /* vòng học không được làm sập cockpit */
  }

  /**
   * Dải "mốc 14 ngày tới" — CHỈ mốc PHẢI GIAO.
   *
   * `duedate` là mốc hành chính của Jira, gần như luôn trùng nghĩa với mốc thật (HTML /
   * Giao HTML / Design) nên mỗi ticket góp 2 thẻ và dải bung ra 10 thẻ = không đọc được.
   * Timeline gantt ngay dưới vẫn vẽ ĐỦ mọi mốc, cột "Mốc kế" trong bảng vẫn tính duedate.
   *
   * NGOẠI LỆ có chủ ý: ticket mà trong 14 ngày CHỈ có `duedate` thì vẫn giữ thẻ đó —
   * bỏ luôn là tạo điểm mù cho ticket chưa bóc được mốc nghiệp vụ nào.
   */
  const week = [];
  for (const [key, issue] of Object.entries(state.issues || {})) {
    // Mốc của ticket đã chuyển người/đã đóng không phải deadline của mình
    if (OFF_MY_PLATE_PHASES.includes(issue.phase)) continue;
    const inHorizon = Object.entries(issue.milestones || {})
      // Key mở đầu `_` là ghi chú của skill (`_conflict`…), không phải mốc
      .filter(([name]) => !name.startsWith('_'))
      .map(([name, date]) => ({ key, name, date, days: daysBetween(today, date) }))
      .filter((m) => m.days >= 0 && m.days <= 14);
    const mustDeliver = inHorizon.filter((m) => MUST_DELIVER_IDS.includes(m.name));
    week.push(...(mustDeliver.length ? mustDeliver : inHorizon));
  }
  week.sort((a, b) => a.date.localeCompare(b.date));

  // Có gì để mở: chỉ hiện nút khi thật sự có folder/file (nút chết là nút gây mất tin)
  const assets = {};
  for (const key of Object.keys(state.issues || {})) {
    assets[key] = {
      designs: hasDir(path.join(dir.designs, key)),
      questions: hasFile(path.join(dir.tasks, key, 'questions-for-pm.md')),
      brief: hasFile(path.join(dir.tasks, key, 'brief.md')),
    };
  }

  res.json({
    today,
    config,
    state,
    board,
    week,
    assets,
    metricsCount: readJSONL(file.metrics).length,
    paths: { agentAuto: AGENT_AUTO, tasks: dir.tasks, designs: dir.designs },
  });
});

module.exports = router;
