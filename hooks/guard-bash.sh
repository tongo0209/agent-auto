#!/bin/bash
# PreToolUse hook cho tool Bash — cổng chặn cơ học ở tầng harness.
#
# Vì sao cần: luật trong CLAUDE.md là văn xuôi, agent có thể "quên"; hook thì không.
# Thiết kế cho MÔI TRƯỜNG NÀY (không copy nguyên từ repo khác):
#   - new-mainsite là Symfony: `.env.test` ĐƯỢC commit ⇒ phải đọc được; chỉ `.env`/`.env.*.local` mới là secret.
#   - luồng làm việc để user tự review diff rồi tự push ⇒ mọi thao tác xoá diff chưa commit phải HỎI.
#   - designs/ 5.1GB tải lại rất lâu ⇒ rm nhắm vào đó phải HỎI.
#
# Quyết định: deny = chặn hẳn (hại không hồi được) · ask = bật prompt cho user (việc của con người).
# Không khớp luật nào → im lặng, exit 0 (đường thoát nhanh nhất, ~0 chi phí).
# Self-test: bash ~/.claude/hooks/guard-bash.test.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib-secret-paths.sh"   # nguồn luật secret dùng chung với guard-read.sh

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# Mode của phiên (đo thật 14/8/2026: payload PreToolUse có field permission_mode).
# Cần vì "ask" chỉ bật prompt ở các mode có hỏi; ở bypassPermissions nó có thể bị nuốt —
# luật nào BUỘC phải do người quyết thì ở mode đó phải hạ xuống deny mới còn hiệu lực.
pmode=$(printf '%s' "$input" | jq -r '.permission_mode // ""' 2>/dev/null)

decide() { # $1=deny|ask  $2=mã luật  $3=lý do (không dùng dấu " để JSON khỏi vỡ)
  # Nhật ký: bằng chứng cổng đã bật, độc lập với UI (auto-mode có thể tự duyệt ask mà không prompt).
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$1" "$2" "${pmode:-?}" "$cmd" >> "$HOME/.claude/hooks/guard.log" 2>/dev/null
  # ask + defaultMode "auto" = classifier có thể TỰ DUYỆT, không hiện prompt (đo thật 2026-08-13).
  # Nên mọi quyết định ask kèm systemMessage để user luôn NHÌN THẤY việc nhạy cảm vừa xảy ra.
  if [ "$1" = "ask" ]; then
    printf '{"systemMessage":"[guard-bash %s] %s","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[guard-bash %s] %s"}}\n' "$2" "$3" "$2" "$3"
  else
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"[guard-bash %s] %s"}}\n' "$1" "$2" "$3"
  fi
  exit 0
}

low=$(printf '%s' "$cmd" | tr 'A-Z' 'a-z')

# ---------- DENY: hại không hồi được ----------

