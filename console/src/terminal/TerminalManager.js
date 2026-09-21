import $ from 'jquery';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { icon } from '@core/icons';
import { IDLE } from '@core/constants.mjs';
import { loadTabs, saveTabs, newSessionId } from '@terminal/sessionStore.mjs';
import { gridFor, visiblePanes, loadLayout, saveLayout } from '@terminal/gridLayout.mjs';
import { startupInput } from '@terminal/startup.mjs';

const THEME = {
  background: '#0A100F',
  foreground: '#E6EFEC',
  cursor: '#3ACDB9',
  selectionBackground: '#2A4C46',
};
const RECONNECT_MS = 2000;
/** Dưới ngưỡng này bảng/diff của Claude Code wrap xấu → đầu pane hiện số cols để user bớt ô */
const READABLE_COLS = 80;
const FIT_DEBOUNCE_MS = 80;

/**
 * Quản lý NHIỀU tab terminal, mỗi tab = 1 pty thật qua WebSocket.
 * Cho phép chạy song song: tab code, tab bug-fixer-lite, tab shell tự do.
 */
export class TerminalManager {
  constructor({ termsSelector, tabsSelector, onStatusChange, onIdle, onLayout }) {
    this.$terms = $(termsSelector);
    this.$tabs = $(tabsSelector);
    this.onStatusChange = onStatusChange || (() => {});
    this.onIdle = onIdle || (() => {});
    this.onLayout = onLayout || (() => {});
    this.sessions = [];
    this.activeIndex = -1;
    this.layout = loadLayout(window.localStorage);
    this.gridModeBeforeAll = 'auto';
    this.fitTimer = null;
    this.watchIdle();

    this.$tabs.on('click', '[data-close]', (e) => {
      e.stopPropagation();
      this.close(Number($(e.currentTarget).data('close')));
    });
    this.$tabs.on('click', '[data-tab-index]', (e) => this.activate(Number($(e.currentTarget).data('tab-index'))));
    this.$terms.on('click', '[data-pane-close]', (e) => {
      e.stopPropagation();
      this.close(this.indexOfWrap($(e.currentTarget).closest('.tw')));
    });
    this.$terms.on('click', '[data-pane-back]', (e) => {
      e.stopPropagation();
      this.setZoom(false);
    });
    this.$terms.on('mousedown', '.tw', (e) => {
      const index = this.indexOfWrap($(e.currentTarget));
      if (index !== this.activeIndex) this.activate(index);
    });
    // Ở chế độ "xem tất cả", bấm vào ô nào là phóng to ô đó (vẫn phiên pty cũ, không dựng lại)
    this.$terms.on('click', '.tw', () => {
      if (this.isOverview) this.setZoom(true);
    });

    $(window).on('resize', () => this.scheduleFit());
    new window.ResizeObserver(() => this.scheduleFit()).observe(this.$terms[0]);
  }

  /**
   * Dựng lại các tab của lần chạy trước rồi nối vào ĐÚNG phiên pty cũ (id lưu trong
   * localStorage, phiên sống ở server — xem server/lib/ptyStore.js). Nhờ vậy reload trang
   * không giết claude đang chạy. Chưa có gì lưu → mở 1 tab mới như trước.
   */
  restore() {
    const saved = loadTabs(window.localStorage);
    if (!saved.length) {
      this.create('term 1', null, { startup: true });
      this.create('term 2');
      return this.activate(0);
    }
    for (const t of saved) this.create(t.label || 'term', t.id);
    this.activate(0);
  }

  create(label, id, { startup = false } = {}) {
    const $wrap = $(`<div class="tw">
        <div class="phead">
          <span class="dot"></span><span class="pname"></span>
          <span class="pcols" title="Số cột — dưới ${READABLE_COLS} thì Claude Code đọc xấu"></span>
          <button type="button" class="pback" data-pane-back title="Về lưới tất cả terminal">${icon('grid')} tất cả</button>
          <button type="button" class="px" data-pane-close title="Đóng terminal">${icon('close')}</button>
        </div>
        <div class="pbody"></div>
      </div>`).appendTo(this.$terms);
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 8000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open($wrap.find('.pbody')[0]);

    const session = {
      term,
      fit,
      $wrap,
      ws: null,
      alive: false,
      // id neo phiên pty ở server — phải sinh MỘT LẦN rồi giữ nguyên qua mọi lần reconnect
      id: id || newSessionId(),
      label: label || `term ${this.sessions.length + 1}`,
      lastOutputAt: 0,
      busySince: null,
    };
    this.sessions.push(session);
    this.persist();

    term.onData((data) => this.send(session, { type: 'input', data }));
    this.connect(session, startup);
    this.activate(this.sessions.length - 1);
    return session;
  }

