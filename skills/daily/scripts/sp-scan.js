/* sp-scan.js — QUÉT ĐỆ QUY folder SharePoint → tải manifest NGUỒN xuống ~/Downloads.
 *
 * Chạy qua: mcp__claude-in-chrome__javascript_tool trên 1 tab thuộc CÙNG origin SharePoint
 * (navigate tab tới bất kỳ URL `https://<tenant>/personal/<owner>/_api/...` trước cho chắc session).
 *
 * VÌ SAO PHẢI CÓ SCRIPT NÀY (đọc kỹ trước khi bỏ qua):
 *   REST `/Files` CHỈ trả file ở ĐÚNG 1 CẤP. Folder design của designer gần như luôn có subfolder
 *   (VN/EN/TH/Fonts/PSD). Gọi `/Files` ở gốc → RỖNG hoặc thiếu → tưởng folder ít file rồi tải sót.
 *   Đã trả giá 2 lần: GW-477 (sót 48 PNG state) và GW-556 (tải 8/56 file = 1.28%).
 *
 * Sửa 3 hằng dưới rồi dán nguyên file. Kết quả: ~/Downloads/sp-manifest-<KEY>.json
 * Output tool trả về chỉ 1 dòng tóm tắt — KHÔNG nhồi listing qua context (bị cắt ~1KB).
 */
const KEY  = "GW-xxx";
const SITE = "https://vngms-my.sharepoint.com/personal/<owner>_vng_com_vn";
const ROOT = "/personal/<owner>_vng_com_vn/Documents/.../<tên folder design>";

const enc = p => encodeURIComponent(p).replace(/'/g, "''");

async function api(path, kind, sel) {
  const url = `${SITE}/_api/web/GetFolderByServerRelativeUrl('${enc(path)}')/${kind}?$select=${sel}`;
  const r = await fetch(url, { headers: { Accept: "application/json;odata=nometadata" }, credentials: "include" });
  if (!r.ok) throw new Error(`${kind} ${r.status} @ ${path}`);
  return (await r.json()).value;
}

/* Quét theo TẦNG, mỗi tầng gọi SONG SONG (Promise.all).
 * Tuần tự thì cây 5-6 folder đã chạm trần 45s của CDP — đã timeout thật với folder GW-477. */
const files = [], errors = [];
async function level(paths, depth) {
  if (!paths.length || depth > 5) return;
  const res = await Promise.all(paths.map(async p => {
    try {
      const [fs, ds] = await Promise.all([api(p, "Files", "Name,Length,TimeLastModified"), api(p, "Folders", "Name")]);
      for (const f of fs)
        files.push({ rel: (p.slice(ROOT.length + 1) + "/" + f.Name).replace(/^\//, ""), length: +f.Length, modified: f.TimeLastModified });
      return ds.filter(d => d.Name !== "Forms" && !d.Name.startsWith("_")).map(d => p + "/" + d.Name);
    } catch (e) { errors.push(`${p}: ${e.message}`); return []; }
  }));
  await level(res.flat(), depth + 1);
}

await level([ROOT], 0);
files.sort((a, b) => a.rel.localeCompare(b.rel));

const man = {
  key: KEY, site: SITE, root: ROOT,
  scannedAt: new Date().toISOString(),
  count: files.length,
  totalBytes: files.reduce((s, f) => s + f.length, 0),
  errors, files,
};

const a = document.createElement("a");
a.href = URL.createObjectURL(new Blob([JSON.stringify(man, null, 2)], { type: "application/json" }));
a.download = `sp-manifest-${KEY}.json`;
document.body.appendChild(a); a.click(); a.remove();

`OK ${man.count} file / ${man.totalBytes} byte / ${errors.length} lỗi -> ~/Downloads/sp-manifest-${KEY}.json`;
