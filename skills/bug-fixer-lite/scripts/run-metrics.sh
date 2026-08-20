#!/usr/bin/env bash
# run-metrics.sh <start_epoch> — Báo ⏱ thời gian + 🪙 token tiêu hao của MỘT lượt chạy skill,
# KÈM phân rã PER-STAGE (manager / analyst / developer / checker) để định vị điểm nghẽn.
#
#   B0 (lúc bắt đầu):   RUN_START=$(date +%s)        # lưu mốc vào bug-board/state
#   Báo cáo cuối:       scripts/run-metrics.sh $RUN_START
#
# Cách đo: đọc transcript jsonl phiên hiện tại (mới nhất trong ~/.claude/projects/*/) + MỌI file
# subagent của phiên đó (~/.claude/projects/<proj>/<sessionId>/**/*.jsonl — định dạng Claude Code
# hiện tại tách mỗi subagent 1 file có `agentId`+`usage`). Cộng dồn field `usage` của message có
# timestamp >= start_epoch, khử trùng theo `uuid`. Mỗi subagent được PHÂN LOẠI STAGE theo prompt
# đầu tiên của nó (analyst/developer/checker) để quy thời gian+token+số-tool-call về từng chặng.
# (Phiên Claude Code CŨ inline sidechain vào transcript chính, không tách file → phần per-stage
#  chỉ hiện main-loop; tổng vẫn đúng. Con số ~ best-effort: dòng cuối có thể chưa flush.)
set -euo pipefail
START="${1:?Cách dùng: run-metrics.sh <start_epoch lấy từ date +%s lúc bắt đầu>}"
NOW=$(date +%s)
EL=$((NOW - START))
printf '⏱ Thời gian: %dm%02ds (tổng wall-clock; tách phần chờ user nếu có)\n' $((EL/60)) $((EL%60))

