#!/usr/bin/env bash
# Sinh bản PUBLIC của repo này sang một repo mới, history trắng.
#
#   bash tools/export-public.sh                    # → ../agent-auto-public
#   bash tools/export-public.sh --out <dir>
#   bash tools/export-public.sh --dry              # chỉ in danh sách + số lần thay, không ghi
#   bash tools/export-public.sh --repo <dir>       # export repo khác (dùng cho test fixture)
#   bash tools/export-public.sh --skip-tests
#
# Luồng: liệt kê file → phân loại theo publish/manifest.txt → copy → áp overrides + extras →
# áp publish/redactions.tsv → cổng publish/denylist.txt → chạy test → git init + 1 commit.
# Làm hết trong thư mục tạm; chỉ mv sang đích khi MỌI cổng pass. Đích đã tồn tại thì dừng,
# script không xoá gì của bạn.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT=""; DRY=0; SKIP_TESTS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out)  OUT="$2"; shift 2 ;;
    --repo) REPO="$(cd "$2" && pwd)"; shift 2 ;;
    --dry)  DRY=1; shift ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    *) echo "Tham số lạ: $1" >&2; exit 2 ;;
  esac
done
[ -n "$OUT" ] || OUT="$(dirname "$REPO")/$(basename "$REPO")-public"
PUB="$REPO/publish"
for f in manifest.txt redactions.tsv denylist.txt; do
  [ -f "$PUB/$f" ] || { echo "❌ thiếu publish/$f" >&2; exit 2; }
done

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "── Phân loại + copy ──"
# Nguồn là tracked + untracked-chưa-ignore: nhờ vậy file mới thêm cũng bị bắt phân loại
# ngay lượt export đầu, không phải chờ commit mới lộ ra.
( cd "$REPO" && git ls-files --cached --others --exclude-standard ) > "$STAGE/all.txt"
python3 - "$REPO" "$PUB/manifest.txt" "$STAGE" <<'PY'
import os, shutil, sys
repo, manifest, stage = sys.argv[1:4]
rules = []
for line in open(manifest, encoding='utf-8'):
    line = line.split('#')[0].strip()
    if not line or line[0] not in '+-':
        continue
    rules.append((line[0], line[1:].strip()))

inc, exc, unknown = [], [], []
for path in open(os.path.join(stage, 'all.txt'), encoding='utf-8').read().splitlines():
    for sign, pat in rules:
        if path == pat or (pat.endswith('/') and path.startswith(pat)):
            (inc if sign == '+' else exc).append(path)
            break
    else:
        unknown.append(path)

if unknown:
    print('❌ %d file chưa được phân loại trong manifest:' % len(unknown))
    for p in unknown[:40]:
        print('   ' + p)
    sys.exit(1)

for path in inc:
    dst = os.path.join(stage, 'out', path)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(os.path.join(repo, path), dst)
print('   vào: %d file · loại: %d file' % (len(inc), len(exc)))
PY

echo "── Overrides ──"
if [ -d "$PUB/overrides" ]; then
  ( cd "$PUB/overrides" && find . -type f -not -name '.DS_Store' ) | sed 's#^\./##' | while read -r rel; do
    [ -n "$rel" ] || continue
    cp "$PUB/overrides/$rel" "$STAGE/out/$rel"
    echo "   thay: $rel"
  done
fi

if [ -d "$PUB/extras" ]; then
  ( cd "$PUB/extras" && find . -type f -not -name '.DS_Store' ) | sed 's#^\./##' | while read -r rel; do
    [ -n "$rel" ] || continue
    mkdir -p "$STAGE/out/$(dirname "$rel")"
    cp "$PUB/extras/$rel" "$STAGE/out/$rel"
    echo "   thêm: $rel"
  done
fi

