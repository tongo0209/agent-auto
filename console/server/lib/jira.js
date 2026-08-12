/**
 * Client Jira REST v3 — chỉ đủ cho việc ĐÁNH DONE một ticket.
 *
 * Cố ý KHÔNG có hàm nào ghi description/comment: chốt 10/08 là bằng chứng bàn giao nằm ở repo
 * gt-promotion, console không đụng một ký tự nào trong bài của PM. Không có code thì không lỡ tay.
 *
 * Vì sao không dùng MCP Atlassian: MCP chỉ sống trong phiên Claude, nút trên console không có nó.
 */
const { file } = require('./paths');
const { readJSON } = require('./fsutil');

/** Nhóm status coi là "đóng nhưng KHÔNG phải hoàn thành" — đánh nhầm là báo cáo sai việc đã làm */
const CANCEL_RE = /won'?t\s*do|cancel|reject|duplicate|huỷ|huy/i;

/** Ưu tiên trạng thái đúng nghĩa hoàn thành; project GW dùng COMPLETED */
const PREFER = [/^completed$/i, /^complete$/i, /^done$/i, /^resolved$/i, /^closed$/i];

function basicAuth(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

/**
 * Chọn transition đưa ticket sang trạng thái hoàn thành.
 * Trả null khi không có lựa chọn an toàn — chỗ gọi phải báo user chọn tay, KHÔNG đoán bừa.
 */
function pickDoneTransition(transitions) {
  const list = (transitions || []).filter(
    (t) => t && t.to && t.to.statusCategory && t.to.statusCategory.key === 'done'
  );
  const safe = list.filter((t) => !CANCEL_RE.test(t.to.name || '') && !CANCEL_RE.test(t.name || ''));
  if (!safe.length) return null;

  for (const re of PREFER) {
    const hit = safe.find((t) => re.test(t.to.name || '') || re.test(t.name || ''));
    if (hit) return hit;
  }
  return safe[0];
}

/** Thiếu credential thì báo thẳng cách khắc phục, không fail im lặng */
function credentials() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  if (!email || !token) {
    const e = new Error(
      'Thiếu JIRA_EMAIL / JIRA_TOKEN. Tạo API token ở https://id.atlassian.com/manage-profile/security/api-tokens rồi ghi vào console/.env'
    );
    e.status = 501;
    throw e;
  }
  return { email, token };
}

async function call(pathname, { method = 'GET', body, base } = {}) {
  const { email, token } = credentials();
  // Đọc lại config mỗi lần gọi (không cache lúc require): user sửa siteUrl trong config.json
  // là ăn ngay, không phải restart server.
  const root = base || readJSON(file.config, {}).siteUrl || 'https://vnggames.atlassian.net';

  const res = await fetch(`${root}/rest/api/3${pathname}`, {
    method,
    headers: {
      Authorization: basicAuth(email, token),
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  if (!res.ok) {
    // Thông điệp lỗi của Jira có ích (thiếu quyền, transition không hợp lệ) — giữ nguyên cho user
    // đọc, nhưng KHÔNG kèm header nên không có đường nào lộ token ra log.
    const e = new Error(`Jira ${res.status}: ${text.slice(0, 400)}`);
    e.status = res.status === 401 || res.status === 403 ? res.status : 502;
    throw e;
  }
  return text ? JSON.parse(text) : null;
}

/** Chỉ lấy status + updated: `updated` là mốc chống race, không cần kéo cả ticket về */
async function getIssueStatus(key) {
  const data = await call(`/issue/${encodeURIComponent(key)}?fields=status,updated,summary`);
  return {
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status && data.fields.status.name,
    statusCategory: data.fields.status && data.fields.status.statusCategory.key,
    updated: data.fields.updated,
  };
}

async function getTransitions(key) {
  const data = await call(`/issue/${encodeURIComponent(key)}/transitions`);
  return (data && data.transitions) || [];
}

async function transition(key, transitionId) {
  await call(`/issue/${encodeURIComponent(key)}/transitions`, {
    method: 'POST',
    body: { transition: { id: String(transitionId) } },
  });
}

module.exports = { basicAuth, pickDoneTransition, getIssueStatus, getTransitions, transition };
