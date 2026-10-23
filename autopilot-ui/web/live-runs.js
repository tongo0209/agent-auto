// Một EventSource chung cho cả trang: server đẩy danh sách run mỗi khi runs/ đổi
const EVENTS_URL = '/api/autopilot/events';
const RECONNECT_MS = 3000;

const subscribers = new Set();
let source = null;
let reconnect = null;
let lastRuns = null;
let lastStatus = null;

function notify(status) {
  lastStatus = status;
  subscribers.forEach((s) => s.onStatus?.(status));
}

function open() {
  source = new EventSource(EVENTS_URL);
  source.addEventListener('open', () => notify({ online: true, error: null }));
  source.addEventListener('runs', (e) => {
    lastRuns = JSON.parse(e.data);
    subscribers.forEach((s) => s.onRuns(lastRuns));
  });
  // 'error' trùng tên: server gửi thì có data, trình duyệt báo mất kết nối thì không
  source.addEventListener('error', (e) => {
    if (e.data) return notify({ online: true, error: JSON.parse(e.data).message });
    notify({ online: false, error: null });
    // CONNECTING thì trình duyệt tự nối lại; CLOSED (server trả không phải SSE) phải tự mở lại
    if (source.readyState === EventSource.CLOSED) reconnect = setTimeout(open, RECONNECT_MS);
  });
}

export function subscribeRuns(onRuns, onStatus) {
  const subscriber = { onRuns, onStatus };
  subscribers.add(subscriber);
  if (source) {
    if (lastRuns) onRuns(lastRuns);
    if (lastStatus) onStatus?.(lastStatus);
  } else {
    open();
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size) return;
    source.close();
    clearTimeout(reconnect);
    source = lastRuns = lastStatus = null;
  };
}
