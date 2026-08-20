#!/usr/bin/env bash
# Dò tự động ĐƯỜNG DẪN root các repo git dùng chung của team, theo REMOTE URL — KHÔNG theo path.
# Vì sao remote: path clone khác nhau mỗi máy (~/VNG/…, ~/Projects/…, ~/git/…) nhưng remote URL
# thì cả team giống hệt (cùng trỏ 1 repo GitLab nội bộ) → là "mỏ neo nhận diện" ổn định, và vẫn
# nhận ra được cả khi member đổi tên thư mục clone.
#
# Output: mỗi dòng "field<TAB>abs_path" cho MỖI clone khớp remote.
#   - 0 dòng cho 1 field  → máy chưa có repo đó (config để null).
#   - đúng 1 dòng         → auto-điền, không hỏi.
#   - >1 dòng             → nhiều clone → skill hỏi chọn 1.
#
# Maintainer thêm repo chung mới: thêm 1 dòng "field|folderName|remoteMatch|appendSubdir" vào REPOS.
# (appendSubdir rỗng = lấy nguyên root; có = nối thêm khi thư mục con tồn tại, vd new-mainsite/templates.)

REPOS=(
  "gtPromotionRoot|gt-promotion-template|gt-promotion/gt-promotion-template|"
  "newMainsiteRoot|new-mainsite|vnggames-mainsite/new-mainsite|templates"
)

detect_one () {  # $1=folderName  $2=remoteMatch  $3=appendSubdir
  local folder="$1" match="$2" sub="$3" cands c
  # 1) Spotlight (macOS) — tức thì qua index sẵn có
  cands=$(mdfind -onlyin "$HOME" "kMDItemFSName == '$folder'" 2>/dev/null)
  # 2) fallback find (Spotlight tắt / không phải macOS)
  [ -z "$cands" ] && cands=$(find "$HOME" -maxdepth 5 -type d -name "$folder" \
                             -not -path '*/node_modules/*' 2>/dev/null)
  while IFS= read -r c; do
    [ -z "$c" ] && continue
    # xác nhận danh tính bằng remote — loại folder trùng tên nhưng không phải repo thật
    if git -C "$c" remote get-url origin 2>/dev/null | grep -q "$match"; then
      if [ -n "$sub" ] && [ -d "$c/$sub" ]; then echo "$c/$sub"; else echo "$c"; fi
    fi
  done <<< "$cands"
}

for entry in "${REPOS[@]}"; do
  IFS='|' read -r field folder match sub <<< "$entry"
  while IFS= read -r path; do
    [ -n "$path" ] && printf '%s\t%s\n' "$field" "$path"
  done <<< "$(detect_one "$folder" "$match" "$sub")"
done
