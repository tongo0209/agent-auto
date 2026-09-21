/** Lọc buglist theo mã task / tên — dùng chung server (dựng searchText) và panel (gõ tới đâu lọc tới đó) */
const searchKey = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Gõ `477` · `gw477` · `GW-477` đều phải ra GW-477 ⇒ bỏ gạch/khoảng trắng cả 2 phía rồi mới so */
function filterSheets(sheets, query) {
  const q = searchKey(query);
  if (!q) return sheets;
  const hits = sheets.filter((s) => s.searchText.includes(q));
  return [...hits.filter((s) => s.searchKeys.includes(q)), ...hits.filter((s) => !s.searchKeys.includes(q))];
}

module.exports = { searchKey, filterSheets };
