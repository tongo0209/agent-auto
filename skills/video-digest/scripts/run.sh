#!/usr/bin/env bash
# Bóc video thành digest rẻ tiền rồi render lens. Cửa chính của /video-digest.
#
#   bash run.sh <file|url> [--lens motion-spec,bug-list] [--key GW-760] [--deep] [--out DIR]
set -euo pipefail
exec python3 "$(dirname "$0")/vd_run.py" "$@"
