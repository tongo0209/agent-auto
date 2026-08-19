import $ from 'jquery';
import { api } from '@core/api';
import { icon } from '@core/icons';
import { PHASE, MILESTONE_LABEL } from '@core/constants.mjs';
import { escapeHtml, shortDate } from '@core/format.mjs';
import { showText } from '@components/modal';

/**
 * Drawer "mọi thứ của MỘT ticket" — thay cho việc mở 4 chỗ (modal brief · Finder xem design ·
 * badge gate chỉ có số · modal commit).
 *
 * Gồm: hành động chạy được · gallery ảnh design + lightbox · **so ảnh design ↔ dist thật cạnh
 * nhau** (iframe cùng origin qua /preview/<KEY>) · findings gate đầy đủ · commit · file liên quan.
 *
 * Ranh giới giữ nguyên: lệnh có hậu quả (`/code-developer`, commit, push) chỉ GÕ HỘ vào terminal.
 * Console tự chạy đúng 2 thứ chỉ-đọc: `fe-gate` và serve `dist/`.
 */

/**
 * Khổ quy ước của team: PC 1920×1080, mobile 768×1024.
 * Ảnh design MB phải so với trang chạy ở khổ 768 — để iframe 1920 rồi so với ảnh mobile là so
 * hai layout khác nhau (trang chạy nhánh PC), nhìn đâu cũng thấy "lệch" mà chẳng lệch gì.
 */
const VIEWPORTS = { pc: 1920, mb: 768 };
const MB_RE = /(^|[_\-. ])(mb|mobile|m)([_\-. ]|$)/i;
const viewportFor = (name) => (MB_RE.test(String(name).replace(/\.[a-z]+$/i, '')) ? 'mb' : 'pc');
let ctx = {
  terminals: null,
  data: null,
  handoff: null,
  delivery: null,
  imgIndex: 0,
  compare: false,
  syncScroll: true,
};

export function initTicketPanel({ terminals }) {
  ctx.terminals = terminals;

  // Đánh Done là hành động THẬT trên Jira (PM/QC thấy ngay) → luôn qua dialog xác nhận, không
  // bao giờ bắn thẳng từ cú click đầu tiên.
  $('#done-cancel').on('click', () => document.getElementById('done-modal').close());
  $('#done-confirm').on('click', confirmDone);

  $('#dwrap')
    .on('click', '[data-drawer-close]', closeDrawer)
    .on('click', '[data-cmd-run]', function () {
      const cmd = String($(this).data('cmd-run'));
      ctx.terminals.type(cmd);
      flash('Đã gõ vào terminal: ' + cmd);
    })
    .on('click', '[data-cmd-draft]', function () {
      ctx.terminals.typeDraft(String($(this).data('cmd-draft')));
      flash('Đã gõ vào terminal — đọc lại rồi tự bấm Enter.');
    })
    .on('click', '[data-run-gate]', runGate)
    .on('click', '[data-jira-done]', openDoneDialog)
    .on('click', '[data-recheck-delivery]', () => reloadDelivery())
    .on('click', '[data-open-doc]', function () {
      const which = $(this).data('open-doc');
      const key = ctx.data.key;
      if (which === 'brief') showText('Brief ' + key, () => api.brief(key));
      else api.open('vscode', `${ctx.paths.tasks}/${key}/questions-for-pm.md`).catch(() => flash('Không mở được.'));
    })
    .on('click', '[data-thumb]', function () {
      openLightbox(Number($(this).data('thumb')));
    })
    // Tick 1 mục bàn giao — chống race y hệt "Cần bạn" của board: gửi `expectText` (dòng thô
    // đang thấy), lệch (agent /daily vừa ghi lại handoff.md) → 409, mở lại ticket để đọc bản mới.
    .on('change', '[data-handoff]', async function () {
      const $box = $(this);
      const text = String($box.data('handoff'));
      const done = this.checked;
      const expectText = (done ? '- [ ] ' : '- [x] ~~') + text + (done ? '' : '~~');
      $box.prop('disabled', true);
      try {
        await api.handoffCheck(ctx.data.key, { text, done, expectText });
        await reloadHandoff();
      } catch (err) {
        $box.prop('checked', !done); // ghi thất bại → trả lại trạng thái cũ trên UI
        flash(
          'Không ghi được bàn giao: ' +
            (err.responseJSON?.error || 'lỗi không rõ') +
            (err.status === 409 ? ' — vừa bị sửa chỗ khác, đang nạp lại.' : '')
        );
        if (err.status === 409) await reloadHandoff();
      } finally {
        $box.prop('disabled', false);
      }
    });

  $('#lbox')
    .on('click', '[data-lbox-close]', closeLightbox)
    .on('click', '[data-lbox-prev]', () => stepImage(-1))
    .on('click', '[data-lbox-next]', () => stepImage(1))
    .on('click', '[data-lbox-compare]', toggleCompare)
    .on('click', '[data-lbox-sync]', () => {
      ctx.syncScroll = !ctx.syncScroll;
      $('[data-lbox-sync]').toggleClass('on', ctx.syncScroll).attr('aria-pressed', String(ctx.syncScroll));
    });

  // Bàn phím: Esc đóng lớp trên cùng trước, ←/→ đổi ảnh
  $(document).on('keydown', (e) => {
    if (!$('#lbox').is(':visible') && !$('#dwrap').is(':visible')) return;
    if (e.key === 'Escape') {
      if ($('#lbox').is(':visible')) closeLightbox();
      else closeDrawer();
    } else if ($('#lbox').is(':visible') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      stepImage(e.key === 'ArrowLeft' ? -1 : 1);
      e.preventDefault();
    }
  });
}

