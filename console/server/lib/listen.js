const DEFAULT_TRIES = 10;

/**
 * Listen cổng `port`; nếu cổng đang bị chiếm thì tự nhảy sang cổng kế tiếp
 * (port+1, port+2, ...) tối đa `tries` lần. Console không giữ riêng 1 cổng nào,
 * nên mở nhiều instance hoặc còn process cũ cũng không làm nó sập.
 *
 * @returns {Promise<number>} cổng thật đã listen được
 */
function listenWithFallback(server, { port, host, tries = DEFAULT_TRIES, onBusy } = {}) {
  const first = Number(port);
  const last = first + tries;

  return new Promise((resolve, reject) => {
    let current = first;

    const onError = (err) => {
      if (err.code !== 'EADDRINUSE' || current >= last) {
        cleanup();
        return reject(err);
      }
      if (typeof onBusy === 'function') onBusy(current);
      current += 1;
      server.listen(current, host);
    };

    const onListening = () => {
      cleanup();
      resolve(server.address().port);
    };

    const cleanup = () => {
      server.removeListener('error', onError);
      server.removeListener('listening', onListening);
    };

    server.on('error', onError);
    server.on('listening', onListening);
    server.listen(current, host);
  });
}

module.exports = { listenWithFallback, DEFAULT_TRIES };
