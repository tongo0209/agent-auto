import { esc } from '../lib.js';
import { stamp, skeleton, note, errNote, pill, draft, settler } from './_kit.js';

const REFRESH_MS = 20000;
const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>';

const shortPath = (file, sub) => (file.startsWith(`${sub}/`) ? file.slice(sub.length + 1) : file);

function diffHtml(text) {
  return text.split('\n').map((line) => {
    const cls = line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') ? 'meta'
      : line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : '';
    return `<span class="${cls}">${esc(line) || ' '}</span>`;
  }).join('');
}

const MARKUP = `<div class="page-pad rv">
  <header class="vw-head">
    <div><h1>Review</h1><div class="vw-sub mono" id="rvSub">&nbsp;</div></div>
    <div class="vw-tools"><button class="btn ghost vw-sm" id="rvReload"><i class="ph ph-arrows-clockwise"></i>Làm mới</button></div>
  </header>
  <div class="vw-kpis" id="rvKpis">${skeleton(2)}</div>
  <div class="rv-grid">
    <section id="rvList">${skeleton(10)}</section>
    <aside class="vw-card rv-gates"><h2><i class="ph ph-shield-check"></i>Cổng chất lượng <span class="mono" id="rvGateCount"></span></h2><div id="rvGates">${skeleton(5)}</div></aside>
  </div>
</div>
<div class="vw-veil" id="rvVeil"></div>
<div class="vw-modal" id="rvDiff" role="dialog" aria-label="Diff"></div>`;