const flash = (text) => $('#drawer-flash').text(text).stop(true, true).show().delay(3500).fadeOut(300);

/* ─────────────────────────── mở / đóng ─────────────────────────── */

export async function openTicket(key, paths) {
  ctx.paths = paths || ctx.paths || {};
  $('#dwrap').show();
  $('#drawer-body').html('<div class="empty-note">Đang đọc dữ liệu ticket…</div>');
  $('#drawer-key').text(key);
  try {
    ctx.data = await api.ticket(key);
  } catch (err) {
    $('#drawer-body').html(`<div class="rerr">${icon('warn')}${escapeHtml(err.responseJSON?.error || 'không đọc được ticket')}</div>`);
    return;
  }
  // Bàn giao là dữ liệu PHỤ (đa số ticket không có handoff.md) — lỗi mạng ở đây không được
  // chặn cả drawer, chỉ coi như "chưa có sổ bàn giao". reloadHandoff() tự render() luôn.
  await reloadHandoff();

  // Soi repo promotion có `git fetch` bên trong (vài giây) → KHÔNG await trước khi vẽ drawer,
  // để nó tự vẽ lại khi có kết quả. Ticket không có kênh promotion thì khỏi gọi cho tốn.
  if (ctx.data.issue && ctx.data.issue.promoFolder) reloadDelivery();
}

/** Soi lại repo gt-promotion rồi vẽ lại. Chỉ đọc — bấm bao nhiêu lần cũng không đổi gì. */
async function reloadDelivery() {
  const key = ctx.data.key;
  ctx.delivery = { loading: true };
  render();
  try {
    const out = await api.delivery(key);
    // Drawer có thể đã đổi sang ticket khác trong lúc chờ fetch — kết quả cũ thì bỏ.
    if (ctx.data.key !== key) return;
    ctx.delivery = out;
  } catch (err) {
    if (ctx.data.key !== key) return;
    ctx.delivery = { state: 'error', canDone: false, message: err.responseJSON?.error || 'không soi được repo' };
  }
  render();
}

/** Nạp lại `tasks/<KEY>/handoff.md` rồi vẽ lại drawer — dùng lúc mở ticket và sau mỗi lần tick */
async function reloadHandoff() {
  try {
    ctx.handoff = await api.handoff(ctx.data.key);
  } catch {
    ctx.handoff = { exists: false, items: [] };
  }
  render();
}

function closeDrawer() {
  $('#dwrap').hide();
  closeLightbox();
}

/* ─────────────────────────── nội dung drawer ─────────────────────────── */

function render() {
  const d = ctx.data;
  const issue = d.issue;
  const phase = PHASE[issue.phase] || { label: issue.phase, sev: 'wait', icon: 'dot' };
  const ms = Object.entries(issue.milestones || {});

  $('#drawer-title').html(
    `<span class="ph" style="color:var(--${phase.sev})">${icon(phase.icon)}${escapeHtml(phase.label)}</span>
     <span class="dsum">${escapeHtml(issue.summary || '')}</span>`
  );
  const jira = (d.site || '') + '/browse/' + d.key;
  $('#drawer-key').text(d.key).attr('href', jira);
  $('#drawer-jira').attr('href', jira);

  $('#drawer-body').html(
    [
      milestoneRow(ms),
      deliverySection(),
      handoffSection(ctx.handoff),
      actionRow(d),
      designSection(d),
      gateSection(d.gate),
      gitSection(d.activity),
      filesSection(d),
    ].join('')
  );
}

