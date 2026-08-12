/**
 * Kho phiên pty sống LÂU HƠN WebSocket.
 *
 * Vì sao cần: bản đầu giết pty ngay khi socket đóng (`ws.on('close') → term.kill()`), nên
 * reload trang là claude chết giữa chừng — mất cả lượt agent đang chạy. Giờ pty neo theo
 * `sessionId` do client giữ (localStorage), socket chỉ là ĐƯỜNG DÂY nối vào: rời dây thì phiên
 * vẫn chạy, nối lại đúng id thì được phát lại phần output đã lỡ rồi đi tiếp.
 *
 * Toàn bộ IO ngoài (spawn pty, đồng hồ) đều tiêm vào → test được bằng pty giả, không cần
 * dựng WebSocket thật.
 */
function createPtyStore({ spawn, now, ttlMs, bufferBytes }) {
  /** id → { pty, client, buffer, detachedAt } */
  const sessions = new Map();

  const remember = (s, data) => {
    s.buffer += data;
    // Cắt ĐẦU khi quá trần: phần cuối mới là thứ user cần thấy lại sau reload.
    // Cắt giữa chuỗi escape thì xterm bỏ qua đoạn rác đó — chấp nhận được, đổi lại buffer
    // không phình theo phiên chạy cả ngày.
    if (s.buffer.length > bufferBytes) s.buffer = s.buffer.slice(s.buffer.length - bufferBytes);
  };

  const drop = (id) => {
    const s = sessions.get(id);
    if (!s) return;
    try {
      s.pty.kill();
    } catch {
      // pty có thể đã chết sẵn (shell tự thoát) — xoá khỏi map mới là việc phải làm cho xong
    }
    sessions.delete(id);
  };

  return {
    size: () => sessions.size,

    /**
     * Nối client vào phiên `id`, tạo phiên nếu chưa có.
     * @returns {{fresh:boolean, replay:string, error?:string}}
     */
    attach(id, client, { cols, rows }) {
      let s = sessions.get(id);
      const fresh = !s;
      if (!s) {
        let pty;
        try {
          pty = spawn({ cols, rows });
        } catch (err) {
          return { fresh: true, replay: '', error: err.message };
        }
        s = { pty, client: null, buffer: '', detachedAt: null };
        sessions.set(id, s);
        pty.onData((data) => {
          remember(s, data);
          if (s.client) s.client.send({ type: 'output', data });
        });
        pty.onExit(() => {
          if (s.client) s.client.send({ type: 'exit' });
          sessions.delete(id);
        });
      } else {
        // Hai tab trình duyệt cùng gắn 1 phiên thì gõ một nơi hiện hai nơi và cả hai cùng ghi
        // input — client mới đá client cũ ra, phiên luôn có đúng một đường dây.
        s.client = null;
        try {
          s.pty.resize(cols, rows);
        } catch {
          // Cửa sổ mới có thể khai kích thước lạ lúc pty vừa chết — không được chặn attach
        }
      }
      s.client = client;
      s.detachedAt = null;
      return { fresh, replay: s.buffer };
    },

    /** Rời dây (đóng tab trình duyệt / reload) — phiên VẪN chạy, chỉ mất người nhận */
    detach(id) {
      const s = sessions.get(id);
      if (!s) return;
      s.client = null;
      s.detachedAt = now();
    },

    write(id, data) {
      const s = sessions.get(id);
      if (s) s.pty.write(data);
    },

    resize(id, cols, rows) {
      const s = sessions.get(id);
      if (s) s.pty.resize(cols, rows);
    },

    /** User bấm đóng tab terminal — chủ ý giết, khác hẳn reload */
    kill: drop,

    /** Rời dây quá lâu (đóng hẳn trình duyệt rồi quên) thì mới dọn, không thì pty sống mãi */
    sweep() {
      const limit = now() - ttlMs;
      for (const [id, s] of sessions) {
        if (s.detachedAt !== null && s.detachedAt < limit) drop(id);
      }
    },
  };
}

module.exports = { createPtyStore };
