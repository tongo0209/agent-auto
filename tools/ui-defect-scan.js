// Máy dò 5 lỗi mà so-pixel toàn trang KHÔNG bắt được. Chạy trong browser (page.evaluate).
// Trả về {overflow, collide, blank, inFixed, hiddenByDesign} — mỗi mục là danh sách selector + số đo.
(() => {
  const vis = el => { const c = getComputedStyle(el); return c.display !== 'none' && c.visibility !== 'visible' ? false : c.display !== 'none'; };
  const sel = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className || '').toString().split(/\s+/).filter(c => c && !/^(MJ__|MS__hover)/.test(c)).slice(0, 3).join('.');
    return el.tagName.toLowerCase() + id + (cls ? '.' + cls : '');
  };
  const rect = el => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y + scrollY), Math.round(b.width), Math.round(b.height)]; };

  // 1. chữ tràn khỏi hộp
  const overflow = [];
  document.querySelectorAll('p, span, em, a, li, td, th, div').forEach(el => {
    if (!vis(el) || !el.textContent.trim()) return;
    if (el.children.length) return;
    const oW = el.scrollWidth - el.clientWidth, oH = el.scrollHeight - el.clientHeight;
    const wrapped = getComputedStyle(el).whiteSpace === 'nowrap';
    if (oW > 1 || (wrapped && el.scrollWidth > el.offsetWidth + 1) || oH > 1)
      overflow.push({ sel: sel(el), overW: oW, overH: oH, rect: rect(el), text: el.textContent.trim().slice(0, 34) });
  });

  // 2. hai khối CHỮ đè nhau (cùng cha, đều có text)
  const collide = [];
  const texts = [...document.querySelectorAll('p, span, em, a, li')].filter(el => vis(el) && el.textContent.trim() && !el.children.length);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (!ra.width || !rb.width) continue;
    const ov = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)) *
               Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
    if (ov > 120) collide.push({ a: sel(a), b: sel(b), overlapPx: Math.round(ov), ta: a.textContent.trim().slice(0,22), tb: b.textContent.trim().slice(0,22) });
  }

  // 3. phần tử nằm trong container fixed/floating (theo scroll) — dò hành vi mà ảnh full-page làm phẳng
  const inFixed = [];
  document.querySelectorAll('*').forEach(el => {
    if (getComputedStyle(el).position !== 'fixed') return;
    el.querySelectorAll('[class*="pm__"], p, a').forEach(k => { if (vis(k) && k.textContent.trim()) inFixed.push({ container: sel(el), child: sel(k), text: k.textContent.trim().slice(0,26) }); });
  });

  // 4. phần tử design CÓ mà chưa bao giờ hiện (tooltip/popup) — liệt kê để bắt buộc verify riêng
  const hiddenByDesign = [];
  document.querySelectorAll('.tooltip, .MS__popup, [class*="popup"]').forEach(el => {
    if (getComputedStyle(el).display === 'none' || !el.getBoundingClientRect().width)
      hiddenByDesign.push({ sel: sel(el), note: 'ẩn khi tải — phải force-show rồi so với ảnh design riêng' });
  });

  return { overflow, collide, inFixed, hiddenByDesign };
})()