/**
 * Sổ bàn giao `tasks/<KEY>/handoff.md` — chỉ sinh ra khi ticket đã chuyển người (phase
 * `reassigned`), chở những việc NGOÀI REPO mà trước đây chỉ nằm im trong field `note` của
 * state.json (không ai ngoài user đọc, xem ca GW-654 3/8). Không có file thì KHÔNG vẽ mục
 * này — phần lớn ticket còn trong tay mình không cần sổ bàn giao.
 */
function handoffSection(handoff) {
  if (!handoff || !handoff.exists) return '';
  const done = handoff.items.filter((it) => it.done).length;
  const rows = handoff.items
    .map(
      (it) => `<li style="display:flex;align-items:flex-start;gap:6px;">
        <label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;">
          <input type="checkbox" data-handoff="${escapeHtml(it.text)}" ${it.done ? 'checked' : ''}>
          <span${it.done ? ' style="color:var(--muted);text-decoration:line-through;"' : ''}>${escapeHtml(it.text)}</span>
        </label>
      </li>`
    )
    .join('');
  return section(
    'handoff',
    `${icon('handoff')} Bàn giao <span class="count">(${done}/${handoff.items.length})</span>`,
    `<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;">${rows}</ul>`
  );
}

/**
 * Bàn giao qua gt-promotion + nút đánh Done.
 *
 * Bằng chứng bàn giao của team là chính repo gt-promotion (file đã push), KHÔNG phải chữ ghi
 * trong description Jira — console không đụng gì tới description. Vì thế mục này chỉ soi repo,
 * và chỉ mở đường Done khi repo chứng minh được là hàng đã lên remote.
 */
function deliverySection() {
  const d = ctx.delivery;
  if (!d) return '';

  const title = `${icon('deliver')} Bàn giao promotion`;
  if (d.loading) return section('delivery', title, '<div class="empty-note">Đang soi repo gt-promotion…</div>');
  if (d.state === 'n/a') return '';

  const recheck = `<button type="button" class="btn small ghost" data-recheck-delivery
    title="Soi lại repo (git fetch + kiểm remote) — chỉ đọc">${icon('search')}soi lại</button>`;

  if (d.state !== 'delivered')
    return section(
      'delivery',
      title,
      `<div class="rerr">${icon('warn')}${escapeHtml(d.message || 'chưa bàn giao')}</div>
       <div class="dactions">${recheck}</div>`
    );

  const jiraDone = d.jira && d.jira.statusCategory === 'done';
  const folder = (d.promoFolder || '') + '/mainsite';
  const link = d.url
    ? `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(folder)}${icon('ext')}</a>`
    : escapeHtml(folder);

  const rows = `
    <div class="dnote">${icon('commit')} <code>${escapeHtml(d.commit || '')}</code>
      ${escapeHtml(String(d.at || '').replace('T', ' ').slice(0, 16))} · ${escapeHtml((d.files || []).join(', '))}</div>
    <div class="dnote">${link}</div>
    ${d.dirty ? `<div class="rerr">${icon('warn')}${escapeHtml(d.message)}</div>` : ''}
    ${d.fetched === false ? `<div class="dnote">${icon('warn')} không fetch được remote — đang soi bản origin cũ trên máy</div>` : ''}`;

  // Thiếu token thì vẫn cho xem mọi thứ, chỉ khoá đúng cái nút đổi trạng thái thật.
  const action = jiraDone
    ? `<span class="rbadge ok">${icon('done')}Jira đã ở ${escapeHtml(d.jira.status)}</span>`
    : d.jiraError
      ? `<div class="dnote">${icon('warn')} ${escapeHtml(d.jiraError)}</div>`
      : `<button type="button" class="btn small" data-jira-done
          title="Đổi status ticket trên Jira — có hỏi lại trước khi bắn">${icon('done')}đánh Done trên Jira</button>`;

  return section(
    'delivery',
    `${title} <span class="rbadge ok">${icon('check')}đã push</span>`,
    `${rows}<div class="dactions">${action}${recheck}</div>`
  );
}

