import $ from 'jquery';
import { api } from '@core/api';
import { escapeHtml, shortMonth } from '@core/format.mjs';
import { commitBarsByMonth } from '@components/charts';

const MAX_LIST = 80;
let month = null; // null = để backend chọn tháng hiện tại
let loading = false;

/** Tab "Git của tôi": chỉ commit do CHÍNH BẠN tạo, xem THEO THÁNG, mọi repo trong config.repos */
export function initGitPanel() {
  $('#git-months').on('click', '[data-month]', function () {
    if (loading) return;
    month = String($(this).data('month'));
    loadGit();
  });
}

export async function loadGit() {
  if (loading) return;
  loading = true;
  setLoading(true);

  let data;
  try {
    data = await api.git(month);
  } catch (err) {
    $('#git-list').html(
      `<span class="empty-note">Không đọc được git: ${escapeHtml(err.statusText || err.responseText || 'lỗi không rõ')}</span>`
    );
    loading = false;
    setLoading(false);
    return;
  }

  month = data.month;
  $('#git-author').text(data.author);
  $('#git-count').text(`(${data.commits.length})`);
  $('#git-cached').text(data.cached ? 'từ cache' : 'vừa đọc git');

  renderMonthChips(data);
  const { bars, axis } = commitBarsByMonth(data.commits, data.month, data.daysInMonth, data.mergeCount);
  $('#git-chart').html(bars);
  $('#git-axis').html(axis);
  renderRepoTotals(data.commits);
  renderCommitList(data.commits);

  loading = false;
  setLoading(false);
}

/** git log --shortstat mất vài giây cho tháng nặng → phải báo rõ đang tải */
function setLoading(on) {
  $('#pane-git').toggleClass('is-loading', on);
  if (on) {
    $('#git-cached').text('đang đọc git…');
    if (!$('#git-chart').children().length) {
      $('#git-chart').html('<span class="empty-note">Đang đọc git log (có thể mất vài giây cho tháng nhiều commit)…</span>');
    }
  }
}

function renderMonthChips(data) {
  $('#git-months').html(
    data.months
      .map(
        (m) =>
          `<button type="button" class="bchip ${m === data.month ? 'today' : ''}" data-month="${m}" title="Xem commit tháng ${m}">${shortMonth(m)}</button>`
      )
      .join('')
  );
}

function renderRepoTotals(commits) {
  const byRepo = {};
  commits.forEach((c) => {
    byRepo[c.repo] = (byRepo[c.repo] || 0) + 1;
  });
  $('#git-repos').html(
    Object.entries(byRepo)
      .sort((a, b) => b[1] - a[1])
      .map(([repo, n]) => `<span class="rchip">${escapeHtml(repo)} <b>${n}</b></span>`)
      .join('') || '<span class="empty-note">Không có commit nào trong tháng này.</span>'
  );
}

function renderCommitList(commits) {
  $('#git-list').html(
    commits
      .slice(0, MAX_LIST)
      .map(
        (c) => `<div class="commit">
          <div class="top">
            <span class="repo">${escapeHtml(c.repo)}</span>
            <span>${escapeHtml(c.date)}</span>
            <span class="hash">${escapeHtml(c.hash)}</span>
          </div>
          <div class="subj">${escapeHtml(c.subject)}</div>
          ${c.stat ? `<div class="stat">${escapeHtml(c.stat)}</div>` : ''}
        </div>`
      )
      .join('') || '<span class="empty-note">Không có commit nào của bạn trong tháng này.</span>'
  );
}
