// Fallback quét Jira khi connector MCP Atlassian chết — chạy qua javascript_tool trên tab
// vnggames.atlassian.net đã đăng nhập, dùng cookie session. CHỈ GET, không bao giờ ghi Jira.
// Dán trọn file 1 lần/phiên để có window.JIRA, sau đó chỉ gọi `await JIRA.delta('2026-09-17 11:50')`.
// Luật + khi nào được dùng: SKILL.md mục "Bước 1", references/jql.md mục "Fallback".
window.JIRA = (() => {
  const BASE = '/rest/api/3';

  // Trả JSON hoặc NÉM. Trang login/SSO trả HTML 200 — im lặng coi đó là "0 ticket" là cách
  // biến sự cố đăng nhập thành báo cáo sai, nên mọi thứ không phải JSON đều là lỗi.
  async function get(path) {
    const r = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    const body = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path} :: ${body.slice(0, 200)}`);
    if (!/^\s*[{[]/.test(body)) throw new Error(`KHÔNG PHẢI JSON (nhiều khả năng chưa đăng nhập / SSO chặn) :: ${body.slice(0, 200)}`);
    return JSON.parse(body);
  }

  async function search(jql, fields, maxResults = 100) {
    const qs = `?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${fields}`;
    try {
      return (await get(`/search/jql${qs}`)).issues || [];
    } catch (e) {
      if (!/HTTP (404|410)/.test(e.message)) throw e;
      return (await get(`/search${qs}`)).issues || []; // instance cũ chưa có /search/jql
    }
  }

  const SHEET_RE = /https:\/\/docs\.google\.com\/spreadsheets\/[^\s"'|)\]]+/g;
  // Link sheet nằm rải trong ADF: text thường, mark href, hoặc attrs.url của smartlink.
  // Quét chuỗi hoá cả node rẻ hơn và không bỏ sót nhánh nào so với đi cây theo type.
  const sheets = (node) => [...new Set((JSON.stringify(node ?? '').match(SHEET_RE) || []).map((u) => u.replace(/\\+$/, '')))];

  const brief = (i) => ({
    k: i.key,
    s: i.fields.summary,
    st: i.fields.status?.name,
    cat: i.fields.status?.statusCategory?.key,
    up: i.fields.updated,
    due: i.fields.duedate,
    asg: i.fields.assignee?.emailAddress,
  });

  async function issue(key) {
    const j = await get(`/issue/${key}?fields=summary,status,updated,duedate,resolutiondate,assignee,description,comment,subtasks`);
    const f = j.fields;
    const cs = f.comment?.comments || [];
    return {
      ...brief(j),
      res: f.resolutiondate,
      subs: (f.subtasks || []).map((s) => `${s.key}:${s.fields.status.name}:${s.fields.summary}`),
      nComments: cs.length,
      sheets: sheets([f.description, cs]),
      lastComments: cs.slice(-3).map((c) => ({
        by: c.author?.displayName,
        at: c.created,
        txt: (JSON.stringify(c.body).match(/"text":"[^"]*"/g) || []).map((s) => s.slice(8, -1)).join(' ').slice(0, 400),
      })),
    };
  }

  const FIELDS = 'summary,status,updated,duedate,assignee';

  // Trọn bước 1 của /daily delta trong 1 lượt: cửa sổ delta + JQL chính + nhánh Done 45 ngày.
  // `since` = state.lastRun lùi 30', format 'yyyy-MM-dd HH:mm'.
  async function delta(since) {
    const [changed, open, recentDone] = await Promise.all([
      search(`assignee = currentUser() AND updated >= "${since}" ORDER BY updated DESC`, FIELDS),
      search('assignee = currentUser() AND statusCategory != Done ORDER BY duedate ASC', FIELDS),
      search('assignee = currentUser() AND statusCategory = Done AND updated >= -45d ORDER BY updated DESC', FIELDS),
    ]);
    const details = await Promise.all(changed.map((i) => issue(i.key)));
    return { since, changed: details, open: open.map(brief), recentDone: recentDone.map(brief) };
  }

  // Snapshot tab "Theo tháng": MỌI status, nhóm theo tháng của duedate (không phải resolutiondate).
  async function months(fromDate, toDate) {
    const jql = `assignee = currentUser() AND duedate >= "${fromDate}" AND duedate <= "${toDate}" ORDER BY duedate ASC`;
    const issues = await search(jql, 'summary,status,duedate,resolutiondate', 200);
    const out = {};
    for (const i of issues) {
      const d = i.fields.duedate;
      if (!d) continue; // không đoán tháng cho ticket thiếu duedate
      (out[d.slice(0, 7)] ||= []).push({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name,
        done: i.fields.status?.statusCategory?.key === 'done',
        duedate: d,
        resolved: i.fields.resolutiondate || null,
      });
    }
    return { generatedAt: new Date().toISOString().slice(0, 10), source: 'jira-rest-via-chrome', jql, months: out };
  }

  return { get, search, issue, delta, months, sheets };
})();
'JIRA sẵn sàng — JIRA.delta(since) | JIRA.issue(key) | JIRA.months(from,to) | JIRA.search(jql,fields)';
