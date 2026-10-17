"""AdSense code and publisher/root ads.txt consistency checks (no ad requests)."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
PUB = "ca-pub-9723666081819297"
SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + PUB

class AdSenseSetupTests(unittest.TestCase):
    def test_editorial_pages_have_one_snippet_and_privacy_link(self):
        for path in ["index.html", "ko/index.html", "archeage-chronicles/index.html", "archeage-chronicles/ko/index.html", "archeage-chronicles/news/index.html", "archeage-chronicles/news/ko/index.html"]:
            body = (ROOT / path).read_text()
            with self.subTest(path=path):
                self.assertEqual(body.count(SCRIPT), 1)
                self.assertEqual(body.count('name="google-adsense-account"'), 1)
                self.assertIn('/player-codex/privacy/', body)
                self.assertLess(body.index('ad_storage:"denied"'), body.index(SCRIPT))

    def test_no_auto_ads_on_demos_or_privacy(self):
        for path in ["archeage-chronicles/demo/index.html", "archeage-chronicles/demo/ko/index.html", "privacy/index.html", "privacy/ko/index.html"]:
            with self.subTest(path=path):
                self.assertNotIn(SCRIPT, (ROOT / path).read_text())

    def test_domain_root_seller_file_matches_publisher(self):
        row = (ROOT.parent / "ads.txt").read_text().strip()
        self.assertEqual(row, "google.com, " + PUB.removeprefix("ca-") + ", DIRECT, f08c47fec0942fa0")

if __name__ == "__main__":
    unittest.main()