echo "── Redaction ──"
python3 - "$STAGE/out" "$PUB/redactions.tsv" <<'PY'
import os, re, sys
root, tsv = sys.argv[1:3]
rules = []
for line in open(tsv, encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    parts = line.rstrip('\n').split('\t')
    if len(parts) != 3:
        continue
    rules.append(parts)

hits = {i: 0 for i, _ in enumerate(rules)}
renamed = 0
for dirpath, _dirs, files in os.walk(root):
    for name in files:
        p = os.path.join(dirpath, name)
        try:
            s = open(p, encoding='utf-8').read()
        except (UnicodeDecodeError, ValueError):
            continue
        orig = s
        for i, (mode, pat, rep) in enumerate(rules):
            if mode == 'str':
                n = s.count(pat)
                if n:
                    s = s.replace(pat, rep); hits[i] += n
            else:
                s, n = re.subn(pat, rep, s)
                hits[i] += n
        if s != orig:
            open(p, 'w', encoding='utf-8').write(s)

for dirpath, _dirs, files in os.walk(root):
    for name in files:
        new = name
        for mode, pat, rep in rules:
            if mode == 'str' and pat in new:
                new = new.replace(pat, rep)
        if new != name:
            os.rename(os.path.join(dirpath, name), os.path.join(dirpath, new)); renamed += 1

zero = [rules[i][1] for i, n in hits.items() if n == 0]
print('   thay %d lượt · đổi tên %d file' % (sum(hits.values()), renamed))
if zero:
    print('   ⚠ pattern thay 0 lần (kiểm lại kẻo gõ sai): ' + ' · '.join(zero))
PY

echo "── Cổng denylist ──"
if grep -rIEn --exclude=package-lock.json --exclude-dir=node_modules -f "$PUB/denylist.txt" "$STAGE/out" > "$STAGE/hits.txt" 2>/dev/null; then
  echo "❌ còn $(wc -l < "$STAGE/hits.txt" | tr -d ' ') dòng khớp denylist — KHÔNG sinh commit:"
  sed "s#$STAGE/out/##" "$STAGE/hits.txt" | head -40
  exit 1
fi
echo "   sạch"

if [ "$SKIP_TESTS" = 0 ]; then
  echo "── Test trên bản export ──"
  # console/node_modules không đi theo bản export; mượn tạm của repo nguồn để chạy được test,
  # tháo ra trước khi git init nên không lọt vào commit.
  [ -d "$REPO/console/node_modules" ] && ln -s "$REPO/console/node_modules" "$STAGE/out/console/node_modules"
  ( cd "$STAGE/out" && for t in hooks/*.test.sh; do bash "$t" >/dev/null || { echo "❌ $t FAIL"; exit 1; }; done ) \
    && echo "   hook self-test: pass"
  ( cd "$STAGE/out" && node --test tools/*.test.mjs skills/*/scripts/*.test.mjs >/dev/null 2>&1 ) \
    && echo "   test tools: pass" || { echo "❌ test tools FAIL"; exit 1; }
  if [ -L "$STAGE/out/console/node_modules" ]; then
    ( cd "$STAGE/out/console" && node --test "server/**/*.test.mjs" "src/**/*.test.mjs" >/dev/null 2>&1 ) \
      && echo "   test console: pass" || { echo "❌ test console FAIL"; exit 1; }
    rm "$STAGE/out/console/node_modules"
  else
    echo "   ⚠ bỏ qua test console (repo nguồn chưa npm install)"
  fi
  echo "── install-skills --check trên bản export ──"
  SANDBOX="$STAGE/claude-home"; mkdir -p "$SANDBOX"
  ( cd "$STAGE/out" && CLAUDE_CONFIG_DIR="$SANDBOX" bash tools/install-skills.sh --check ) > "$STAGE/check.log" 2>&1 || true
  grep -q '^Kết quả:' "$STAGE/check.log" && echo "   installer chạy tới cuối" \
    || { echo "❌ installer --check chết giữa đường:"; tail -5 "$STAGE/check.log"; exit 1; }
fi

if [ "$DRY" = 1 ]; then
  echo "── --dry: dừng, không ghi ra $OUT ──"
  ( cd "$STAGE/out" && find . -type f | sed 's#^\./##' | sort | head -50 )
  exit 0
fi

echo "── git init + commit ──"
[ -e "$OUT" ] && { echo "❌ $OUT đã tồn tại — xoá/đổi tên tay rồi chạy lại (script không tự xoá)"; exit 1; }
( cd "$STAGE/out" \
  && git init -q \
  && git add -A \
  && git -c commit.gpgsign=false commit -q -m "Initial public release of agent-auto" )
if ( cd "$STAGE/out" && git log -p -- . ":(exclude)console/package-lock.json" | grep -IEq -f "$PUB/denylist.txt" ); then
  echo "❌ history vẫn khớp denylist — không phát hành"; exit 1
fi
echo "   history sạch"
mv "$STAGE/out" "$OUT"
echo ""
echo "✅ $OUT — $(cd "$OUT" && git ls-files | wc -l | tr -d ' ') file, 1 commit"
