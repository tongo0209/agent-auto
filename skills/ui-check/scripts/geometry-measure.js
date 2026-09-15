/*
 * Đo vị trí asset theo plan.json của geo-fix — thân của mcp__browserpilot__run_script (biến `page` có sẵn).
 * Skill thay token PLAN bằng JSON plan (chỉ group đúng viewport đang mở). Trả về measure JSON cho `geo-fix diff`.
 */
const PLAN = /*__PLAN__*/ null;

await page.evaluate(() => new Promise(done => {
  let y = 0;
  const step = () => {
    y += 700;
    window.scrollTo(0, y);
    if (y >= document.documentElement.scrollHeight) {
      window.scrollTo(0, 0);
      setTimeout(done, 800);
    } else {
      setTimeout(step, 120);
    }
  };
  step();
}));

await page.evaluate(() => document.fonts.ready.then(() => undefined));

const measure = await page.evaluate((plan) => {
  const vis = el => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const rect = el => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  };

  const forcedPopups = [];
  const forceVisible = el => {
    const popup = el.closest('.MS__popup');
    if (!popup) return false;
    if (!forcedPopups.some(f => f.popup === popup)) {
      forcedPopups.push({ popup, className: popup.className, style: popup.getAttribute('style') });
      popup.classList.add('active');
      popup.style.cssText += ';display:block;visibility:visible;opacity:1';
      // MJ__lazyload chỉ nạp src khi popup thật sự mở
      popup.querySelectorAll('img[data-src]:not([src])').forEach(img => { img.src = img.dataset.src; });
    }
    return vis(el);
  };

  const picked = [];
  for (const g of plan.groups) {
    for (const a of g.assets) {
      for (const sel of a.selectors) {
        let els;
        // selector rút từ SCSS có thể không phải CSS hợp lệ (placeholder, mixin lạ)
        try { els = [...document.querySelectorAll(sel)]; } catch { continue; }
        if (!els.length) continue;
        let visible = els.filter(vis);
        const forced = !visible.length && (visible = els.filter(forceVisible)).length > 0;
        if (!visible.length) continue;
        const one = visible.length === 1 ? visible[0] : null;
        picked.push({ el: one, m: { name: a.name, selector: sel, matches: visible.length, forced, parent: null, ...(one ? rect(one) : {}) } });
        break;
      }
    }
  }

  const nameOf = new Map(picked.filter(p => p.el).map(p => [p.el, p.m.name]));
  for (const p of picked) {
    for (let anc = p.el && p.el.parentElement; anc; anc = anc.parentElement) {
      if (nameOf.has(anc)) { p.m.parent = nameOf.get(anc); break; }
    }
  }

  const wrapperEl = document.getElementById('MS__wrapper') || document.body;
  const wr = rect(wrapperEl);
  const wrapper = { ...wr, scale: wr.w / wrapperEl.offsetWidth };

  for (const f of forcedPopups.reverse()) {
    f.popup.className = f.className;
    f.style === null ? f.popup.removeAttribute('style') : f.popup.setAttribute('style', f.style);
  }

  return { viewport: [innerWidth, innerHeight], wrapper, assets: picked.map(p => p.m) };
}, PLAN);

return measure;
