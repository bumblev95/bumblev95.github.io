#!/usr/bin/env python3
"""Publish attributed Steam *publisher* announcements for ArcheAge Chronicles.

No unofficial articles, unverified gameplay stats, or full source posts are published.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

APP_ID = 3218230
ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "player-codex" / "archeage-chronicles"
DATA = GAME / "data" / "official-news.json"
ENDPOINT = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?" + urllib.parse.urlencode(
    {"appid": APP_ID, "count": 100, "maxlength": 400}
)
FEED = "steam_community_announcements"
INDEX = f"https://steamcommunity.com/app/{APP_ID}/allnews/"
CANONICAL = "https://bumblev95.github.io/player-codex/archeage-chronicles/"
BEGIN = "<!-- official-news:start -->"
END = "<!-- official-news:end -->"


def fetch():
    req = urllib.request.Request(ENDPOINT, headers={
        "User-Agent": "PlayersCodexOfficialNews/1.0",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError(f"Steam returned HTTP {response.status}")
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError("Steam response too large")
    return json.loads(body.decode("utf-8"))


def excerpt(text):
    text = str(text or "")
    text = re.sub(r"\[img\].*?\[/img\]", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[/?[a-z][^\]]{0,200}\]", " ", text, flags=re.I)
    text = html.unescape(text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > 185:
        text = text[:185].rsplit(" ", 1)[0].strip(" .,;:") + "…"
    return text


def safe_url(value):
    try:
        url = urllib.parse.urlsplit(str(value or ""))
        if url.scheme == "https" and url.hostname in (
            "store.steampowered.com", "steamcommunity.com"
        ) and str(APP_ID) in url.path:
            return urllib.parse.urlunsplit((url.scheme, url.netloc, url.path, "", ""))
        # Steam's official API also emits URLs on its news CDN without the
        # AppID in the path. The caller has already verified the AppID and
        # filtered to the game's developer-only announcement feed.
        if (url.scheme == "https"
                and url.hostname in {"steamstore-a.akamaihd.net", "store.steampowered.com"}
                and re.fullmatch(
                    r"/news/externalpost/steam_community_announcements/[0-9]{6,30}",
                    url.path)):
            return urllib.parse.urlunsplit((url.scheme, url.netloc, url.path, "", ""))
    except ValueError:
        pass
    return INDEX


def parse(payload):
    wrapper = payload.get("appnews")
    if not isinstance(wrapper, dict) or wrapper.get("appid") != APP_ID:
        raise ValueError("Response is not for the expected Steam game")
    source = wrapper.get("newsitems")
    if not isinstance(source, list):
        raise ValueError("Steam response did not include newsitems")
    records, seen = [], set()
    for post in source:
        if not isinstance(post, dict) or str(post.get("feedname", "")).lower() != FEED:
            continue
        gid = str(post.get("gid", "")).strip()
        if not re.fullmatch(r"[0-9]{6,30}", gid) or gid in seen:
            continue
        try:
            published = datetime.fromtimestamp(int(post["date"]), timezone.utc)
        except (ValueError, TypeError, OverflowError, OSError, KeyError):
            continue
        if published.year < 2024 or published > datetime.now(timezone.utc) + timedelta(days=3):
            continue
        title = re.sub(r"\s+", " ", html.unescape(str(post.get("title", "")))).strip()
        if not title or len(title) > 180:
            continue
        records.append({
            "id": gid, "title": title,
            "published_at": published.isoformat().replace("+00:00", "Z"),
            "url": safe_url(post.get("url")),
            "excerpt": excerpt(post.get("contents")),
            "source": "Steam · official publisher announcements",
            "review_status": "official_source_not_gameplay_verified",
        })
        seen.add(gid)
    if not records:
        raise ValueError("No official Steam publisher posts found; preserving existing content")
    return sorted(records, key=lambda x: (x["published_at"], x["id"]), reverse=True)


def load():
    if not DATA.exists():
        return {"game": "archeage-chronicles", "appid": APP_ID, "items": []}
    data = json.loads(DATA.read_text(encoding="utf-8"))
    if data.get("game") != "archeage-chronicles" or data.get("appid") != APP_ID:
        raise ValueError("Saved data belongs to a different game")
    if not isinstance(data.get("items"), list):
        raise ValueError("Malformed saved item list")
    return data


def merge(old, incoming):
    by_id = {i["id"]: i for i in old if isinstance(i, dict) and i.get("id")}
    for item in incoming:
        by_id[item["id"]] = item
    return sorted(by_id.values(), key=lambda i: (i["published_at"], i["id"]), reverse=True)[:80]


def esc(s):
    return html.escape(str(s), quote=True)


def cards(items, ko=False, limit=None):
    if limit is not None:
        items = items[:limit]
    if not items:
        message = ("첫 자동 갱신 후 공식 공지가 여기에 표시됩니다." if ko else
                   "Official posts will appear after the first scheduled synchronization.")
        return f'<p class="official-news-empty">{message} <a href="{INDEX}" target="_blank" rel="noopener noreferrer">Steam ↗</a></p>'
    output = []
    for i in items:
        date = esc(i["published_at"][:10])
        when = esc(i["published_at"])
        link = esc(i["url"])
        snippet = esc(i.get("excerpt", ""))
        output.append(
            f'<article class="official-news-item" data-news-id="{esc(i["id"])}">'
            f'<div class="official-news-meta"><time datetime="{when}">{date}</time>'
            f'<span>STEAM · {("공식 공지" if ko else "OFFICIAL NEWS")}</span></div>'
            f'<h3><a href="{link}" target="_blank" rel="noopener noreferrer">{esc(i["title"])}</a></h3>'
            + (f'<p>{snippet}</p>' if snippet else "")
            + f'<a class="official-news-open" href="{link}" target="_blank" rel="noopener noreferrer">'
            f'{("원문 보기 ↗" if ko else "Read source ↗")}</a></article>'
        )
    return '<div class="official-news-list">' + "".join(output) + "</div>"


def update_landing(path, entries, ko):
    text = path.read_text(encoding="utf-8")
    if text.count(BEGIN) != 1 or text.count(END) != 1:
        raise ValueError(f"Missing news markers: {path}")
    first, last = text.index(BEGIN) + len(BEGIN), text.index(END)
    if last < first:
        raise ValueError("Markers are out of order")
    replace_if_changed(path, text[:first] + cards(entries, ko, limit=3) + text[last:])


def news_page(entries, ko):
    home = (GAME / ("ko/index.html" if ko else "index.html")).read_text(encoding="utf-8")
    nav_match = re.search(r'<header class="topbar">.*?</header>', home, re.S)
    foot_match = re.search(r'<footer class="footer">.*?</footer>', home, re.S)
    if not nav_match or not foot_match:
        raise ValueError("Missing existing game page header or footer")
    nav = nav_match.group()
    nav = re.sub(r'(<a class="lang" href=")[^"]+(")',
                 r'\g<1>/player-codex/archeage-chronicles/news/' +
                 ("" if ko else "ko/") + r'\2', nav, count=1)
    foot = foot_match.group()
    route = CANONICAL + ("news/ko/" if ko else "news/")
    title = ("아키에이지 크로니클 공식 업데이트" if ko else
             "ArcheAge Chronicles Official Updates")
    desc = ("Steam 개발사 발표를 최신순으로 확인하세요. 원문 제목과 출처를 그대로 표시합니다."
            if ko else
            "Chronological news and patch announcements from the official Steam publisher feed.")
    intro = ("Steam 공식 개발사 공지를 자동 수집했습니다. 제목·짧은 발췌문은 원문이며, 게임 내 직접 검증 결과와 구분합니다."
             if ko else
             "Collected from official Steam publisher announcements. Source excerpts are not independently verified gameplay findings.")
    back = ("/player-codex/archeage-chronicles/ko/" if ko else
            "/player-codex/archeage-chronicles/")
    return (
        f'<!doctype html><html lang="{("ko" if ko else "en")}"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{esc(title)} | PLAYER’S CODEX</title>'
        f'<meta name="description" content="{esc(desc)}"><meta name="theme-color" content="#080c16">'
        f'<link rel="canonical" href="{route}">'
        f'<link rel="alternate" hreflang="en" href="{CANONICAL}news/">'
        f'<link rel="alternate" hreflang="ko" href="{CANONICAL}news/ko/">'
        f'<link rel="alternate" hreflang="x-default" href="{CANONICAL}news/">'
        f'<link rel="stylesheet" href="/player-codex/assets/site.css?v=3">'
        '<meta name="google-adsense-account" content="ca-pub-9723666081819297"><script>window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag("consent","default",{ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",analytics_storage:"denied"});</script><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9723666081819297" crossorigin="anonymous"></script></head>'
        f'<body><a class="skip" href="#main">{("본문으로 이동" if ko else "Skip to content")}</a>'
        f'<div class="page">{nav}<main id="main"><section class="game-hero">'
        f'<a class="back" href="{back}">{("← 게임 공략" if ko else "← Game guide")}</a>'
        f'<p class="eyebrow" style="margin-top:35px">OFFICIAL STEAM NEWS</p>'
        f'<h1>{esc(title)}</h1><p class="lede">{esc(intro)}</p>'
        f'<div class="actions"><a class="btn" href="{INDEX}" target="_blank" rel="noopener noreferrer">'
        f'{("Steam 공식 뉴스 ↗" if ko else "Steam official news ↗")}</a></div>'
        f'</section><section class="official-news official-news-archive">'
        f'{cards(entries, ko, limit=40)}</section></main>{foot}</div></body></html>\n'
    )


def replace_if_changed(path, output):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text(encoding="utf-8") != output:
        path.write_text(output, encoding="utf-8")


def publish(items):
    dataset = {
        "game": "archeage-chronicles",
        "appid": APP_ID,
        "source": "Steam ISteamNews/GetNewsForApp/v2 · publisher announcements only",
        "last_post_at": items[0]["published_at"] if items else None,
        "items": items,
    }
    replace_if_changed(DATA, json.dumps(dataset, ensure_ascii=False, indent=2) + "\n")
    for ko in (False, True):
        landing = GAME / ("ko/index.html" if ko else "index.html")
        update_landing(landing, items, ko)
        archive = GAME / ("news/ko/index.html" if ko else "news/index.html")
        replace_if_changed(archive, news_page(items, ko))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--render-only", action="store_true")
    p.add_argument("--fixture", type=Path)
    a = p.parse_args()
    data = load()
    if a.render_only:
        items = data["items"]
    else:
        response = json.loads(a.fixture.read_text(encoding="utf-8")) if a.fixture else fetch()
        items = merge(data["items"], parse(response))
    publish(items)
    print(f"Official publisher news synchronized: {len(items)} items; gameplay guides untouched.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
        print(f"Safe failure; existing website remains unchanged: {exc}", file=sys.stderr)
        sys.exit(1)
