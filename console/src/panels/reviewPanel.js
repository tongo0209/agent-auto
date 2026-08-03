import $ from 'jquery';
import { api } from '@core/api';
import { icon } from '@core/icons';
import { escapeHtml } from '@core/format.mjs';
import { showDiff } from '@components/modal';

/**
 * Tab "Review" — chỗ làm 2 việc cuối mà chỉ user làm được: xem lại diff, rồi đẩy lên.
 *
 * Console KHÔNG commit, KHÔNG push. Nút chỉ GÕ HỘ lệnh vào tab terminal và KHÔNG Enter —
 * hành động ra ngoài luôn là do user bấm Enter (luật global: không bao giờ tự commit/push).
 */
const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>';
let ctx = { terminals: null, items: [], gates: {} };

export function initReviewPanel({ terminals }) {
  ctx.terminals = terminals;

  $('#review')
    .on('click', '[data-diff-repo]', function () {
      const repo = $(this).data('diff-repo');
      const file = $(this).data('diff-file');
      showDiff(file, () => api.reviewDiff(repo, file));
    })
    .on('click', '[data-commit-repo]', function () {
      const repo = $(this).data('commit-repo');
      const sub = String($(this).data('commit-path'));
      const leaf = sub.split('/').filter(Boolean).pop() || repo;
      const subject = String($(`#subj-${cssId(repo + sub)}`).val() || '').trim();
      if (!subject) {
        $(`#subj-${cssId(repo + sub)}`).trigger('focus');
        flash('Gõ subject trước (tiếng Anh, không dấu câu cuối) — không tự bịa message.');
        return;
      }
      // -m 2 lần: dòng 1 = subject theo convention team, dòng 2 = trailer đồng tác giả
      ctx.terminals.typeDraft(
        `git -C "${repoPath(repo)}" add "${sub}" && git -C "${repoPath(repo)}" commit -m "[${leaf}] ${subject}" -m "${CO_AUTHOR}"`
      );
      flash('Đã gõ vào terminal — đọc lại rồi tự bấm Enter.');
    })
    .on('click', '[data-push-repo]', function () {
      const repo = $(this).data('push-repo');
      const branch = $(this).data('push-branch');
      ctx.terminals.typeDraft(`git -C "${repoPath(repo)}" push origin ${branch}`);
      flash('Đã gõ lệnh push — đọc lại rồi tự bấm Enter.');
    })
    .on('click', '[data-open-repo]', function () {
      api.open('vscode', repoPath($(this).data('open-repo'))).catch(() => flash('Không mở được VS Code.'));
    })
    .on('click', '[data-gate-key]', function () {
      const key = $(this).data('gate-key');
      ctx.terminals.type(`node ~/VNG/agent-auto/tools/fe-gate.mjs <dist> --design ~/VNG/agent-auto/designs/${key} --json ~/VNG/agent-auto/knowledge/gates/${key}.json`);
    });
}

const cssId = (s) => s.replace(/[^A-Za-z0-9]/g, '');
const repoPath = (repo) => (ctx.repos || {})[repo] || repo;

function flash(text) {
  $('#review-flash').text(text).stop(true, true).show().delay(4000).fadeOut(300);
}

export async function loadReview() {
  let data;
  // Không cần khởi tạo `{ items: [] }`: nhánh catch return ngay, nên tới dòng dùng `gates`
  // bên dưới chắc chắn đã được gán trong try.
  let gates;
  try {
    [data, gates] = await Promise.all([api.review(), api.gates().catch(() => ({ items: [] }))]);
  } catch {
    $('#review').html('<span class="empty-note">Không đọc được /api/review.</span>');
    return;
  }
  ctx.items = data.items || [];
  ctx.gates = Object.fromEntries((gates.items || []).map((g) => [g.key, g]));

  // Đường dẫn repo thật lấy từ /api/state (config) — cần cho lệnh git -C
  try {
    const st = await api.state();
    ctx.repos = st.config?.repos || {};
  } catch {
    // Không lấy được /api/state — giữ ctx.repos như cũ, chỉ ảnh hưởng lệnh git -C (không chặn danh sách review)
  }

  const withWork = ctx.items.filter((i) => i.dirty || i.unpushed);
  $('#review-count').text(withWork.length ? `(${withWork.length})` : '');

  if (!ctx.items.length) {
    $('#review').html(
      '<span class="empty-note">Chưa ticket nào gắn folder làm việc. Gắn bằng <code>/daily link GW-xxx</code>.</span>'
    );
    return;
  }
  $('#review').html(ctx.items.map(card).join(''));
}

