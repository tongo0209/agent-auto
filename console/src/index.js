import $ from 'jquery';
import '@xterm/xterm/css/xterm.css';
import './styles/index.css';

import { api } from '@core/api';
import { COMMANDS, POLL_MS } from '@core/constants.mjs';
import { icon } from '@core/icons';
import { TerminalManager } from '@terminal/TerminalManager';
import { initSplitter } from '@core/splitter';
import { initModal } from '@components/modal';
import { initTodayPanel, renderToday } from '@panels/todayPanel';
import { initTicketPanel } from '@panels/ticketPanel';
import { initReviewPanel, loadReview } from '@panels/reviewPanel';
import { initMonthsPanel, loadMonths } from '@panels/monthsPanel';
import { initGitPanel, loadGit } from '@panels/gitPanel';
import { initHistoryPanel, loadHistory } from '@panels/historyPanel';

// Tab "Theo tháng" gánh luôn phần lịch sử (board cũ · gt-promotion · metrics · vòng học) —
// trước đây là tab riêng nhưng chỉ có 3 dòng nội dung nên đứng riêng thành cả màn trống.
const PANEL_LOADERS = {
  review: loadReview,
  months: () => Promise.all([loadMonths(), loadHistory()]),
  git: loadGit,
};

const BASE_TITLE = 'Daily Console — tont';
let pendingNotes = 0;

/**
 * Thông báo cho user đang làm việc khác: badge title + Notification của browser.
 * Quyền Notification xin khi user BẤM nút đầu tiên (gesture), không xin lúc load —
 * xin lúc load thì Chrome chặn thẳng và không bao giờ hỏi lại.
 */
function notify(title, body) {
  pendingNotes += 1;
  document.title = `● (${pendingNotes}) ${BASE_TITLE}`;
  try {
    if (window.Notification && Notification.permission === 'granted') new Notification(title, { body });
  } catch {
    /* thông báo không được là chuyện nhỏ, không làm vỡ trang */
  }
}

function askNotifyPermissionOnce() {
  try {
    if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
  } catch {
    // Trình duyệt không hỗ trợ / chặn API Notification — bỏ qua, không phải lỗi chặn UI
  }
  $(document).off('click.notifyperm');
}

$(function boot() {
  $(document).on('click.notifyperm', askNotifyPermissionOnce);

  // --- Terminal (cột phải) ---
  const terminals = new TerminalManager({
    termsSelector: '#terms',
    tabsSelector: '#ttabs',
    onStatusChange: ({ alive, total }) => {
      $('#conn')
        .text(alive ? `${alive}/${total} terminal đã nối` : 'mất kết nối — tự thử lại')
        .attr('class', 'conn ' + (alive ? 'ok' : 'bad'));
    },
    // Heuristic: tab chạy ≥30s rồi im ≥5s = vừa xong 1 lượt. KHÔNG suy ra "thành công".
    onIdle: ({ label, busySec }) => {
      if (document.hasFocus()) return;
      notify('Tab ' + label + ' đã rảnh', `Im ${5}s sau ${busySec}s chạy — xem lại kết quả (không rõ thành công hay lỗi).`);
    },
  });
  // Dựng lại tab của lần trước và nối vào phiên pty cũ (reload không giết claude đang chạy)
  terminals.restore();

  // Kéo đổi tỉ lệ 2 cột — terminal fit lại sau mỗi lần đổi
  initSplitter({ onResize: () => terminals.fitActive() });

  // Toolbar lệnh — render từ constants để thêm/bớt chỉ sửa 1 chỗ
  $('#toolbar-cmds').html(
    COMMANDS.map(
      (c, i) =>
        `<button type="button" class="btn ${c.primary ? 'primary' : ''}" data-cmd-index="${i}" title="${c.title}">${
          c.icon ? icon(c.icon) : ''
        }${c.label}</button>` + (c.primary ? '<span class="sep"></span>' : '')
    ).join('')
  );

  // Icon cho các nút tĩnh trong index.html (HTML giữ sạch, không nhúng SVG)
  $('#search-icon').html(icon('search'));
  $('#filter-clear').html(icon('close'));
  $('#toolbar-cmds').on('click', '[data-cmd-index]', function () {
    const cmd = COMMANDS[Number($(this).data('cmd-index'))];
    if (!cmd) return;
    // Lệnh chạy dài (radar) mở tab riêng để không chiếm tab đang làm việc
    if (cmd.newTab) terminals.create(cmd.newTab);
    terminals.type(cmd.cmd);
  });
  $('#tab-add').on('click', () => terminals.create(`term ${terminals.sessions.length + 1}`));
  $('#ctrlc').on('click', () => terminals.sendCtrlC());
  $('#clear').on('click', () => terminals.clearActive());

  // --- Tabs cột trái ---
  $('.tabs').on('click', '.tab', function () {
    const name = $(this).data('tab');
    $('.tab').removeClass('active');
    $(this).addClass('active');
    $('.pane').removeClass('active');
    $('#pane-' + name).addClass('active');
    if (PANEL_LOADERS[name]) PANEL_LOADERS[name]();
  });

  initModal();
  initTicketPanel({ terminals });
  initTodayPanel({ terminals, notify });
  initReviewPanel({ terminals });
  initMonthsPanel();
  initGitPanel();
  initHistoryPanel();

  // --- Poll tab Hôm nay ---
  let lastOk = null;
  function paintFresh() {
    if (!lastOk) return;
    const sec = Math.round((Date.now() - lastOk) / 1000);
    $('#fresh').text(sec < 8 ? 'vừa cập nhật' : `dữ liệu cách đây ${sec}s`);
  }
  async function poll() {
    try {
      renderToday(await api.state());
      lastOk = Date.now();
    } catch {
      /* server tắt — giữ UI cũ, lần poll sau tự khôi phục */
    }
    paintFresh();
  }
  poll();
  setInterval(poll, POLL_MS);
  setInterval(paintFresh, 1000);

  /**
   * Nút "Cập nhật": thay cho việc tự gõ /daily.
   * Vẽ lại từ đĩa là việc của poll (3s). Dữ liệu MỚI (Jira, gt-promotion) đến từ 2 đường:
   * radar nền 30' (launchd → tools/radar-tick.mjs) và nút này — gõ hộ /daily delta vào
   * terminal để quét ngay, không phải đợi hết nhịp.
   */
  $('#reload-now').on('click', async function () {
    const $b = $(this).prop('disabled', true).text('Đang quét…');
    terminals.type('/daily delta');
    try {
      await poll();
    } finally {
      $b.prop('disabled', false).text('Cập nhật');
    }
  });

  // Tab Review poll chậm hơn (git status có cache 5s phía server)
  setInterval(() => {
    if ($('#pane-review').hasClass('active')) loadReview();
  }, 15000);

  $(window).on('focus', () => {
    pendingNotes = 0;
    document.title = BASE_TITLE;
  });
});
