const path = require('path');
const { AGENT_AUTO, file } = require('./paths');
const { readJSON, readJSONL, todayStr } = require('./fsutil');
const { through } = require('./cache');
const { activityForIssue } = require('./activity');
const { buildAlerts } = require('./alerts');
const { readAllNeedYou } = require('./board');
const { buildDebt, lastSeenIssues } = require('./debt');
const { isOffMyPlate } = require('./vocab');

/** Nợ đọng — kèm dòng quét cuối của ticket đã rời state.json để không đòi nợ ticket đã chuyển người */
const currentDebt = (state, today, boards = readAllNeedYou()) =>
  buildDebt({ boards, today, state, archived: lastSeenIssues(readJSONL(file.issues)) });

const ACTIVITY_TTL = 60000; // git log per-path nặng; "đứng yên" đổi theo ngày, không theo giây

async function currentAlerts() {
  const config = readJSON(file.config, {});
  const state = readJSON(file.state, { issues: {} });
  const today = todayStr();

  const { value: activity } = await through('alerts-activity', ACTIVITY_TTL, async () => {
    const map = {};
    for (const [key, issue] of Object.entries(state.issues || {})) {
      if (issue.phase !== 'coding') continue; // chỉ phase này cần biết "đứng yên"
      map[key] = await activityForIssue(key, issue, config.repos || {}, config.gitAuthor || '');
    }
    return map;
  });

  const debt = currentDebt(state, today);
  return { items: buildAlerts(state, today, activity, debt), today };
}

/**
 * state.json có đúng hợp đồng vocab không. Lọc ticket đã ra khỏi tay (ca 13/8: GW-556 closed và
 * GW-654 reassigned chiếm 3/4 dòng doctor). Doctor chết thì trả mảng rỗng + `failed`, không ném.
 */
async function currentDoctor() {
  try {
    // ESM (import.meta.dirname) — CJS chỉ được dynamic-import, require() sẽ nổ ERR_REQUIRE_ESM
    const { runDoctor } = await import(path.join(AGENT_AUTO, 'tools', 'state-doctor.mjs'));
    const r = runDoctor({ root: AGENT_AUTO });
    const issues = readJSON(file.state, { issues: {} }).issues || {};
    const mine = (f) => !f.key || !isOffMyPlate(issues[f.key]);
    const errors = (r.errors || []).filter(mine);
    const warns = (r.warns || []).filter(mine);
    const hiddenClosed = (r.errors || []).length + (r.warns || []).length - errors.length - warns.length;
    return { ...r, errors, warns, hiddenClosed };
  } catch (e) {
    return { at: new Date().toISOString(), errors: [], warns: [], failed: String(e.message || e) };
  }
}

module.exports = { currentAlerts, currentDoctor, currentDebt };
