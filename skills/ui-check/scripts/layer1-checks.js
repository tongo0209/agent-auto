/*
 * Lớp 1 — check giao diện deterministic, KHÔNG cần ảnh design.
 * Dùng làm THÂN của mcp__browserpilot__run_script (biến `page` có sẵn).
 * Playwright MCP: chỉ lấy hàm trong page.evaluate cuối làm browser_evaluate.
 * Chạy SAU khi đã goto + đúng viewport. Trả về JSON report.
 */

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

const report = await page.evaluate(() => {
  const issues = [];

  const vis = el => {
    if (!el.isConnected) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const sel = el => {
    if (el.id) return '#' + el.id;
    let s = el.tagName.toLowerCase();
    if (typeof el.className === 'string' && el.className.trim()) {
      s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
    }
    const sec = el.closest('#MS__wrapper > [id]');
    return (sec ? '#' + sec.id + ' ' : '') + s;
  };

  document.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src && img.complete && img.naturalWidth === 0) {
      issues.push({ check: 'img-broken', el: sel(img), src });
    }
    if (!src && img.dataset.src) {
      issues.push({ check: 'img-lazy-not-loaded', el: sel(img), dataSrc: img.dataset.src });
    }
  });

  const sections = [];
  document.querySelectorAll('#MS__wrapper > *').forEach(s => {
    if (s.nodeType !== 1) return;
    const st = getComputedStyle(s);
    const r = s.getBoundingClientRect();
    sections.push({ id: s.id || sel(s), height: Math.round(r.height), display: st.display });
    if (st.display !== 'none' && r.height < 2) {
      issues.push({ check: 'section-empty', el: s.id ? '#' + s.id : sel(s) });
    }
  });

  document.querySelectorAll('body *').forEach(el => {
    if (el.children.length > 8) return;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText || !vis(el)) return;
    const st = getComputedStyle(el);
    const clipY = (st.overflowY === 'hidden' || st.overflow === 'hidden')
      && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0;
    const clipX = st.whiteSpace === 'nowrap'
      && el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0;
    if (clipY || clipX) {
      issues.push({
        check: 'text-clipped', el: sel(el),
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 50),
        scroll: [el.scrollWidth, el.scrollHeight],
        client: [el.clientWidth, el.clientHeight],
      });
    }
  });

  const de = document.documentElement;
  const bodyOx = getComputedStyle(document.body).overflowX;
  const htmlOx = getComputedStyle(de).overflowX;
  if (de.scrollWidth > window.innerWidth + 2) {
    const offenders = [];
    document.querySelectorAll('body *').forEach(el => {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 8 && r.width < window.innerWidth * 2) {
        offenders.push(sel(el));
      }
    });
    issues.push({
      check: 'h-overflow',
      severity: (bodyOx === 'hidden' || htmlOx === 'hidden') ? 'warn' : 'error',
      scrollWidth: de.scrollWidth, viewport: window.innerWidth,
      overflowX: { html: htmlOx, body: bodyOx },
      offenders: [...new Set(offenders)].slice(0, 10),
    });
  }

  const fontsFailed = new Set();
  document.fonts.forEach(f => { if (f.status === 'error') fontsFailed.add(f.family); });
  if (fontsFailed.size) issues.push({ check: 'font-error', fonts: [...fontsFailed] });

  const pcCount = document.querySelectorAll('.MS__pc').length;
  const mbCount = document.querySelectorAll('.MS__mb').length;
  const isPC = window.innerWidth > 768;
  if (pcCount > 0 && mbCount > 0) {
    issues.push({ check: 'lib-not-pruned', severity: 'warn', pcCount, mbCount,
      note: 'ca .MS__pc lan .MS__mb con trong DOM — lib chua remove theo viewport, nghi JS init fail' });
  } else if ((isPC && pcCount === 0 && mbCount > 0) || (!isPC && mbCount === 0 && pcCount > 0)) {
    issues.push({ check: 'lib-pruned-wrong-side', pcCount, mbCount, viewport: window.innerWidth });
  }

  return {
    url: location.pathname,
    viewport: [window.innerWidth, window.innerHeight],
    wrapper: document.getElementById('MS__wrapper')
      ? Math.round(document.getElementById('MS__wrapper').getBoundingClientRect().height) : null,
    sections,
    issueCount: issues.length,
    issues,
  };
});

return report;
