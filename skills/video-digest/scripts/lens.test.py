"""Test 4 lens trên digest VIẾT TAY. Video gốc cố tình để rác — lens đụng vào là vỡ (G-VD-7)."""
import os
import sys
import json
import shutil
import tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vdlib
import lens_motion_spec
import lens_bug_list
import lens_step_list
import lens_study_notes

FAIL = []


def ok(cond, what):
    if not cond:
        FAIL.append(what)


d = tempfile.mkdtemp(prefix="vdlens-")
try:
    # video.mp4 là RÁC: lens nào mở nó ra decode sẽ chết → chứng minh lens chỉ ăn digest
    open(os.path.join(d, "video.mp4"), "w").write("KHONG PHAI VIDEO")

    vdlib.jdump(os.path.join(d, "digest.json"), {
        "schema": 1, "slug": "clip-thu",
        "source": {"kind": "local", "path": "/tmp/clip.mp4", "url": None},
        "media": {"w": 1920, "h": 1080, "fps": 30, "duration": 12.5, "has_audio": True},
        "signals": {"cut_times": [0.0, 4.2, 9.1], "subs": True},
        "classify": {"guess": "motion", "scores": {"motion": 0.7}},
        "chapters": [{"start": 0, "title": "Mở đầu"}, {"start": 6, "title": "Dựng hiệu ứng"}],
    })
    os.makedirs(os.path.join(d, "motion"))
    json.dump([
        {"region": "r1", "t0": 2.14, "t1": 2.78, "dur_ms": 640, "dur_seen_ms": 480,
         "dx": -320.0, "dy": 0.0, "ease": "easeOutQuint",
         "bezier": "cubic-bezier(0.22,1,0.36,1)", "rmse": 0.004, "unfit": False,
         "scale_from": 80, "scale_to": 80, "lum_from": 131.0, "lum_to": 131.0},
        {"region": "r2", "t0": 2.26, "t1": 2.90, "dur_ms": 640, "dur_seen_ms": 640,
         "dx": 0.0, "dy": -40.0, "ease": None, "bezier": None, "rmse": 0.21, "unfit": True,
         "scale_from": 60, "scale_to": 60, "lum_from": 90.0, "lum_to": 90.0},
    ], open(os.path.join(d, "motion", "specs.json"), "w"))
    vdlib.csv_dump(os.path.join(d, "text", "onscreen.csv"),
                   [{"t": 0.0, "text": "Dashboard\n[New Project]"},
                    {"t": 4.2, "text": "Create project"},
                    {"t": 9.1, "text": "Deploy successful"}], ["t", "text"])
    vdlib.csv_dump(os.path.join(d, "text", "subs.csv"),
                   [{"t": 4.0, "text": "chỗ này nút bị lệch sang phải"},
                    {"t": 9.0, "text": "xong rồi đấy"}], ["t", "text"])
    os.makedirs(os.path.join(d, "frames"))
    for t in (0.0, 4.2, 9.1):
        open(os.path.join(d, "frames", vdlib.frame_name(t)), "w").write("x")
    os.makedirs(os.path.join(d, "snippets"))
    open(os.path.join(d, "snippets", "01-t5s.txt"), "w").write("gsap.to('.a',{x:100})")

    # ── motion-spec: phải ra số thật, và phải GIỮ NGUYÊN cảnh báo unfit ─────────
    m = lens_motion_spec.render(d)
    ok("640ms" in m, "motion-spec phải in thời lượng đã fit")
    ok("cubic-bezier(0.22,1,0.36,1)" in m, "motion-spec phải in bezier của r1")
    ok("power4.out" in m, "motion-spec phải map sang tên GSAP")
    ok("thấy được 480ms" in m, "phải nói rõ thời lượng thấy được khác thời lượng fit")
    ok("unfit" in m.lower() and "r2" in m, "r2 unfit phải bị nêu, không được bịa bezier")
    ok("cubic-bezier(None" not in m and "None" not in m.split("## Không fit")[0],
       "không được rò None ra báo cáo")
    ok("120" in m, "phải tính được stagger 120ms giữa r1 và r2")

    # ── bug-list: gom đúng bằng chứng quanh mốc ────────────────────────────────
    b = lens_bug_list.render(d)
    ok("nút bị lệch sang phải" in b, "bug-list phải kéo lời người quay vào đúng mốc")
    ok("Deploy successful" in b, "bug-list phải kéo chữ trên màn vào đúng mốc")
    ok("frames/t0004.200.png" in b, "bug-list phải trỏ frame chứng")

    # ── step-list: mỗi màn một bước ────────────────────────────────────────────
    s = lens_step_list.render(d)
    ok(s.count("**") >= 3, f"step-list phải ra ≥3 bước, được:\n{s}")
    ok("Dashboard" in s and "Create project" in s, "step-list phải lấy chữ theo màn")

    # ── study-notes: brief phải gọn và chứa đủ 3 nguồn ─────────────────────────
    n = lens_study_notes.render(d)
    ok("Dựng hiệu ứng" in n, "brief phải có chapters")
    ok("gsap.to" in n, "brief phải có snippet code")
    ok("easeOutQuint" not in n or "cubic-bezier" in n, "brief phải có số chuyển động")
    ok(len(n) < 20000, f"brief phải gọn, đang {len(n)} ký tự")

    ok(open(os.path.join(d, "video.mp4")).read() == "KHONG PHAI VIDEO",
       "G-VD-7: không lens nào được ghi đè video gốc")
finally:
    shutil.rmtree(d, ignore_errors=True)

if FAIL:
    print(f"❌ {len(FAIL)} FAIL")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print("✅ lens: pass (4 lens, G-VD-7 ok)")