  persist() {
    saveTabs(window.localStorage, this.sessions);
  }

  connect(session, startup = false) {
    // `?id=` là thứ làm nên việc nối lại: cùng id → server trả về đúng pty cũ + phát lại phần
    // output đã lỡ, thay vì spawn shell mới.
    const ws = new WebSocket(`ws://${location.host}/term?id=${encodeURIComponent(session.id)}${startup ? '&startup=1' : ''}`);
    session.ws = ws;
    ws.onopen = () => {
      session.alive = true;
      this.renderTabs();
      this.fit(session);
    };
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'attached') {
        session.resumed = msg.resumed;
        const input = startupInput(msg);
        if (input) this.send(session, { type: 'input', data: input });
        this.renderTabs();
        return;
      }
      if (msg.type !== 'output') return;
      session.term.write(msg.data);
      const now = Date.now();
      // Khoảng lặng dài hơn busyGap = phiên làm việc mới bắt đầu
      if (session.busySince === null || now - session.lastOutputAt > IDLE.busyGapMs * 3) session.busySince = now;
      session.lastOutputAt = now;
    };
    ws.onclose = () => {
      session.alive = false;
      this.renderTabs();
      // Tab còn tồn tại → tự nối lại (server restart không mất tab)
      setTimeout(() => {
        if (this.sessions.includes(session)) this.connect(session);
      }, RECONNECT_MS);
    };
  }

  send(session, payload) {
    if (session && session.ws && session.ws.readyState === 1) session.ws.send(JSON.stringify(payload));
  }

  get active() {
    return this.sessions[this.activeIndex];
  }

  indexOfWrap($wrap) {
    return this.sessions.findIndex((s) => s.$wrap[0] === $wrap[0]);
  }

  activate(index) {
    this.activeIndex = index;
    this.sessions.forEach((s, i) => s.$wrap.toggleClass('active', i === index));
    this.applyGrid();
    this.renderTabs();
    const session = this.active;
    if (session) {
      setTimeout(() => {
        this.fit(session);
        session.term.focus();
      }, 30);
    }
  }

  get gridMode() {
    return this.layout.mode;
  }
  get zoomed() {
    return this.layout.zoomed;
  }
  /** Đang bung tất cả terminal ra lưới (chưa phóng to ô nào) — lúc này bấm vào ô là zoom */
  get isOverview() {
    return this.layout.mode === 'all' && !this.layout.zoomed;
  }
  setGridMode(mode) {
    this.layout = { ...this.layout, mode, zoomed: false };
    saveLayout(window.localStorage, this.layout);
    this.applyGrid();
  }
  setZoom(on) {
    this.layout = { ...this.layout, zoomed: on };
    saveLayout(window.localStorage, this.layout);
    this.applyGrid();
  }
  toggleAll() {
    if (this.layout.zoomed) return this.setZoom(false);
    if (this.layout.mode === 'all') return this.setGridMode(this.gridModeBeforeAll);
    this.gridModeBeforeAll = this.layout.mode;
    this.setGridMode('all');
  }

  get fullWidth() {
    return this.layout.fullWidth;
  }
  setFullWidth(on) {
    this.layout = { ...this.layout, fullWidth: on };
    saveLayout(window.localStorage, this.layout);
    this.scheduleFit();
  }

  applyGrid() {
    const zoom = this.layout.zoomed;
    const { cols, rows, cells } = zoom
      ? { cols: 1, rows: 1, cells: 1 }
      : gridFor(this.layout.mode, this.sessions.length);
    const shown = new Set(zoom ? [this.activeIndex] : visiblePanes(this.sessions.length, cells, this.activeIndex));
    this.$terms.css({ '--tg-cols': cols, '--tg-rows': rows }).toggleClass('zoomed', zoom).toggleClass('overview', this.isOverview);
    this.sessions.forEach((s, i) => s.$wrap.toggleClass('show', shown.has(i)));
    this.scheduleFit();
    this.onLayout({ mode: this.layout.mode, zoomed: zoom });
  }

  close(index) {
    const session = this.sessions[index];
    if (!session) return;
    // Đóng tab là CHỦ Ý giết phiên — phải nói rõ với server, vì đóng socket suông giờ chỉ
    // được hiểu là "rời dây" (reload) và pty sẽ sống tiếp mà không còn ai gắn vào.
    this.send(session, { type: 'kill' });
    try {
      session.ws && session.ws.close();
    } catch {
      // Socket có thể đã đóng từ phía server — đóng tab vẫn phải tiếp tục dọn dẹp
    }
    try {
      session.term.dispose();
    } catch {
      // xterm.js dispose lỗi hiếm khi xảy ra — không được chặn việc gỡ tab khỏi DOM
    }
    session.$wrap.remove();
    this.sessions.splice(index, 1);
    this.persist();

    if (!this.sessions.length) this.create('term 1');
    else this.activate(Math.max(0, Math.min(this.activeIndex, this.sessions.length - 1)));
  }

  fit(session) {
    if (!session || !session.$wrap.hasClass('show')) return;
    try {
      session.fit.fit();
    } catch {
      return;
    }
    this.send(session, { type: 'resize', cols: session.term.cols, rows: session.term.rows });
    const cols = session.term.cols;
    session.$wrap.find('.pcols').text(cols < READABLE_COLS ? cols + 'c' : '');
  }
  fitVisible() {
    for (const session of this.sessions) this.fit(session);
  }
  /** Kéo splitter bắn onResize liên tục — gộp nhịp, không thì mỗi pane fit hàng chục lần/giây */
  scheduleFit() {
    clearTimeout(this.fitTimer);
    this.fitTimer = setTimeout(() => requestAnimationFrame(() => this.fitVisible()), FIT_DEBOUNCE_MS);
  }

  /**
   * Phát hiện "tab vừa xong việc" để báo cho user đang làm việc khác.
   *
   * ⚠ Đây là HEURISTIC theo IM LẶNG CỦA OUTPUT, không phải exit code của agent: một tab
   * chạy ≥30s rồi im ≥5s thì coi như vừa xong một lượt. Không suy ra "thành công" —
   * agent lỗi cũng im lặng như agent xong. Tooltip/thông báo phải nói đúng như thế.
   */
  watchIdle() {
    setInterval(() => {
      const now = Date.now();
      for (const session of this.sessions) {
        if (session.busySince === null) continue;
        if (now - session.lastOutputAt < IDLE.idleMs) continue;
        const busyMs = session.lastOutputAt - session.busySince;
        session.busySince = null;
        if (busyMs >= IDLE.minBusyMs) this.onIdle({ label: session.label, busySec: Math.round(busyMs / 1000) });
      }
    }, IDLE.tickMs);
  }

  /** Gõ hộ một lệnh vào tab đang mở (kèm Enter) */
  type(command) {
    const session = this.active;
    if (!session) return;
    this.send(session, { type: 'input', data: command + '\r' });
    session.term.focus();
  }
  /**
   * Gõ lệnh nhưng KHÔNG Enter — dùng cho lệnh có hậu quả ra ngoài (commit / push).
   * Console không bao giờ tự chạy những lệnh này: user đọc lại rồi tự bấm Enter.
   */
  typeDraft(command) {
    const session = this.active;
    if (!session) return;
    this.send(session, { type: 'input', data: command });
    session.term.focus();
  }
  sendCtrlC() {
    this.send(this.active, { type: 'input', data: '\x03' });
  }
  clearActive() {
    const session = this.active;
    if (session) {
      session.term.clear();
      session.term.focus();
    }
  }

  renderTabs() {
    const html = this.sessions
      .map(
        (s, i) => `<span class="ttab ${i === this.activeIndex ? 'active' : ''}" data-tab-index="${i}">
          <span class="dot ${s.alive ? 'on' : 'off'}"></span>${s.label}
          ${this.sessions.length > 1 ? `<span class="x" data-close="${i}" title="Đóng tab">${icon('close')}</span>` : ''}
        </span>`
      )
      .join('');
    this.$tabs.html(html);
    for (const s of this.sessions) {
      s.$wrap.find('.pname').text(s.label);
      s.$wrap.find('.phead .dot').attr('class', 'dot ' + (s.alive ? 'on' : 'off'));
    }

    const alive = this.sessions.filter((s) => s.alive).length;
    this.onStatusChange({ alive, total: this.sessions.length });
  }
}