/** Mở dialog xác nhận — bày đúng bằng chứng đang có để user quyết, không giục */
function openDoneDialog() {
  const d = ctx.delivery || {};
  const jira = d.jira || {};
  $('#done-body').html(
    `<p>Chuyển <b>${escapeHtml(ctx.data.key)}</b> từ <b>${escapeHtml(jira.status || '?')}</b> sang trạng thái hoàn thành trên Jira.</p>
     <p class="dnote">Bằng chứng: đã push commit <code>${escapeHtml(d.commit || '')}</code> vào
       <code>${escapeHtml(d.promoFolder || '')}/mainsite</code> (${escapeHtml((d.files || []).join(', '))}).</p>
     ${d.dirty ? `<p class="rerr">${icon('warn')}Folder còn thay đổi chưa commit/chưa push — bản mới nhất CHƯA lên remote.</p>` : ''}
     <p class="dnote">Console không ghi gì vào description ticket.</p>`
  );
  $('#done-confirm').prop('disabled', false).text('Đánh Done');
  document.getElementById('done-modal').showModal();
}

async function confirmDone() {
  const key = ctx.data.key;
  const $btn = $('#done-confirm').prop('disabled', true).text('Đang đổi…');
  try {
    // `expectUpdated` = mốc sửa đổi lúc soi repo. Ticket bị đổi từ lúc đó → server trả 409 và
    // KHÔNG transition, thay vì đè lên việc người khác vừa làm.
    const out = await api.jiraDone(key, { expectUpdated: ctx.delivery?.jira?.updated });
    document.getElementById('done-modal').close();
    flash(out.already ? out.message : `Đã chuyển ${key}: ${out.from} → ${out.status} (${out.via}).`);
    await reloadDelivery();
  } catch (err) {
    const msg = err.responseJSON?.error || 'lỗi không rõ';
    $('#done-body').append(`<p class="rerr">${icon('warn')}${escapeHtml(msg)}</p>`);
    $btn.prop('disabled', false).text('Thử lại');
  }
}

function milestoneRow(ms) {
  if (!ms.length) return '';
  return `<div class="dms">${ms
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(
      ([name, date]) =>
        `<span class="dmschip"><b>${escapeHtml(MILESTONE_LABEL[name] || name)}</b> ${escapeHtml(shortDate(date))}</span>`
    )
    .join('')}</div>`;
}

/** Hàng hành động — mỗi nút nói rõ nó GÕ lệnh hay TỰ CHẠY */
function actionRow(d) {
  const key = d.key;
  const brief = `agent-auto/tasks/${key}/brief.md`;
  const design = `agent-auto/designs/${key}`;
  const full = `/code-developer full ${brief} · design ${design}`;
  const fix = `/code-developer fix ${brief} · design ${design}`;
  const check = `/code-developer check ${brief} · design ${design}`;

  return `<div class="dactions">
    <button type="button" class="btn small" data-cmd-draft="${escapeHtml(full)}"
      title="Gõ lệnh dựng UI (mode full) vào terminal — không tự Enter">${icon('play')}dev full</button>
    <button type="button" class="btn small" data-cmd-draft="${escapeHtml(fix)}"
      title="Gõ lệnh sửa UI khớp design (mode fix)">${icon('coding')}dev fix</button>
    <button type="button" class="btn small ghost" data-cmd-draft="${escapeHtml(check)}"
      title="Gõ lệnh so code với design (mode check)">${icon('search')}check</button>
    <span class="sep"></span>
    <button type="button" class="btn small" data-run-gate="${escapeHtml(key)}"
      title="Console TỰ CHẠY fe-gate trên dist (chỉ đọc dist, không đụng git)">${icon('gate')}chạy gate</button>
    ${
      d.dist
        ? `<a class="btn small ghost" href="/preview/${escapeHtml(key)}/" target="_blank" rel="noopener"
             title="Mở dist/ thật của ticket trong tab mới (console serve, không cần http-server)">${icon('ext')}mở preview</a>`
        : `<span class="dnote">chưa có <code>dist/</code> — build trước rồi mới preview/gate được</span>`
    }
    <span class="sep"></span>
    <button type="button" class="btn small ghost" data-cmd-run="/daily prep ${escapeHtml(key)}"
      title="Chạy /daily prep — chuẩn bị sâu ticket này">${icon('term')}prep</button>
  </div>`;
}

