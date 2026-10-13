/*
 * Bơm chữ dài vào từng phần tử chữ rồi đo: chữ có bị cắt, tràn khung, hay đè lên nút không.
 * Bắt loại lỗi layout "vừa khít mockup" — dữ liệu BE/bản dịch dài hơn là vỡ (CFL R1#18, ananta).
 * Dùng làm THÂN của mcp__browserpilot__run_script, chạy SAU layer1-checks.js trên cùng trang × viewport.
 * Chỉ báo chỗ lỗi PHÁT SINH do chữ dài — lỗi có sẵn đã nằm ở report Lớp 1.
 */

return await page.evaluate(() => {
  const TOLERANCE = 4;
  const DATA_MIN_LENGTH = 40;
  const DATA_REPEAT = 3;
  const TRANSLATION_GROWTH = 0.5;
  const ANCESTOR_DEPTH = 3;
  const BUTTON_SELECTOR = 'a, button, input, select, [class*="btn"]';
  const SKIP_SELECTOR = 'script, style, noscript, svg, option, .MS__layer-loading';

  const isVisible = el => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const describe = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) {
      s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
    }
    const section = el.closest('#MS__wrapper > [id]');
    return (section && section !== el ? '#' + section.id + ' ' : '') + s;
  };

  const textRect = el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  };

  const exceeds = (inner, outer) =>
    inner.right > outer.right + TOLERANCE || inner.bottom > outer.bottom + TOLERANCE
    || inner.left < outer.left - TOLERANCE || inner.top < outer.top - TOLERANCE;

  const intersects = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOLERANCE
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOLERANCE;

  const truncatesOnPurpose = el => {
    const st = getComputedStyle(el);
    return st.textOverflow === 'ellipsis' || st.webkitLineClamp !== 'none';
  };

  const boxesAround = el => {
    const boxes = [];
    for (let node = el; node && node !== document.body && boxes.length <= ANCESTOR_DEPTH; node = node.parentElement) {
      if (getComputedStyle(node).display !== 'inline') boxes.push(node);
    }
    return boxes;
  };

  const NUMBER = /^[\d\s.,:/+%KMB-]+$/i;

  const isDataBound = el => el.matches('[class*="pm__"], [data-stress] *, [data-stress]')
    && !el.closest(BUTTON_SELECTOR);

  const isFixed = el => {
    for (let node = el; node; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') return true;
    }
    return false;
  };

  const longVersion = (text, dataBound) => {
    if (!dataBound) return text + ' ' + text.slice(0, Math.ceil(text.length * TRANSLATION_GROWTH));
    if (NUMBER.test(text)) return '9.999.999.999';
    let long = text;
    while (long.length < Math.max(text.length * DATA_REPEAT, DATA_MIN_LENGTH)) long += ' ' + text;
    return long;
  };

  const problemsOf = (el, neighbours) => {
    const text = textRect(el);
    const found = new Map();
    for (const box of boxesAround(el)) {
      if (truncatesOnPurpose(box)) return found;
      if (!exceeds(text, box.getBoundingClientRect())) continue;
      found.set(box, getComputedStyle(box).overflow !== 'visible' ? 'stress-clipped' : 'stress-spill');
      break;
    }
    for (const other of neighbours) {
      if (other.contains(el) || el.contains(other)) continue;
      if (intersects(text, other.getBoundingClientRect())) found.set(other, 'stress-overlap');
    }
    return found;
  };

  const leaves = [...document.querySelectorAll('body *')].filter(el =>
    el.children.length === 0 && el.textContent.trim().length > 1
    && !el.closest(SKIP_SELECTOR) && isVisible(el)
    && (isDataBound(el) || !NUMBER.test(el.textContent.trim())));
  const buttons = [...document.querySelectorAll(BUTTON_SELECTOR)].filter(isVisible);
  const fixed = new Set([...leaves, ...buttons].filter(isFixed));

  const issues = [];
  for (const el of leaves) {
    const original = el.textContent;
    const neighbours = [...buttons, ...leaves].filter(other => other !== el && fixed.has(other) === fixed.has(el));
    const before = problemsOf(el, neighbours);
    const dataBound = isDataBound(el);
    el.textContent = longVersion(original.trim(), dataBound);
    const after = problemsOf(el, neighbours);
    el.textContent = original;
    for (const [other, check] of after) {
      if (before.get(other) === check) continue;
      issues.push({
        check, severity: dataBound ? 'error' : 'warn', el: describe(el),
        text: original.trim().replace(/\s+/g, ' ').slice(0, 50), against: describe(other),
      });
    }
  }

  return { url: location.pathname, viewport: [window.innerWidth, window.innerHeight], stressed: leaves.length, issues };
});
