import $ from 'jquery';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { icon } from '@core/icons';
import { IDLE } from '@core/constants.mjs';
import { loadTabs, saveTabs, newSessionId } from '@terminal/sessionStore.mjs';

const THEME = {
  background: '#0A100F',
  foreground: '#E6EFEC',
  cursor: '#3ACDB9',
  selectionBackground: '#2A4C46',
};
const RECONNECT_MS = 2000;

/**
 * Quản lý NHIỀU tab terminal, mỗi tab = 1 pty thật qua WebSocket.
 * Cho phép chạy song song: tab code, tab bug-fixer-lite, tab shell tự do.
 */
export class TerminalManager {
  constructor({ termsSelector, tabsSelector, onStatusChange, onIdle }) {
    this.$terms = $(termsSelector);
    this.$tabs = $(tabsSelector);
    this.onStatusChange = onStatusChange || (() => {});
    this.onIdle = onIdle || (() => {});
    this.sessions = [];
    this.activeIndex = -1;
    this.watchIdle();

    this.$tabs.on('click', '[data-close]', (e) => {
      e.stopPropagation();
      this.close(Number($(e.currentTarget).data('close')));
    });
    this.$tabs.on('click', '[data-tab-index]', (e) => this.activate(Number($(e.currentTarget).data('tab-index'))));
    $(window).on('resize', () => this.fitActive());
  }

  /**
   * Dựng lại các tab của lần chạy trước rồi nối vào ĐÚNG phiên pty cũ (id lưu trong
   * localStorage, phiên sống ở server — xem server/lib/ptyStore.js). Nhờ vậy reload trang
   * không giết claude đang chạy. Chưa có gì lưu → mở 1 tab mới như trước.
   */
  restore() {
    const saved = loadTabs(window.localStorage);
    if (!saved.length) return this.create('term 1');
    for (const t of saved) this.create(t.label || 'term', t.id);
    this.activate(0);
  }

  create(label, id) {
    const $wrap = $('<div class="tw"></div>').appendTo(this.$terms);
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 8000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open($wrap[0]);

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
    this.connect(session);
    this.activate(this.sessions.length - 1);
    return session;
  }

  persist() {
    saveTabs(window.localStorage, this.sessions);
  }

  connect(session) {
    // `?id=` là thứ làm nên việc nối lại: cùng id → server trả về đúng pty cũ + phát lại phần
    // output đã lỡ, thay vì spawn shell mới.
    const ws = new WebSocket(`ws://${location.host}/term?id=${encodeURIComponent(session.id)}`);
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

  activate(index) {
    this.activeIndex = index;
    this.sessions.forEach((s, i) => s.$wrap.toggleClass('active', i === index));
    this.renderTabs();
    const session = this.active;
    if (session) {
      setTimeout(() => {
        this.fit(session);
        session.term.focus();
      }, 30);
    }
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
    if (!session || !session.$wrap.hasClass('active')) return;
    try {
      session.fit.fit();
    } catch {
      return;
    }
    this.send(session, { type: 'resize', cols: session.term.cols, rows: session.term.rows });
  }
  fitActive() {
    this.fit(this.active);
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

    const alive = this.sessions.filter((s) => s.alive).length;
    this.onStatusChange({ alive, total: this.sessions.length });
  }
}