# Chốt transcript theo ĐÚNG session hiện tại (env Claude Code) — `ls -t` toàn cục hay chọn NHẦM
# phiên khác vừa được ghi (dẫn tới đo ra "0 subagent" + mất bảng per-stage). Fallback `ls -t` nếu thiếu env.
TS=""
if [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  TS=$(ls -t "$HOME"/.claude/projects/*/"$CLAUDE_CODE_SESSION_ID".jsonl 2>/dev/null | head -1 || true)
fi
[ -n "${TS:-}" ] || TS=$(ls -t "$HOME"/.claude/projects/*/*.jsonl 2>/dev/null | head -1 || true)
if [ -z "${TS:-}" ]; then echo "🪙 Token: không tìm thấy transcript để đo"; exit 0; fi

PY="$(command -v python3 || command -v python || command -v py || true)"
[ -n "$PY" ] || { echo "🪙 Token: thiếu Python để đo (cần python3/python/py trên PATH)"; exit 0; }
"$PY" - "$TS" "$START" <<'PY'
import json, sys, os, glob, datetime, collections

MAIN, START = sys.argv[1], int(sys.argv[2])

def epoch(t):
    try: return datetime.datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp()
    except Exception: return None

def text_of(d):
    m = d.get("message", {}) or {}
    c = m.get("content")
    if isinstance(c, str): return c
    if isinstance(c, list):
        return " ".join(x.get("text", "") for x in c if isinstance(x, dict) and x.get("type") == "text")
    return ""

def toolcalls(d):
    c = (d.get("message", {}) or {}).get("content")
    return sum(1 for x in c if isinstance(x, dict) and x.get("type") == "tool_use") if isinstance(c, list) else 0

# Phân loại stage theo prompt đầu của subagent. THỨ TỰ QUAN TRỌNG: bối cảnh workflow/audit
# check TRƯỚC (prompt của nó có thể NHẮC TÊN agent bug-fixer), rồi tới marker riêng từng chặng.
def classify(prompt):
    p = (prompt or "").lower()
    if any(s in p for s in ["== lát:", "ban tim reference", "kiểm chứng giả thuyết", "dựng flow", "audit:", "adversarially verify"]):
        return "workflow"
    # KHÔNG dùng "tiêu chí verify" cho checker — prompt ANALYST cũng chứa nó (analyst GHI tiêu chí
    # verify) → sẽ nhầm analyst thành checker. Checker nhận qua marker riêng của nó:
    if any(s in p for s in ["verify lượt", "chuẩn so sánh", "check report", "kiểm tra code so"]):
        return "checker"
    # bug-fixer-lite: lane agent gộp điều-tra+fix (prompt "… — lane <N>: …" / "— SYNC lane: …").
    # KHÔNG khớp marker analyst/developer của skill bug-fixer full → trước đây rơi hết vào
    # "other-agent" làm bảng per-stage vô dụng với lite (đo thật 2026-07-22).
    if any(s in p for s in ["— lane", "lane:", "partial board", "nơi cần đáp fix"]):
        return "lane (lite)"
    if any(s in p for s in ["— lượt", "chỉ fix các bug", "fix theo diff", "dev report"]):
        return "developer"
    if any(s in p for s in ["phân tích đợt bug", "điều tra từng bug", "nhận định có đúng", "phân tích bug"]):
        return "analyst"
    return "other-agent"

# Gom file: transcript chính + toàn bộ subagent của CHÍNH phiên đó (thư mục <sessionId>/).
proj = os.path.dirname(MAIN)
sid = os.path.basename(MAIN)[:-6]
files = [MAIN]
subroot = os.path.join(proj, sid)
if os.path.isdir(subroot):
    # subagent workflow ghi *.jsonl (subagents/**); Agent-tool background ghi *.output (tasks/**)
    files += glob.glob(os.path.join(subroot, "**", "*.jsonl"), recursive=True)
    files += glob.glob(os.path.join(subroot, "**", "*.output"), recursive=True)

seen = set(); rows = []
for f in files:
    try: fh = open(f, encoding="utf-8", errors="ignore")
    except Exception: continue
    for line in fh:
        line = line.strip()
        if not line: continue
        try: d = json.loads(line)
        except Exception: continue
        u = d.get("uuid")
        if u and u in seen: continue
        if u: seen.add(u)
        rows.append(d)

# Prompt đầu (user) của mỗi agentId — để phân loại stage.
first_prompt = {}
for d in rows:
    aid = d.get("agentId")
    if aid and d.get("type") == "user" and aid not in first_prompt:
        t = text_of(d)
        if t.strip(): first_prompt[aid] = t

# Gom theo agent (main-loop = không sidechain + không agentId).
buckets = collections.defaultdict(lambda: dict(o=0, inew=0, cr=0, turns=0, tools=0, tmin=None, tmax=None, reads=[], env=0))
tot_o = tot_inew = tot_cr = tot_turns = tot_sub = 0
for d in rows:
    ts = d.get("timestamp"); ep = epoch(ts) if ts else None
    if ep is not None and ep < START: continue
    aid = d.get("agentId")
    key = "main" if (not d.get("isSidechain") and not aid) else "agent:" + str(aid)
    b = buckets[key]
    if ep is not None:
        b["tmin"] = ep if b["tmin"] is None else min(b["tmin"], ep)
        b["tmax"] = ep if b["tmax"] is None else max(b["tmax"], ep)
    cblocks = (d.get("message", {}) or {}).get("content")
    if isinstance(cblocks, list):
        for x in cblocks:
            if isinstance(x, dict) and x.get("type") == "tool_use":
                b["tools"] += 1
                nm = x.get("name"); xi = x.get("input", {}) or {}
                if nm == "Read" and xi.get("file_path"):
                    b["reads"].append(xi["file_path"])
                elif nm == "Bash" and any(kw in str(xi.get("command", "")) for kw in ("node_modules", "ln -s", "node -v", "npm -v", "npm ci", "npm install")):
                    b["env"] += 1
    u = (d.get("message", {}) or {}).get("usage") or d.get("usage")
    if u:
        b["turns"] += 1
        o = u.get("output_tokens", 0) or 0
        inew = (u.get("input_tokens", 0) or 0) + (u.get("cache_creation_input_tokens", 0) or 0)
        cr = u.get("cache_read_input_tokens", 0) or 0
        b["o"] += o; b["inew"] += inew; b["cr"] += cr
        tot_o += o; tot_inew += inew; tot_cr += cr; tot_turns += 1
        if key != "main": tot_sub += 1

k = lambda x: f"{x/1000:.0f}k" if x >= 1000 else str(x)
sp = lambda s: (f"{int(s//60)}m{int(s%60):02d}s" if s else "-")

# "Tiêu hao thật" = out (sinh ra) + in mới (input + cache-write); cache-read chỉ đọc lại context (rẻ ~10%).
print(f"🪙 Token: out {k(tot_o)} (sinh ra) · in-mới {k(tot_inew)} (nạp context) · cache-read {k(tot_cr)} (đọc lại, rẻ)")
print(f"   ↳ {tot_turns} lượt model, trong đó {tot_sub} lượt subagent. (USD chính xác: chạy headless --output-format json → total_cost_usd)")

# Phân rã per-stage.
stage = collections.defaultdict(lambda: dict(o=0, inew=0, turns=0, tools=0, agents=0, maxtools=0, maxspan=0.0, maxrr=0, maxenv=0))
for key, b in buckets.items():
    if b["turns"] == 0 and b["tools"] == 0: continue
    if key == "main":
        st = "main-loop (manager)"
    else:
        st = classify(first_prompt.get(key[6:], ""))
    s = stage[st]
    s["o"] += b["o"]; s["inew"] += b["inew"]; s["turns"] += b["turns"]; s["tools"] += b["tools"]
    span = (b["tmax"] - b["tmin"]) if (b["tmin"] is not None and b["tmax"] is not None) else 0.0
    if key != "main":
        s["agents"] += 1
        s["maxtools"] = max(s["maxtools"], b["tools"])
        s["maxspan"] = max(s["maxspan"], span)
        rr = sum(1 for _, cnt in collections.Counter(b["reads"]).items() if cnt > 1)  # số file đọc >1 lần
        s["maxrr"] = max(s["maxrr"], rr)
        s["maxenv"] = max(s["maxenv"], b["env"])

order = ["main-loop (manager)", "analyst", "developer", "lane (lite)", "checker", "workflow", "other-agent"]
present = [x for x in order if x in stage]
if len(present) > 1 or (present and present[0] != "main-loop (manager)"):
    print("   ── per-stage (out · in-mới · turns · tools · #agent · maxtool · reread · envhunt · maxspan) ──")
    for st in present:
        s = stage[st]
        ag = f"{s['agents']}ag" if s["agents"] else "  ·"
        mt = f"{s['maxtools']}t" if s["maxtools"] else "·"
        rr = f"{s['maxrr']}rr" if s["maxrr"] else "·"
        ev = f"{s['maxenv']}env" if s["maxenv"] else "·"
        print(f"   {st:<20} out {k(s['o']):>6} · in {k(s['inew']):>6} · {s['turns']:>3}tn · {s['tools']:>3}tc · {ag:>4} · {mt:>4} · {rr:>4} · {ev:>5} · {sp(s['maxspan']):>6}")
    print("   (maxspan/maxtool cao = flail/ứng-biến; reread = file đọc-lại >1 lần (nghi thừa); envhunt = Bash dò node_modules/npm/symlink (ma sát môi trường))")
PY
