"""Bộ điều phối: nguồn → digest/ → lens. Xem docs/specs/2026-08-30-video-digest-design.md."""
import argparse
import os
import sys
import vdlib
import vd_ingest
import vd_probe
import vd_sample
import vd_text
import vd_motion
import lens_motion_spec
import lens_bug_list
import lens_step_list
import lens_study_notes

LENSES = {"motion-spec": lens_motion_spec, "bug-list": lens_bug_list,
          "step-list": lens_step_list, "study-notes": lens_study_notes}
DEFAULT_LENS = {"motion": "motion-spec", "screencast": "study-notes",
                "walkthrough": "step-list", "talking": "study-notes"}
OCR_MAX_FRAMES = 150
AGENT_ROOT = os.path.expanduser("~/VNG/agent-auto")


def out_dir(args, slug):
    if args.out:
        return os.path.abspath(args.out)
    leaf = args.key or "_inbox-video"
    return os.path.join(AGENT_ROOT, "designs", leaf, "_auto-video", slug)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="video-digest")
    ap.add_argument("source")
    ap.add_argument("--lens", default="")
    ap.add_argument("--key", default="")
    ap.add_argument("--deep", action="store_true")
    ap.add_argument("--out", default="")
    ap.add_argument("--only", default="")
    args = ap.parse_args(argv)

    src = vd_ingest.ingest(args.source, "/tmp", deep=args.deep)
    slug = vdlib.slugify(src["title"])
    d = out_dir(args, slug)
    os.makedirs(d, exist_ok=True)
    print(f"→ digest: {d}")

    if src.get("subs"):
        rows = [{"t": round(t, 3), "text": text} for t, text in vd_text.subs_to_md(src["subs"])]
        vdlib.csv_dump(os.path.join(d, "text", "subs.csv"), rows, ["t", "text"])
        print(f"  phụ đề: {len(rows)} dòng")

    if not src["path"]:
        digest = {"schema": 1, "slug": slug, "source": src,
                  "media": {"duration": src.get("duration", 0), "w": 0, "h": 0, "fps": 0,
                            "has_audio": True},
                  "signals": {"subs": True, "cut_times": []},
                  "classify": {"guess": "talking", "scores": {}},
                  "chapters": src.get("chapters", [])}
        vdlib.jdump(os.path.join(d, "digest.json"), digest)
        return finish(d, digest, args.lens or "study-notes")

    p = vd_probe.probe(src["path"], has_subs=bool(src.get("subs")))
    guess = p["classify"]["guess"]
    print(f"  loại đoán: {guess} {p['classify']['scores']}")

    lens_names = [x.strip() for x in (args.lens or DEFAULT_LENS[guess]).split(",") if x.strip()]
    dense = "motion-spec" in lens_names
    wants_text = any(n in ("step-list", "bug-list", "study-notes") for n in lens_names)
    frames_dir = os.path.join(d, "frames")
    kept, stride, sample_warn = vd_sample.extract(src["path"], frames_dir,
                                                  dense=dense, fps=p["media"]["fps"])
    frames = vdlib.list_frames(frames_dir)
    vdlib.csv_dump(os.path.join(d, "frames.csv"), kept, ["t", "file"])
    sheets = vd_sample.contact_sheets(frames, os.path.join(d, "sheets"))
    print(f"  frame: {len(kept)} ({'dense' if dense else 'dedupe'}) · sheet: {len(sheets)}")

    warn = None
    if wants_text and vd_text.backend():
        step = max(1, -(-len(frames) // OCR_MAX_FRAMES))
        rows = vd_text.ocr_frames(frames[::step])
        vdlib.csv_dump(os.path.join(d, "text", "onscreen.csv"), rows, ["t", "text"])
        warn = vd_text.gate_ocr(rows, frames)
        snips = vd_text.growth_snippets(rows)
        for i, s in enumerate(snips, 1):
            path = os.path.join(d, "snippets", f"{i:02d}-t{s['t']:.0f}s.txt")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "w").write(s["text"])
        print(f"  OCR: {len(rows)} frame · snippet: {len(snips)}" + (f" · ⚠ {warn}" if warn else ""))

    specs = []
    if dense:
        regions, specs = vd_motion.build(frames_dir, os.path.join(d, "motion"), p["media"]["fps"])
        print(f"  motion: {len(regions)} vùng · {len(specs)} nhịp")

    digest = {"schema": 1, "slug": slug, "source": src, "media": p["media"],
              "signals": p["signals"], "classify": p["classify"],
              "chapters": src.get("chapters", []),
              "sheets": sheets, "warnings": [w for w in (warn, sample_warn) if w],
              "beats": [{"i": i + 1, "t0": s["t0"], "t1": s["t1"], "region": s["region"]}
                        for i, s in enumerate(specs)]}
    vdlib.jdump(os.path.join(d, "digest.json"), digest)
    return finish(d, digest, ",".join(lens_names))


def finish(d, digest, lens_arg):
    os.makedirs(os.path.join(d, "out"), exist_ok=True)
    for name in [x.strip() for x in lens_arg.split(",") if x.strip()]:
        if name not in LENSES:
            raise vdlib.Gate(f"lens không có: {name} (có: {', '.join(LENSES)})")
        path = os.path.join(d, "out", f"{name}.md")
        open(path, "w").write(LENSES[name].render(d))
        print(f"✅ {path}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except vdlib.Gate as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(2)