function card(item) {
  const parts = item.parts.map(part).join('');
  const badge = item.dirty
    ? `<span class="rbadge warn">${item.dirty} file chưa commit</span>`
    : item.unpushed
      ? `<span class="rbadge crit">${item.unpushed} commit chưa push</span>`
      : '<span class="rbadge ok">sạch · đã đẩy</span>';
  const gate = ctx.gates[item.key];
  const gateBadge = gate
    ? `<span class="rbadge ${gate.pass ? 'ok' : 'crit'}" title="fe-gate ${escapeHtml(String(gate.at || ''))}">${icon('gate')}${
        gate.pass ? `gate pass · ${gate.warn} warn` : `gate FAIL · ${gate.error} error`
      }</span>`
    : `<button type="button" class="rbadge ghost" data-gate-key="${escapeHtml(item.key)}" title="Chưa chạy fe-gate cho ticket này — bấm để gõ lệnh vào terminal">${icon('gate')}chưa chạy gate</button>`;

  return `<div class="rcard${item.dirty || item.unpushed ? ' has-work' : ''}">
    <div class="rhead">
      <span class="rkey">${escapeHtml(item.key)}</span>
      <span class="rsum" title="${escapeHtml(item.summary)}">${escapeHtml(item.summary)}</span>
      ${badge}${gateBadge}
    </div>
    ${parts}
  </div>`;
}

function part(p) {
  if (p.error) return `<div class="rpart"><span class="rerr">${icon('warn')}${escapeHtml(p.error)}</span></div>`;
  if (p.missing)
    return `<div class="rpart"><span class="rerr">${icon('warn')}folder chưa tồn tại: ${escapeHtml(p.path)}</span></div>`;

  const id = cssId(p.repo + p.path);
  const files = p.files.length
    ? `<table class="rfiles"><tbody>${p.files
        .map(
          (f) => `<tr>
            <td class="rf-st"><span class="st-${escapeHtml(f.label)}">${escapeHtml(f.label)}</span></td>
            <td class="rf-num">${f.added === null ? '—' : '+' + f.added}${f.deleted ? ' <i>-' + f.deleted + '</i>' : ''}</td>
            <td class="rf-name"><button type="button" class="linkbtn" data-diff-repo="${escapeHtml(p.repo)}"
              data-diff-file="${escapeHtml(f.file)}" title="Xem diff">${escapeHtml(shortPath(f.file, p.path))}</button></td>
          </tr>`
        )
        .join('')}</tbody></table>`
    : '';

  const unpushed = p.unpushed?.length
    ? `<div class="runpushed">${p.unpushed
        .map(
          (c) => `<div class="rcommit"><span class="mono">${escapeHtml(c.hash)}</span>
            <span class="rdate mono">${escapeHtml(c.date)}</span>
            <span class="rsubj">${escapeHtml(c.subject)}</span></div>`
        )
        .join('')}</div>`
    : '';

  return `<div class="rpart">
    <div class="rpath">
      <span class="rrepo">${icon('folder')}${escapeHtml(p.repo)}</span>
      <span class="mono rsub" title="${escapeHtml(p.path)}">${escapeHtml(p.path)}</span>
      <span class="rbranch mono" title="branch hiện tại">${icon('diff')}${escapeHtml(p.branch || '?')}</span>
      <button type="button" class="iconbtn" data-open-repo="${escapeHtml(p.repo)}" title="Mở repo trong VS Code">${icon('term')}</button>
    </div>
    ${files}${unpushed}
    <div class="ractions">
      ${
        p.files.length
          ? `<input type="text" class="rsubject" id="subj-${id}" placeholder="commit subject (English)" aria-label="Commit subject">
             <button type="button" class="btn small" data-commit-repo="${escapeHtml(p.repo)}" data-commit-path="${escapeHtml(p.path)}"
               title="Gõ lệnh commit vào terminal — KHÔNG tự Enter">${icon('commit')}gõ hộ commit</button>`
          : ''
      }
      ${
        p.unpushed?.length
          ? `<button type="button" class="btn small" data-push-repo="${escapeHtml(p.repo)}" data-push-branch="${escapeHtml(p.branch)}"
               title="Gõ lệnh push vào terminal — KHÔNG tự Enter">${icon('push')}gõ hộ push ${escapeHtml(p.branch)}</button>`
          : ''
      }
    </div>
  </div>`;
}

/** Bỏ phần prefix trùng với subpath cho tên file đọc được trong cột hẹp */
function shortPath(file, sub) {
  return file.startsWith(sub + '/') ? file.slice(sub.length + 1) : file;
}
