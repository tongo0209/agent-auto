export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// cdn-source: alias `git mr` = push + tạo MR sang master; push trần trước nó thì MR không được tạo
export const pushCommand = (dir, branch) => (dir.split('/').pop() === 'cdn-source' ? `git -C "${dir}" mr` : `git -C "${dir}" push origin ${branch}`);

export function toast(text, err) {
  const t = $('#toast');
  t.textContent = text;
  t.className = `toast show${err ? ' err' : ''}`;
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = 'toast'), 4200);
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error ?? `${res.status} ${path}`);
  return data;
}

const SECTION_STEPS = ['lane', 'review', 'build', 'ui'];
const ACTIVE = ['running', 'waiting'];
const membersOf = (cell) => (cell.branches ? cell.branches.flat(2) : cell.roles ? Object.values(cell.roles) : []);

// Làn chính đi theo next; thành viên nhóm vẽ trong ô nhóm. Ô lạc ngoài chuỗi chỉ hiện khi là bước vòng về hoặc run đã chạy tới
export function flowShape(cells) {
  const byId = new Map(cells.map((c) => [c.id, c]));
  const members = new Set(cells.flatMap(membersOf));
  const lane = [];
  for (let c = cells[0]; c && !lane.includes(c); c = byId.get(c.next)) lane.push(c);
  const stray = (c) => !lane.includes(c) && !members.has(c.id) && !c.group;
  return { lane, side: cells.filter((c) => stray(c) && (c.side || c.rounds > 0 || ACTIVE.includes(c.state))) };
}

// Vệt của nhóm: parallel mỗi nhánh 1 vệt (bước là mảng thì các ô đứng chồng), sections mỗi section 1 vệt
// lane → review → build → ui kèm ô fix vòng về lane; chưa chia section thì 1 vệt gộp bằng chính các ô vai
export function groupTracks(group, cells) {
  const byId = new Map(cells.map((c) => [c.id, c]));
  if (group.branches) return group.branches.map((branch) => ({ label: null, steps: branch.map((step) => [step].flat().map((id) => byId.get(id)).filter(Boolean)), fix: null }));
  if (!group.roles) return [];
  const track = (label, byRole) => {
    const steps = SECTION_STEPS.filter((role) => byRole[role]).map((role) => [byRole[role]]);
    return { label, steps, fix: byRole.fix && steps.length ? { ...byRole.fix, back: steps[0][0].id } : null };
  };
  if (!group.sections?.length) return [track(null, Object.fromEntries(Object.entries(group.roles).map(([role, id]) => [role, byId.get(id)])))];
  return group.sections.map((s) => track(s.id, s.cells));
}

// Tách: ô nhóm → bước đầu mỗi vệt; bước kề nhau trong vệt nối mọi cặp; hợp: bước cuối mỗi vệt (vệt rỗng thì chính ô nhóm)
export function trackLinks(group, tracks) {
  const links = [];
  for (const { steps } of tracks) {
    for (const c of steps[0] ?? []) links.push([group.id, c.id]);
    steps.slice(1).forEach((step, j) => steps[j].forEach((a) => step.forEach((b) => links.push([a.id, b.id]))));
  }
  const tails = tracks.flatMap((t) => t.steps.at(-1) ?? []).map((c) => c.id);
  return { links, tails: tails.length ? tails : [group.id] };
}
