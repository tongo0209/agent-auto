#!/usr/bin/env python3
"""Dump cây layer 1 PSD: kind, visible, bbox, blend mode, effects, clipping, mask.

Mục đích: biết TRƯỚC khi bóc là PSD có gì psd-tools render không nổi
(smartobject/shape/adjustment/blend mode lạ/clipping) — chứ không bóc mù rồi tin.

Dùng: psd-tree.py <file.psd> [--max-depth N]
"""
import sys
from psd_tools import PSDImage

path = sys.argv[1]
maxd = 99
if "--max-depth" in sys.argv:
    maxd = int(sys.argv[sys.argv.index("--max-depth") + 1])

psd = PSDImage.open(path)
print(f"# {path}")
print(f"canvas {psd.width}x{psd.height}  mode={psd.color_mode}  layers={len(list(psd.descendants()))}")

STAT = {}


def walk(node, depth=0):
    for lyr in node:
        kind = lyr.kind
        STAT[kind] = STAT.get(kind, 0) + 1
        flags = []
        if not lyr.visible:
            flags.append("HIDDEN")
        bm = str(lyr.blend_mode).split(".")[-1]
        if bm != "NORMAL":
            flags.append(f"blend={bm}")
        if getattr(lyr, "opacity", 255) != 255:
            flags.append(f"op={lyr.opacity}")
        if getattr(lyr, "clipping_layer", False):
            flags.append("CLIP")
        if lyr.has_mask():
            flags.append("mask")
        try:
            if lyr.effects and lyr.effects.enabled:
                fx = [type(e).__name__ for e in lyr.effects if e.enabled]
                if fx:
                    flags.append("fx=" + ",".join(fx))
        except Exception:
            pass
        bbox = lyr.bbox
        size = f"{bbox[0]},{bbox[1]} {bbox[2]-bbox[0]}x{bbox[3]-bbox[1]}"
        txt = ""
        if kind == "type":
            t = (lyr.text or "").replace("\r", " / ").replace("\n", " / ")
            txt = f'  "{t[:60]}"'
        print("  " * depth + f"[{kind}] {lyr.name}  ({size}) {' '.join(flags)}{txt}")
        if lyr.is_group() and depth + 1 < maxd:
            walk(lyr, depth + 1)


walk(psd)
print("\n# tổng theo kind:", STAT)
