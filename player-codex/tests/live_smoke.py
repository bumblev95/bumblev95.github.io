#!/usr/bin/env python3
"""Verify that actual GitHub Pages serves each PLAYER'S CODEX page after a deployment."""
from __future__ import annotations

import re
import sys
import time
import urllib.error
import urllib.request

BASE = "https://bumblev95.github.io"
ROUTES = {
    "/player-codex/": ("en", "Explore games"),
    "/player-codex/ko/": ("ko", "게임 선택"),
    "/player-codex/archeage-chronicles/": ("en", "Guides in development"),
    "/player-codex/archeage-chronicles/ko/": ("ko", "준비 중인 공략"),
    "/player-codex/archeage-chronicles/demo/": ("en", "Seven things to verify"),
    "/player-codex/archeage-chronicles/demo/ko/": ("ko", "데모에서 먼저 확인할"),
}
OTHER = {
    "/player-codex/assets/site.css": "@media",
    "/player-codex/assets/status.js": "data-event-status",
    "/player-codex/sitemap.xml": "/player-codex/archeage-chronicles/demo/ko/",
}
TIMEOUT_SECONDS = 12
RETRIES = 25
DELAY_SECONDS = 8


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "PLAYERs-CODEX-Deployment-Test/1.0"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as resp:
        if resp.status != 200:
            raise AssertionError(f"HTTP {resp.status}: {url}")
        return resp.read().decode("utf-8")


def validate() -> None:
    for path, (lang, phrase) in ROUTES.items():
        content = fetch(BASE + path)
        assert f'<html lang="{lang}">' in content, f"Language mismatch: {path}"
        assert '<main id="main">' in content and '<h1' in content, f"Missing body landmarks: {path}"
        assert f'<link rel="canonical" href="{BASE}{path}">' in content, f"Canonical mismatch: {path}"
        assert phrase in content, f"Missing expected content at {path}: {phrase}"
        print(f"PASS page {path}", flush=True)
    for path, expected in OTHER.items():
        body = fetch(BASE + path)
        assert expected in body, f"Asset missing expected marker: {path}"
        print(f"PASS asset {path}", flush=True)


if __name__ == "__main__":
    for attempt in range(1, RETRIES + 1):
        try:
            validate()
            print(f"PUBLIC DEPLOYMENT OK: {len(ROUTES)} pages, {len(OTHER)} assets", flush=True)
            sys.exit(0)
        except (AssertionError, urllib.error.URLError, UnicodeDecodeError, TimeoutError) as exc:
            print(f"Attempt {attempt}/{RETRIES}: {exc}", flush=True)
            if attempt < RETRIES:
                time.sleep(DELAY_SECONDS)
    sys.exit("Public HTML verification failed after retries")
