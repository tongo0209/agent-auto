import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
SCRIPT = HERE / "img-slice.py"


def run(img, *args):
    out = subprocess.run(
        [sys.executable, str(SCRIPT), str(img), "--json", *args],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


class TestImgSlice(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.img = Path(self.tmp) / "pc.jpg"
        Image.new("RGB", (2000, 5300), "white").save(self.img)

    def test_cat_anh_dai_thanh_nhieu_lat(self):
        res = run(self.img, "--outdir", self.tmp)
        self.assertGreater(len(res["slices"]), 1)
        for s in res["slices"]:
            self.assertTrue(Path(s["file"]).exists())
            self.assertLessEqual(Image.open(s["file"]).width, 900)

    def test_lat_truy_nguoc_dung_toa_do_anh_goc(self):
        res = run(self.img, "--outdir", self.tmp)
        self.assertEqual(res["slices"][0]["yTopSrc"], 0)
        # lát cuối phải phủ tới đáy ảnh gốc (cho sai số làm tròn 2px)
        self.assertGreaterEqual(res["slices"][-1]["yBottomSrc"], 5300 - 2)
        # các lát phải chồng lấn, không được hở
        for a, b in zip(res["slices"], res["slices"][1:]):
            self.assertLess(b["yTopSrc"], a["yBottomSrc"])

    def test_anh_ngan_thi_khong_cat(self):
        short = Path(self.tmp) / "short.jpg"
        Image.new("RGB", (800, 600), "white").save(short)
        res = run(short, "--outdir", self.tmp)
        self.assertEqual(len(res["slices"]), 1)
        self.assertEqual(res["slices"][0]["yTopSrc"], 0)


if __name__ == "__main__":
    unittest.main()
