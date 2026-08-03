/* sp-fetch.js — PHÁT LỆNH TẢI hàng loạt file SharePoint qua session browser.
 *
 * Chạy qua: mcp__claude-in-chrome__javascript_tool, trên tab CÙNG origin (đã có session).
 * Nguồn TODO: `node sp-coverage.mjs <manifest> <designDir> --todo` → dán vào mảng TODO.
 *
 * Browser tải nền về ~/Downloads. Script này KHÔNG biết khi nào tải xong (page không thấy
 * download API) — phần "xong chưa" là việc của phía local: poll ~/Downloads rồi chạy
 * sp-collect.mjs + sp-coverage.mjs. ĐỪNG kết luận "đã tải xong" từ output của script này.
 *
 * Chống sót: phát theo lô nhỏ, giãn nhịp. Thiếu thì chạy lại đúng file thiếu (idempotent —
 * TODO luôn sinh lại từ coverage, không tự gõ tay).
 *
 * ⚠ TRẦN CỨNG 45s CỦA CDP (verify thật 3/8/2026): javascript_tool giết script ở 45 giây
 * ("Runtime.evaluate timed out") và các lô CHƯA phát thì mất im lặng — lần đầu chạy 26 file
 * mất 2 file cuối đúng kiểu này. ⇒ mỗi lần gọi chỉ phát ≤ MAX_PER_CALL file, tổng sleep phải
 * < 30s. Chia lô ở phía LOCAL rồi gọi nhiều lần, ĐỪNG nhồi cả TODO dài vào một lần chạy.
 *
 * ⚠ ĐỪNG DỒN QUÁ NHIỀU LUỒNG (verify 3/8): phát 22 lệnh liên tiếp → SharePoint bóp băng thông,
 * 4 file PNG nhỏ **stall đứng yên** hàng chục phút trong khi 4 PSD lớn vẫn chạy. Giữ **≤6 file
 * inflight**: phát 1 lô, đợi `ls ~/Downloads/*.crdownload` về gần 0 rồi mới phát lô sau.
 * Stall thật (size không đổi qua 2 lần đo cách 60s) → xoá `.crdownload` đó rồi phát lại đúng
 * file đó, đừng ngồi chờ (bài học GW-654: treo thì huỷ và bấm lại, chờ vô ích).
 */
const MAX_PER_CALL = 12;
const SITE = "https://vngms-my.sharepoint.com/personal/<owner>_vng_com_vn";
const ROOT = "/personal/<owner>_vng_com_vn/Documents/.../<tên folder design>";
const TODO = [
  // "VN/VN_Sariel_PC.psd",
];
const BATCH = 3;        // số lệnh tải phát cùng lúc
const GAP_MS = 2500;    // nghỉ giữa 2 lô — BATCH/GAP phải giữ tổng thời gian < 30s (trần CDP 45s)

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dl = rel => {
  const src = `${ROOT}/${rel}`;
  const a = document.createElement("a");
  a.href = `${SITE}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(src)}`;
  a.download = "";                       // để SharePoint quyết tên; local nhặt theo mốc thời gian
  document.body.appendChild(a); a.click(); a.remove();
};

if (TODO.length > MAX_PER_CALL) throw new Error(`TODO ${TODO.length} file > MAX_PER_CALL ${MAX_PER_CALL} — chia lô ở phía local, nếu không sẽ mất file cuối vì trần CDP 45s`);

let sent = 0;
for (let i = 0; i < TODO.length; i += BATCH) {
  TODO.slice(i, i + BATCH).forEach(dl);
  sent += Math.min(BATCH, TODO.length - i);
  if (i + BATCH < TODO.length) await sleep(GAP_MS);
}
`đã PHÁT ${sent}/${TODO.length} lệnh tải. Chưa chứng minh xong — verify ở local bằng sp-coverage.mjs`;