/** Gallery ảnh design — nguồn `designs/<KEY>/` cấp 1 (không lấy `_raw/`: zip/PSD gốc) */
function designSection(d) {
  if (!d.images.length)
    return section(
      'design',
      'Ảnh design',
      `<div class="empty-note">Chưa có ảnh trong <code>designs/${escapeHtml(d.key)}/</code>${
        d.issue.design?.link ? ' — link OneDrive có trong bảng task (nút ↗).' : '.'
      }</div>`
    );

  const thumbs = d.images
    .map(
      (im, i) => `<button type="button" class="thumb" data-thumb="${i}" title="${escapeHtml(im.name)} · ${(im.size / 1048576).toFixed(1)}MB">
        <img src="${escapeHtml(im.url)}" alt="${escapeHtml(im.name)}" loading="lazy">
        <span class="tname">${escapeHtml(im.name.replace(/\.[a-z]+$/i, ''))}</span>
      </button>`
    )
    .join('');
  return section('design', `Ảnh design <span class="count">(${d.images.length})</span>`, `<div class="gallery">${thumbs}</div>`);
}

/** Findings gate ĐẦY ĐỦ (bảng task chỉ có số đếm) */
function gateSection(gate) {
  if (!gate)
    return section(
      'gate',
      'Gate chất lượng',
      `<div class="empty-note">Chưa chạy <code>fe-gate</code> cho ticket này — bấm <b>chạy gate</b> ở trên.
       "Chưa chạy" không có nghĩa là không lỗi.</div>`
    );

  const when = String(gate.at || '').replace('T', ' ').slice(0, 16);
  const head = `<div class="dstat">
      <span class="rbadge ${gate.pass ? 'ok' : 'crit'}">${icon('gate')}${gate.pass ? 'PASS' : 'FAIL'}</span>
      <span class="mono">${gate.counts.error} ERROR · ${gate.counts.warn} WARN</span>
      <span class="dnote">quét ${gate.scanned.css} css · ${gate.scanned.html} html · ${gate.scanned.fontFaces} @font-face · ${gate.scanned.refs} ref · ${escapeHtml(when)}</span>
    </div>`;

  const list = gate.findings.length
    ? `<ul class="findings">${gate.findings
        .map(
          (f) => `<li class="fd ${f.level === 'ERROR' ? 'err' : 'wrn'}">
            <span class="fcheck">${escapeHtml(f.check)}</span>
            <span class="fmsg">${escapeHtml(f.message)}</span>
            ${f.where ? `<span class="fwhere mono">${escapeHtml(f.where)}</span>` : ''}
          </li>`
        )
        .join('')}</ul>`
    : '<div class="empty-note">Không có finding nào.</div>';
  return section('gate', 'Gate chất lượng', head + list);
}

function gitSection(act) {
  if (!act || !act.linked)
    return section('git', 'Git', '<div class="empty-note">Ticket chưa gắn folder — dùng <code>/daily link</code>.</div>');
  const rows = (act.commitList || [])
    .slice(0, 12)
    .map(
      (c) => `<div class="rcommit"><span class="mono">${escapeHtml(c.hash)}</span>
        <span class="rdate mono">${escapeHtml(c.date)}</span>
        <span class="rsubj">${escapeHtml(c.subject)}</span>
        <span class="mono dnote">+${c.sourceAdded}/-${c.sourceRemoved}</span></div>`
    )
    .join('');
  return section(
    'git',
    `Git <span class="count">(${act.commits} commit · ${act.activeDays} ngày có việc)</span>`,
    rows || '<div class="empty-note">Chưa có commit nào trong folder đã gắn.</div>'
  );
}

function filesSection(d) {
  const items = [
    d.files.brief ? `<button type="button" class="bchip" data-open-doc="brief">${icon('brief')} brief.md</button>` : '',
    d.files.questions
      ? `<button type="button" class="bchip" data-open-doc="questions">${icon('question')} questions-for-pm.md</button>`
      : '',
    d.dist ? `<span class="bchip static mono" title="folder làm việc">${icon('folder')} ${escapeHtml(d.dist.sub)}</span>` : '',
    d.issue.promoFolder
      ? `<span class="bchip static mono" title="folder gt-promotion">${icon('deliver')} ${escapeHtml(d.issue.promoFolder)}</span>`
      : '',
  ]
    .filter(Boolean)
    .join('');
  return section('files', 'File & folder', `<div class="boardlist">${items || '<span class="empty-note">—</span>'}</div>`);
}

const section = (id, title, body) =>
  `<section class="dsec" data-sec="${id}"><h3>${title}</h3>${body}</section>`;

/* ─────────────────────────── chạy gate ─────────────────────────── */

