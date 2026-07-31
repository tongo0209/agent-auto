/**
 * Cache TTL trong bộ nhớ — dùng cho git log (`--shortstat` phải diff từng commit,
 * một tháng nặng mất ~5s). Tháng đã qua không bao giờ đổi nên cache dài;
 * tháng hiện tại cache ngắn để commit mới vẫn hiện sau ~1 phút.
 */
const store = new Map();

function get(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/** Lấy từ cache, miss thì gọi producer rồi cache lại */
async function through(key, ttlMs, producer) {
  const cached = get(key);
  if (cached !== null) return { value: cached, cached: true };
  const value = await producer();
  set(key, value, ttlMs);
  return { value, cached: false };
}

function clear() {
  store.clear();
}

module.exports = { get, set, through, clear };