# G-RM-1 · xoá gốc hệ thống / home
if [[ $cmd =~ rm[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-{0,2}[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+(/|/\*|~|\$HOME|/Users)([[:space:]]|$|\*) ]] \
   || [[ $low == *"--no-preserve-root"* ]]; then
  decide deny G-RM-1 "rm nham goc he thong hoac home"
fi

# G-NET-1 · tải rồi chạy thẳng (pipe-to-shell)
# Chỉ nguy hiểm khi nội dung tải về ĐƯỢC CHẠY như code. `curl … | python3 -c '<script>'` /
# `-m json.tool` là ĐỌC DỮ LIỆU (nội dung tải về vào stdin, không phải code) — chặn là chặn oan;
# bắt được ca thật 13/8: chính hook này chặn `curl /api/alerts | python3 -c ...` khi tôi đang test.
if [[ $low =~ (curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|d)?sh([[:space:]]|$) ]] \
   || { [[ $low =~ (curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?python[0-9.]* ]] \
        && [[ ! $low =~ python[0-9.]*[[:space:]]+-[cm]([[:space:]]|$) ]]; }; then
  decide deny G-NET-1 "tai script tu internet roi chay thang - phai tai ve doc truoc"
fi

# G-SECRET-1 · đọc/copy secret qua shell (lỗ mà permissions.deny của tool Read không với tới)
# Chỉ xét PHÂN ĐOẠN mà lệnh đầu là verb đọc (7/10: quét cả chuỗi từng chặn oan 161 lần — `| tail` ở đoạn khác,
# heredoc ghi .gitignore, `--env-file`). Ở grep/sed/awk, chuỗi trong quote là pattern chứ không phải path.
file_readers='cat|less|more|head|tail|strings|xxd|base64|cp|scp|rsync|open|dd|source|\.'
pattern_readers='grep|rg|ag|sed|awk'
segments=$(printf '%s\n' "$cmd" | awk '
  heredoc != "" { line = $0; gsub(/^[ \t]+|[ \t]+$/, "", line); if (line == heredoc) heredoc = ""; next }
  {
    if (match($0, /<<-?[ ]*["\047]?[A-Za-z_][A-Za-z_0-9]*/)) { heredoc = substr($0, RSTART, RLENGTH); gsub(/^<<-?[ ]*["\047]?/, "", heredoc) }
    quote = ""
    for (i = 1; i <= length($0); i++) {
      c = substr($0, i, 1)
      if (quote != "") { if (c == quote) quote = ""; printf "%s", c; continue }
      if (c == "\047" || c == "\"") { quote = c; printf "%s", c; continue }
      if (index(";&|()`", c)) { printf "\n"; continue }
      printf "%s", c
    }
    printf "\n"
  }')
while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]*(([A-Za-z_][A-Za-z_0-9]*=[^[:space:]]*|sudo|command|exec|nohup|time)[[:space:]]+)*//')
  verb=${seg%%[[:space:]]*}; verb=${verb##*/}
  if [ "$verb" = xargs ] && [[ $seg =~ [[:space:]]($file_readers)([[:space:]]|$) ]]; then
    is_secret_path "$cmd" && decide deny G-SECRET-1 "doc hoac copy file credential qua xargs - .env.test/.env.example thi duoc, ban nay khong"
  elif [[ $verb =~ ^($file_readers)$ ]]; then
    is_secret_path "$seg" && decide deny G-SECRET-1 "doc hoac copy file credential - .env.test/.env.example thi duoc, ban nay khong"
  elif [[ $verb =~ ^($pattern_readers)$ ]]; then
    is_secret_path "$(printf '%s' "$seg" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")" \
      && decide deny G-SECRET-1 "doc hoac copy file credential - .env.test/.env.example thi duoc, ban nay khong"
  fi
done <<< "$segments"

# G-GIT-1 · force-push vào nhánh chung
if [[ $low =~ git[[:space:]]+push ]] && [[ $low =~ (--force|--mirror|[[:space:]]-f([[:space:]]|$)) ]] \
   && [[ ! $low =~ --force-with-lease ]] \
   && [[ $low =~ (origin[[:space:]]+)?(main|master|dev|develop|staging)([[:space:]]|$|:) ]]; then
  decide deny G-GIT-1 "force-push vao nhanh chung - viec nay khong hoi lai duoc"
fi

# G-GIT-4 · cdn-source có nhiều phiên commit chung 1 worktree (memory repo-dung-chung-nhieu-phien, 7/9 + 21/9):
# --autostash cuốn file đang sửa vào stash rồi không pop; --amend sửa nhầm commit phiên khác vừa chen vào.
cwd=$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null)
while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]*//' | tr 'A-Z' 'a-z')
  [[ $seg == git[[:space:]]* ]] && [[ "$cwd $seg" == *cdn-source* ]] || continue
  if [[ $seg =~ --autostash ]] || [[ $seg =~ [[:space:]]commit[[:space:]].*--amend ]]; then
    decide deny G-GIT-4 "cdn-source nhieu phien commit chung - khong autostash/amend. Commit dung path: git add -- <paths> && git commit --only -m ... -- <paths>, roi git pull --no-rebase --no-edit origin master; sai thi tao commit MOI"
  fi
done <<< "$segments"

# G-DB-1 · xoá cấu trúc dữ liệu (new-mainsite là Symfony/Doctrine nên rủi ro thật)
if [[ $low =~ (drop|truncate)[[:space:]]+(database|table|schema) ]] \
   || [[ $low =~ doctrine:(database|schema):drop ]]; then
  decide deny G-DB-1 "xoa database/table/schema"
fi

# ---------- ASK: việc của con người, không phải của agent ----------

# G-GIT-2 · PUSH (14/8/2026: user gỡ cổng cho `git commit`)
# Vì sao tách commit ra khỏi luật này: commit là việc CÒN SỬA ĐƯỢC (amend/reset/revert, chưa ai
# thấy), hỏi từng lần chỉ tổ ngắt luồng; còn push là bước ĐI RA NGOÀI — người khác pull về,
# CI/CD chạy — nên vẫn phải do người bấm.
# Ở bypassPermissions không còn prompt để mà hỏi ⇒ hạ xuống deny, user tự gõ lệnh.
if [[ $low =~ (^|[[:space:];&|])git[[:space:]]+push([[:space:]]|$) ]]; then
  if [ "$pmode" = "bypassPermissions" ]; then
    decide deny G-GIT-2 "dang o bypassPermissions - khong con prompt de duyet. Ban tu chay lenh push, hoac doi mode neu muon agent lam ho"
  fi
  decide ask G-GIT-2 "push la buoc di ra ngoai - phai do ban duyet tung lan"
fi

# G-GIT-3 · xoá diff chưa commit — cả 3 skill đều để user tự review diff, mất là mất thật
# Ngoại lệ 27/8 (đo guard.log: 85/86 ca ask ở auto-mode là các ca này): restore CHỈ nhắm dist/*
# (output build, `npm run build` sinh lại được) và `restore --staged` (chỉ unstage, không đụng worktree).
g3=""
[[ $low =~ git[[:space:]]+reset[[:space:]]+--hard ]] && g3=1
[[ $low =~ git[[:space:]]+clean[[:space:]]+-[a-z]*f ]] && g3=1
[[ $low =~ git[[:space:]]+stash[[:space:]]+(drop|clear) ]] && g3=1
if [ -z "$g3" ] && { [[ $low =~ git[[:space:]]+checkout[[:space:]]+--[[:space:]] ]] || [[ $low =~ git[[:space:]]+restore[[:space:]]+ ]]; }; then
  while IFS= read -r seg; do
    tail_paths=$(printf '%s' "$seg" | sed -E 's/^git +(checkout +--|restore) +//')
    [[ $tail_paths =~ --staged ]] && [[ ! $tail_paths =~ --worktree ]] && continue
    dist_only=1
    for t in $tail_paths; do
      [[ $t =~ ^[0-9]*[\<\>] ]] && continue
      [[ $t == --* ]] && continue
      [[ $t =~ ^(\./)?dist(/|$) ]] || dist_only=""
    done
    [ -n "$dist_only" ] || g3=1
  done < <(printf '%s' "$low" | grep -oE 'git +(checkout +--|restore) +[^;&|]*')
fi
if [ -n "$g3" ]; then
  decide ask G-GIT-3 "lenh nay xoa thay doi chua commit - ban xac nhan da review diff chua"
fi

# G-DEPLOY-1 · script bàn giao/deploy của repo team (new-mainsite)
if [[ $low =~ (mergedevtomain|commitstaging|create-merge-request)\.sh ]]; then
  decide ask G-DEPLOY-1 "script ban giao/deploy cua repo team - viec cua ban"
fi

# G-DATA-1 · xoá dữ liệu vận hành agent-auto (designs 5.1GB, board, state, metrics)
# 27/8: chỉ xét PHÂN ĐOẠN lệnh chứa rm (hết chặn oan khi designs/ nằm trong lệnh khác cùng chuỗi);
# miễn hỏi 2 đích sinh-lại-được: designs/*/_auto-export/ (psd-cut re-export) và file BÊN TRONG
# .backups/ (rotate giữ-30 là thiết kế) — xoá nguyên thư mục .backups vẫn hỏi.
if [[ $low =~ (^|[[:space:];&|])rm[[:space:]] ]]; then
  gdata=""
  while IFS= read -r seg; do
    [[ $seg =~ (^|[[:space:]])rm[[:space:]] ]] || continue
    part=${seg#*rm }
    part=$(printf '%s' "$part" | sed -E "s#[^[:space:]\"']*_auto-export/[^[:space:]\"']*##g; s#\.backups/[^[:space:]\"']+##g")
    printf '%s' "$part" | grep -qE 'designs/|state\.json|boards/|history/|knowledge/|\.backups' && gdata=1
  done < <(printf '%s\n' "$cmd" | tr ';&|' '\n\n\n')
  if [ -n "$gdata" ]; then
    decide ask G-DATA-1 "xoa du lieu van hanh agent-auto - designs tai lai rat lau"
  fi
fi

exit 0
