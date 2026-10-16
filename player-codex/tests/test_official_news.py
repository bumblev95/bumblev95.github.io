#!/usr/bin/env python3
"""Untrusted input and static rendering checks. No network used by tests."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import sync_official_news as s


def record(gid="12345678901234567", feed=None, date=1791705600, title="Official Demo Notes"):
    return {
        "gid": gid,
        "feedname": s.FEED if feed is None else feed,
        "date": date,
        "title": title,
        "url": "https://store.steampowered.com/news/app/3218230/view/" + gid,
        "contents": "[b]World[/b] improvements. <script>alert(1)</script>",
    }


class OfficialNewsTests(unittest.TestCase):
    def test_accepts_only_developer_announcements(self):
        payload = {"appnews": {"appid": s.APP_ID, "newsitems": [
            record(), record("22345678901234567", feed="bloggerfeed")
        ]}}
        items = s.parse(payload)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["review_status"], "official_source_not_gameplay_verified")

    def test_wrong_app_and_unofficial_only_rejected(self):
        with self.assertRaises(ValueError):
            s.parse({"appnews": {"appid": 1, "newsitems": [record()]}})
        with self.assertRaises(ValueError):
            s.parse({"appnews": {"appid": s.APP_ID, "newsitems": [record(feed="fan")]}})

    def test_order_deduplicate_and_no_changed_item_churn(self):
        payload = {"appnews": {"appid": s.APP_ID, "newsitems": [
            record(date=1791705600),
            record("22345678901234567", date=1791792000),
            record("22345678901234567", date=1791792000),
        ]}}
        parsed = s.parse(payload)
        self.assertEqual([x["id"] for x in parsed],
                         ["22345678901234567", "12345678901234567"])
        self.assertEqual(s.merge(parsed, parsed), parsed)

    def test_html_sanitization(self):
        entry = s.parse({"appnews": {"appid": s.APP_ID,
                                    "newsitems": [record(title='<img src=x onerror="evil">')]}})[0]
        markup = s.cards([entry], ko=True)
        self.assertIn("&lt;img", markup)
        self.assertNotIn("<script>", markup)
        self.assertNotIn('<img src=', markup)
        self.assertIn('rel="noopener noreferrer"', markup)
        self.assertLessEqual(len(s.excerpt("Word " * 600)), 186)

    def test_rejects_untrusted_urls(self):
        self.assertEqual(s.safe_url("https://malicious.example/3218230"), s.INDEX)
        self.assertEqual(s.safe_url("javascript:alert(1)"), s.INDEX)
        self.assertEqual(s.safe_url("https://steamcommunity.com/app/3218230/allnews/?foo=bar"),
                         s.INDEX)

    def test_output_has_bilingual_static_urls(self):
        news = s.news_page([], ko=True)
        self.assertIn('lang="ko"', news)
        self.assertIn('href="/player-codex/archeage-chronicles/news/"', news)
        self.assertIn('hreflang="en"', news)
        self.assertIn('canonical', news)
        for lang in ("en", "ko"):
            path = s.GAME / ("ko/index.html" if lang == "ko" else "index.html")
            text = path.read_text(encoding="utf-8")
            self.assertEqual(text.count(s.BEGIN), 1)
            self.assertEqual(text.count(s.END), 1)


if __name__ == "__main__":
    unittest.main()