export function mount(el, ctx) {
  el.innerHTML = MARKUP;
  const $ = (s) => el.querySelector(s);
  const subjects = {};
  let repoPaths = {};
  let cleanOpen = false;

  const settle = settler(el.firstElementChild);

  async function load() {
    const [review, gates, state] = await Promise.allSettled([ctx.api('review', { onFresh: load }), ctx.api('gates', { onFresh: load }), ctx.api('state', { onFresh: load })]);
    if (state.status === 'fulfilled') repoPaths = state.value.config?.repos ?? {};
    if (el.querySelector('.rv-subject:focus')) return;
    renderReview(review, gates);
    renderGates(gates);
    settle();
  }

  function gateBadge(key, gates) {
    const g = gates[key];
    if (!g) return `<button class="vw-pill t-mute" data-gate="${esc(key)}" title="Chưa chạy fe-gate, bấm để chạy"><i class="ph ph-play"></i>chạy cổng</button>`;
    if (g.stale) return rerunButton(key);
    return g.pass ? pill('ok', `<i class="ph ph-shield-check"></i>gate pass · ${g.warn} warn`, stamp(g.at)) : pill('crit', `<i class="ph ph-shield-warning"></i>gate FAIL · ${g.error} lỗi`, stamp(g.at));
  }

  // dist build lại sau lần chấm: số lỗi cũ không còn đúng, chỉ cho chấm lại
  function rerunButton(key) {
    return `<button class="vw-pill t-mute" data-gate="${esc(key)}" title="dist đã build lại sau lần chấm, bấm để chấm lại"><i class="ph ph-arrow-clockwise"></i>cũ · chấm lại</button>`;
  }

  function part(p) {
    if (p.error) return note('ph-warning', esc(p.error), 'err');
    if (p.missing) return note('ph-folder-dashed', `Folder chưa tồn tại: <code>${esc(p.path)}</code>`, 'warn');
    const id = `${p.repo}:${p.path}`;
    const files = p.files.length ? `<ul class="rv-files">${p.files.map((f) => `<li>
        <span class="rv-st st-${esc(f.label)}">${esc(f.label)}</span>
        <span class="mono rv-num">${f.added === null ? '--' : `+${f.added}`}${f.deleted ? ` <i>-${f.deleted}</i>` : ''}</span>
        <button class="rv-file mono" data-diff-repo="${esc(p.repo)}" data-diff-file="${esc(f.file)}" title="Xem diff">${esc(shortPath(f.file, p.path))}</button></li>`).join('')}</ul>` : '';
    const unpushed = p.unpushed?.length ? `<ul class="rv-commits">${p.unpushed.map((c) => `<li><span class="mono h">${esc(c.hash)}</span><span class="mono d">${esc(c.date)}</span><span>${esc(c.subject)}</span></li>`).join('')}</ul>` : '';
    return `<div class="rv-part">
      <div class="rv-path"><span class="rv-repo"><i class="ph ph-folder"></i>${esc(p.repo)}</span><span class="mono rv-sub" title="${esc(p.path)}">${esc(p.path)}</span>
        <span class="mono rv-branch"><i class="ph ph-git-branch"></i>${esc(p.branch ?? '?')}</span>
        <button class="vw-x" data-open-repo="${esc(p.repo)}" title="Mở repo trong VS Code"><i class="ph ph-code"></i></button></div>
      ${files}${unpushed}
      ${p.files.length || p.unpushed?.length ? `<div class="rv-actions">
        ${p.files.length ? `<input class="vw-input rv-subject" data-subject="${esc(id)}" value="${esc(subjects[id] ?? '')}" placeholder="commit subject (English)" aria-label="Commit subject">
          <button class="btn vw-sm" data-commit="${esc(id)}"><i class="ph ph-git-commit"></i>Chép lệnh commit</button>` : ''}
        ${p.unpushed?.length ? `<button class="btn vw-sm" data-push="${esc(id)}" data-branch="${esc(p.branch)}"><i class="ph ph-arrow-fat-up"></i>Chép lệnh push ${esc(p.branch)}</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  function card(item, i, gates) {
    const badge = item.dirty ? pill('warn', `${item.dirty} file chưa commit`) : item.unpushed ? pill('crit', `${item.unpushed} commit chưa push`) : pill('ok', 'sạch · đã đẩy');
    return `<article class="rv-card vw-in ${item.dirty || item.unpushed ? 'work' : ''}" style="--i:${i}">
      <header><button class="vw-key" data-ticket="${esc(item.key)}">${esc(item.key)}</button><span class="rv-sum" title="${esc(item.summary)}">${esc(item.summary)}</span>${badge}${gateBadge(item.key, gates)}</header>
      ${item.parts.map(part).join('')}
    </article>`;
  }

  function renderReview(review, gatesRes) {
    if (review.status === 'rejected') {
      $('#rvKpis').innerHTML = '';
      return ($('#rvList').innerHTML = errNote(review.reason));
    }
    const gates = gatesRes.status === 'fulfilled' ? Object.fromEntries(gatesRes.value.items.map((g) => [g.key, g])) : {};
    const items = review.value.items;
    const work = items.filter((i) => i.dirty || i.unpushed);
    const clean = items.filter((i) => !i.dirty && !i.unpushed);
    const sum = (k) => work.reduce((n, i) => n + (i[k] ?? 0), 0);
    $('#rvSub').textContent = `${work.length} task còn việc · ${clean.length} sạch · ${review.value.cached ? 'từ cache 5s' : 'vừa đọc git'}`;
    const failed = Object.values(gates).filter((g) => !g.pass && !g.stale).length;
    $('#rvKpis').innerHTML = [
      ['ph-pencil-simple-line', 'File chưa commit', sum('dirty'), 'warn'],
      ['ph-arrow-fat-up', 'Commit chưa push', sum('unpushed'), 'crit'],
      ['ph-shield-warning', 'Cổng đang FAIL', failed, failed ? 'crit' : 'ok'],
      ['ph-folders', 'Task gắn folder', items.length, 'run'],
    ].map(([icon, label, value, tone], i) => `<div class="vw-kpi t-${tone} vw-in" style="--i:${i}"><span class="lbl"><i class="ph ${icon}"></i>${label}</span><b class="mono">${value}</b></div>`).join('');
    if (!items.length) return ($('#rvList').innerHTML = note('ph-link-break', 'Chưa ticket nào gắn folder làm việc. Gắn bằng <code>/daily link GW-xxx</code>.'));
    $('#rvList').innerHTML = (work.length ? work.map((it, i) => card(it, i, gates)).join('') : note('ph-check-circle', 'Không còn file chưa commit hay commit chưa push.'))
      + (clean.length ? `<details class="rv-clean" ${cleanOpen ? 'open' : ''}><summary><i class="ph ph-caret-right"></i>${clean.length} task sạch, đã đẩy</summary>${clean.map((it, i) => card(it, i, gates)).join('')}</details>` : '');
  }

  function renderGates(r) {
    if (r.status === 'rejected') return ($('#rvGates').innerHTML = errNote(r.reason));
    const items = r.value.items;
    $('#rvGateCount').textContent = items.length || '';
    $('#rvGates').innerHTML = items.length
      ? `<ul class="rv-gatelist">${items.map((g, i) => `<li class="vw-in" style="--i:${i}"><span class="td-lvl t-${g.stale ? 'mute' : g.pass ? 'ok' : 'crit'}"></span>
          <button class="vw-key" data-ticket="${esc(g.key.match(/^[A-Z]+-\d+/)?.[0] ?? g.key)}">${esc(g.key)}</button>
          ${g.stale ? rerunButton(g.key) : `<span class="mono">${g.pass ? 'pass' : `${g.error} lỗi`} · ${g.warn}w</span>`}<span class="mono dim">${esc(stamp(g.at).slice(5))}</span></li>`).join('')}</ul>`
      : note('ph-shield', 'Chưa ticket nào chạy fe-gate.');
  }

  async function showDiff(repo, file) {
    $('#rvVeil').classList.add('show');
    $('#rvDiff').classList.add('show');
    $('#rvDiff').innerHTML = `<header><i class="ph ph-git-diff"></i><span>${esc(file)}</span><button class="vw-x" data-close aria-label="Đóng"><i class="ph ph-x"></i></button></header><div class="body">${skeleton(12)}</div>`;
    try {
      const text = await ctx.api(`review/diff?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(file)}`);
      $('#rvDiff .body').innerHTML = text.trim() ? `<pre class="rv-diff">${diffHtml(text)}</pre>` : note('ph-file', 'Không có diff (file nhị phân hoặc chưa đổi).');
    } catch (e) {
      $('#rvDiff .body').innerHTML = errNote(e);
    }
  }
  function closeDiff() {
    $('#rvVeil').classList.remove('show');
    $('#rvDiff').classList.remove('show');
  }

  el.addEventListener('click', (e) => {
    const t = e.target;
    const ticket = t.closest('[data-ticket]');
    if (ticket) return ctx.go('tasks', ticket.dataset.ticket);
    const diff = t.closest('[data-diff-file]');
    if (diff) return showDiff(diff.dataset.diffRepo, diff.dataset.diffFile);
    if (t.closest('[data-close]') || t.closest('#rvVeil')) return closeDiff();
    if (t.closest('#rvReload')) return load();
    if (t.closest('.rv-clean > summary')) cleanOpen = !t.closest('details').open;
    const commit = t.closest('[data-commit]');
    if (commit) {
      const [repo, sub] = commit.dataset.commit.split(/:(.*)/s);
      const subject = (subjects[commit.dataset.commit] ?? '').trim();
      if (!subject) {
        ctx.toast('Gõ subject trước (tiếng Anh). Console không tự bịa message.', true);
        return commit.previousElementSibling.focus();
      }
      const dir = repoPaths[repo] ?? repo;
      const leaf = sub.split('/').filter(Boolean).pop() ?? repo;
      return draft(ctx, `git -C "${dir}" add "${sub}" && git -C "${dir}" commit -m "[${leaf}] ${subject}" -m "${CO_AUTHOR}"`, `commit ${leaf}`, '');
    }
    const push = t.closest('[data-push]');
    if (push) {
      const [repo] = push.dataset.push.split(':');
      return draft(ctx, `git -C "${repoPaths[repo] ?? repo}" push origin ${push.dataset.branch}`, `push ${repo}`, '');
    }
    const openRepo = t.closest('[data-open-repo]');
    if (openRepo) return ctx.api('open', { method: 'POST', body: { app: 'vscode', target: repoPaths[openRepo.dataset.openRepo] ?? openRepo.dataset.openRepo } }).catch((err) => ctx.toast(`Không mở được VS Code: ${err.message}`, true));
    const gate = t.closest('[data-gate]');
    if (gate) {
      gate.disabled = true;
      gate.innerHTML = '<i class="ph ph-circle-notch vw-spin"></i>đang chạy';
      return ctx.api(`gate/run/${encodeURIComponent(gate.dataset.gate)}`, { method: 'POST', body: {} })
        .then((out) => ctx.toast(out.report.pass ? 'Cổng PASS' : `Cổng FAIL · ${out.report.counts.error} lỗi`), (err) => ctx.toast(err.message, true))
        .then(load);
    }
  });

  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-subject]')) subjects[e.target.dataset.subject] = e.target.value;
  });

  const onKey = (e) => e.key === 'Escape' && closeDiff();
  document.addEventListener('keydown', onKey);
  load();
  const timer = setInterval(load, REFRESH_MS);
  return () => {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey);
  };
}
