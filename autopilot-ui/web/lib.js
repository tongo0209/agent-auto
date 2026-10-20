export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