async function runGate() {
  const key = ctx.data.key;
  const $btn = $('[data-run-gate]');
  $btn.prop('disabled', true).text('đang chạy…');
  try {
    const out = await api.runGate(key);
    ctx.data.gate = out.report;
    $('[data-sec="gate"]').replaceWith(gateSection(out.report));
    flash(
      out.report.pass
        ? `Gate PASS — 0 ERROR · ${out.report.counts.warn} WARN`
        : `Gate FAIL — ${out.report.counts.error} ERROR (sửa trước khi báo xong)`
    );
  } catch (err) {
    flash('Không chạy được gate: ' + (err.responseJSON?.error || 'lỗi không rõ'));
  } finally {
    $btn.prop('disabled', false).html(icon('gate') + 'chạy gate');
  }
}

/* ─────────────────────────── lightbox + so sánh ─────────────────────────── */

function openLightbox(index) {
  ctx.imgIndex = index;
  $('#lbox').css('display', 'flex');
  renderLightbox();
}
function closeLightbox() {
  $('#lbox').hide();
  ctx.compare = false;
}
function stepImage(delta) {
  const n = ctx.data.images.length;
  ctx.imgIndex = (ctx.imgIndex + delta + n) % n;
  renderLightbox();
}
function toggleCompare() {
  ctx.compare = !ctx.compare;
  renderLightbox();
}

function renderLightbox() {
  const d = ctx.data;
  const im = d.images[ctx.imgIndex];
  const canCompare = Boolean(d.dist);

  $('#lbox-title').text(`${im.name} · ${ctx.imgIndex + 1}/${d.images.length}`);
  $('[data-lbox-compare]')
    .toggle(canCompare)
    .toggleClass('on', ctx.compare)
    .attr('aria-pressed', String(ctx.compare))
    .html(icon('diff') + (ctx.compare ? 'chỉ xem design' : 'so với dist'));
  $('[data-lbox-sync]').toggle(ctx.compare && canCompare);

  if (!ctx.compare) {
    $('#lbox-stage')
      .removeClass('cmp')
      .html(`<div class="lpane"><img src="${escapeHtml(im.url)}" alt="${escapeHtml(im.name)}"></div>`);
    return;
  }

  $('#lbox-stage').addClass('cmp').html(
    `<div class="lpane" id="lp-design"><img src="${escapeHtml(im.url)}" alt="${escapeHtml(im.name)}"></div>
     <div class="lpane" id="lp-dist"><div class="fwrap"><iframe id="dist-frame" src="/preview/${escapeHtml(d.key)}/"
        title="dist thật của ${escapeHtml(d.key)}"></iframe></div></div>`
  );
  scaleFrame();
  bindSyncScroll();
}

/**
 * Landing của team dựng theo khổ 1920 → iframe phải rộng đúng 1920 rồi mới `scale` xuống bề
 * rộng pane. Đặt `width: 100%` cho iframe là trang tự chạy layout mobile, so với design PC
 * thành so hai thứ khác nhau.
 */
function scaleFrame() {
  const $pane = $('#lp-dist');
  const $frame = $('#dist-frame');
  if (!$pane.length || !$frame.length) return;

  const im = ctx.data.images[ctx.imgIndex];
  const vp = viewportFor(im.name);
  const width = VIEWPORTS[vp];
  const paneW = $pane.width();
  const k = paneW / width;

  $frame.css({
    width: width + 'px',
    height: Math.round($pane.height() / k) + 'px',
    transform: `scale(${k})`,
    transformOrigin: 'top left',
  });
  $('#lbox-scale').text(`dist khổ ${width}px (${vp.toUpperCase()}) · scale ${Math.round(k * 100)}%`);
}

/**
 * Cuộn đồng bộ theo TỈ LỆ (không theo px): ảnh design và trang thật cao khác nhau.
 * iframe cùng origin (localhost:4747) nên đọc/ghi scroll của nó là hợp lệ.
 */
function bindSyncScroll() {
  const pane = document.getElementById('lp-design');
  const frame = document.getElementById('dist-frame');
  if (!pane || !frame) return;

  let lock = false;
  pane.onscroll = () => {
    if (!ctx.syncScroll || lock) return;
    const ratio = pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight);
    try {
      const doc = frame.contentWindow.document.documentElement;
      const max = Math.max(1, doc.scrollHeight - frame.contentWindow.innerHeight);
      lock = true;
      frame.contentWindow.scrollTo(0, ratio * max);
      setTimeout(() => (lock = false), 30);
    } catch {
      /* trang trong iframe chưa load xong — lần cuộn sau tự khớp */
    }
  };
}

$(window).on('resize', () => {
  if (ctx.compare && $('#lbox').is(':visible')) scaleFrame();
});
