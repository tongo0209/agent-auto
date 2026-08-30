#!/usr/bin/env bash
# Chạy toàn bộ test của /video-digest.
set -uo pipefail
cd "$(dirname "$0")"
fail=0
for t in easing vd_probe vd_text vd_motion lens e2e; do
  python3 "$t.test.py" || fail=1
done
exit $fail
