"""Record & publish ONLY real released websites as blog promo media.

This public workflow uses browser pixels, not simulated game footage or
generated financial results. Assets in builtwithbumblevai-media/ are the
reviewable public source for the owner's Built with BumbleV AI articles.
"""
import asyncio
import json
import logging
import math
import shutil
import subprocess
import tempfile
import wave
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "builtwithbumblevai-media"
ROOT_URL = "https://bumblev95.github.io"
AION = ROOT_URL + "/Aion2-Daeva-Atlas/"
SP = ROOT_URL + "/S-P-500-/"
LIVE = {"aion2": AION, "sp500": SP}
W = 720
H = 1280
FPS = 24
TITLE = 1.8
OUTRO = 2.5
SCENES = {
    "aion2": [
        (0, 4, "LIVE AION 2 GUIDE", "공개된 AION 2 가이드"),
        (4, 12, "CHOOSE A CLASS / CHANGE MODE", "직업 선택 · PvP 모드 전환"),
        (12, 24, "PAUSE REAL BOSS GUIDE ANIMATIONS", "보스 패턴 애니메이션 재생·일시정지"),
    ],
    "sp500": [
        (0, 7, "MARKET & SECTOR OVERVIEW", "시장 현황과 섹터 흐름"),
        (7, 13, "SEARCH STOCK INFORMATION", "종목 검색과 분석"),
        (13, 20, "COMPARE RESEARCH CHARTS", "실제 연구 차트 비교"),
        (20, 26, "REVIEW THE METHODOLOGY", "분석 기준과 자료 출처"),
    ],
}


def run(*args):
    subprocess.run(
        ["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error", *map(str, args)],
        check=True, timeout=240,
    )


def font(size, bold=False):
    for family in (
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold
         else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        ("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc" if bold
         else "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if Path(family).exists():
            return ImageFont.truetype(family, size)
    raise RuntimeError("No suitable accessible caption font")


def fit_line(draw, text, max_width, max_size=38, min_size=20):
    for n in range(max_size, min_size-1, -1):
        trial=font(n, True)
        if draw.textbbox((0,0), text, font=trial)[2] <= max_width:
            return trial
    return font(min_size, True)


def card(photo: Image.Image, site: str, language: str, closing=False) -> Image.Image:
    dark = "#111723" if site == "aion2" else "#0a1a21"
    accent = "#b9b1ff" if site == "aion2" else "#96e6c7"
    canvas=Image.new("RGB",(W,H),dark)
    d=ImageDraw.Draw(canvas)
    d.rounded_rectangle((42,42,98,98),radius=8,fill="#f5f5f0")
    d.text((54,51),"b.",font=font(30,True),fill="#305248")
    d.text((119,56),"BUILT WITH BUMBLEV AI",font=font(18,True),fill="#f5f5f0")
    d.rectangle((42,137,W-42,140),fill=accent)
    if site=="aion2":
        title=("PLAYER'S CODEX" if not closing else
               ("Try the real AION 2 guide" if language=="en" else "AION 2 가이드 직접 써보기"))
        kicker="AION 2 / GAME GUIDE" if language=="en" else "AION 2 / 인터랙티브 가이드"
    else:
        title=("S&P 500 DASHBOARD" if not closing else
               ("Explore the live dashboard" if language=="en" else "실제 대시보드 둘러보기"))
        kicker="EDUCATIONAL / MARKET RESEARCH" if language=="en" else "시장 정보 / 교육용 대시보드"
    d.text((42,189),kicker,font=font(20,True),fill=accent)
    d.text((42,244),title,font=fit_line(d,title,W-84,44,24),fill="#fcfcf6")
    desc=(("REAL INTERACTIONS, NO MOCK GAMEPLAY" if language=="en" else
           "실제 공개 사이트 조작 화면") if not closing else
          ("See the full build story on our blog" if language=="en" else
           "제작 과정은 우리 블로그에서"))
    d.text((42,312),desc,font=font(20),fill="#cbd0d1")
    # Real screenshot, visibly framed as a website capture.
    frame=ImageOps.fit(photo,(W-84,590),method=Image.Resampling.LANCZOS,centering=(0.5,0.42))
    canvas.paste(frame,(42,406))
    d=ImageDraw.Draw(canvas)
    d.rounded_rectangle((42,406,W-42,996),radius=8,outline="#a2a9b6",width=2)
    d.rounded_rectangle((42,1030,W-42,1195),radius=18,fill="#202d35")
    d.text((67,1061), "FULL BUILD STORY" if language=="en" else "자세한 제작 과정",
           font=font(20,True),fill=accent)
    d.text((67,1105),"builtwithbumblevai.com",font=font(31,True),fill="#f6f7f0")
    bottom=("Real published-site capture" if language=="en" else "공개된 실제 웹사이트 녹화")
    if site=="sp500":
        bottom=("Educational only · Not financial advice" if language=="en" else
                "교육용 · 투자 권유 아님")
    d.text((42,1235),bottom,font=font(15),fill="#adbab9")
    return canvas


def caption(site: str, language: str, label: str) -> Image.Image:
    accent = "#b9b1ff" if site == "aion2" else "#96e6c7"
    pic=Image.new("RGBA",(W,H),(0,0,0,0))
    d=ImageDraw.Draw(pic)
    d.rounded_rectangle((24,30,W-24,160),radius=14,fill=(5,12,22,232))
    d.text((44,55),"BUILT WITH BUMBLEV AI",font=font(17,True),fill=accent)
    d.text((44,101),label,font=fit_line(d,label,W-90,25,17),fill="#ffffff")
    d.rounded_rectangle((22,H-95,W-22,H-18),radius=12,fill=(5,12,22,235))
    d.text((40,H-72),"builtwithbumblevai.com",font=font(23,True),fill="#ffffff")
    if site=="sp500":
        d.text((40,H-38),"교육용·투자 권유 아님" if language=="ko" else
               "Educational · Not investment advice",font=font(12),fill=accent)
    else:
        d.text((W-179,H-64),"실제 사이트" if language=="ko" else "REAL SITE",
               font=font(12),fill=accent)
    return pic


def ambient(track: Path, seconds: int = 40):
    """Original quiet synthetic pad. No copyrighted music or third-party samples."""
    rate=16000
    with wave.open(str(track),"wb") as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(rate)
        block=bytearray()
        pitches=(196.0,220.0,246.94,174.61)
        for i in range(seconds*rate):
            t=i/rate
            v=math.sin(2*math.pi*pitches[int(t//3)%4]*t)*0.007
            if int(t*2)%8==0:
                u=(t%4)
                v+=math.sin(2*math.pi*523.25*u)*0.014*math.exp(-u*12)
            v*=min(1,t)*min(1,max(0,seconds-t))
            block.extend(int(max(-1,min(1,v))*32767).to_bytes(2,"little",signed=True))
        out.writeframes(block)


async def navigate(page, url: str, css: str, pause_ms=1300):
    response=await page.goto(url,wait_until="domcontentloaded",timeout=60000)
    if not response or not 200<=response.status<300 or page.url.split("/")[2]!="bumblev95.github.io":
        raise RuntimeError("Not a verified public site: "+url)
    await page.locator(css).first.wait_for(state="visible",timeout=25000)
    await page.wait_for_timeout(pause_ms)
    # Analytics opt-in is not requested; dismiss if a visible decline control is present.
    for text in ("Decline", "Reject", "거절", "거부"):
        target=page.get_by_role("button",name=text,exact=True)
        if await target.count() and await target.first.is_visible():
            await target.first.click(timeout=3000)
            break


async def click(page, css: str, pause=900):
    target=page.locator(css).first
    if await target.count() and await target.is_visible():
        await target.click(timeout=12000)
        await page.wait_for_timeout(pause)
        return True
    return False


async def record(browser, site, temp:Path):
    raw=temp/(site+"-capture.webm")
    context=await browser.new_context(viewport={"width":W,"height":H},
                                      record_video_dir=str(temp), record_video_size={"width":W,"height":H},
                                      reduced_motion="no-preference")
    page=await context.new_page()
    try:
        if site=="aion2":
            await navigate(page,AION,"#main",2100)
            await navigate(page,AION+"classes/","[data-explorer]",1300)
            await page.locator("[data-explorer]").scroll_into_view_if_needed()
            assert await click(page,'[data-pick="ranger"]',2000)
            assert await click(page,'[data-mode="pvp"]',1400)
            assert await click(page,'[data-view="practice"]',1200)
            await navigate(page,AION+"dungeons/","[data-boss-lab]",1500)
            await page.locator("[data-boss-lab]").scroll_into_view_if_needed()
            await page.wait_for_timeout(2200)
            await click(page,'[data-boss-choice]:nth-child(2)',2000)
            await click(page,'[data-boss-panel]:not([hidden]) [data-mechanic-choice]:nth-child(2)',1900)
            await page.wait_for_timeout(3000)
        else:
            await navigate(page,SP,"#market-home",3600)
            await page.locator(".hp-picks").scroll_into_view_if_needed()
            await page.wait_for_timeout(1900)
            await navigate(page,SP+"stocks.html","body",1900)
            fields=page.locator('input[type="search"]')
            for n in range(min(await fields.count(),5)):
                if await fields.nth(n).is_visible():
                    await fields.nth(n).fill("NVDA")
                    await page.wait_for_timeout(1500)
                    break
            await navigate(page,SP+"advanced.html",".researchShell",2200)
            await click(page,'button[data-view="compare"]',2600)
            await navigate(page,SP+"methodology.html",".site-prose",2600)
            await page.wait_for_timeout(1200)
    finally:
        await context.close()
        await page.video.save_as(str(raw))
    if raw.stat().st_size<45000:
        raise RuntimeError("Tiny source video: "+site)
    return raw


async def screenshots(browser):
    context=await browser.new_context(viewport={"width":1440,"height":900},device_scale_factor=1)
    page=await context.new_page()
    paths=[
        ("aion2-classes.webp",AION+"classes/","[data-explorer]"),
        ("aion2-boss.webp",AION+"dungeons/","[data-boss-lab]"),
        ("sp500-home.webp",SP,"#market-home"),
        ("sp500-research.webp",SP+"advanced.html",".researchShell"),
    ]
    try:
        for name,url,css in paths:
            await navigate(page,url,css,2600)
            if name=="sp500-research.webp":
                await click(page,'button[data-view="compare"]',1500)
            shot=DEST/name
            await page.screenshot(path=str(shot.with_suffix(".png")),animations="disabled")
            source=Image.open(shot.with_suffix(".png")).convert("RGB")
            source.save(shot,format="WEBP",quality=86,method=5)
            shot.with_suffix(".png").unlink()
            if shot.stat().st_size<9000:
                raise RuntimeError("Tiny screenshot: "+name)
            logging.info("Screenshot %s %s",name,shot.stat().st_size)
    finally:
        await context.close()


def render_video(original:Path,site:str,lang:str,photo:Image.Image,temp:Path):
    intro=temp/(site+"-"+lang+"-intro.png")
    outro=temp/(site+"-"+lang+"-outro.png")
    card(photo,site,lang).save(intro)
    card(photo,site,lang,True).save(outro)
    name=(("aion2-guide" if site=="aion2" else "sp500-dashboard")+"-"+lang)
    segments=[]
    for kind,picture,duration in (("opening",intro,TITLE),("closing",outro,OUTRO)):
        vid=temp/(name+"-"+kind+".mp4")
        run("-loop","1","-framerate",FPS,"-i",picture,"-t",duration,
            "-vf","format=yuv420p,fade=t=in:st=0:d=0.15",
            "-c:v","libx264","-preset","ultrafast","-crf","26","-r",FPS,vid)
        segments.append(vid)
    overlays=[]
    for n,(_,_,english,korean) in enumerate(SCENES[site]):
        path=temp/(name+"-overlay-"+str(n)+".png")
        caption(site,lang,english if lang=="en" else korean).save(path)
        overlays.append(path)
    inputs=["-i",str(original)]
    filters=["[0:v]fps="+str(FPS)+",scale="+str(W)+":"+str(H)+",format=yuv420p[v0]"]
    label="v0"
    for n,(start,end,*_) in enumerate(SCENES[site]):
        inputs.extend(["-loop","1","-i",str(overlays[n])])
        filters.append("["+str(n+1)+":v]format=rgba[o"+str(n)+"]")
        new_label="v"+str(n+1)
        filters.append("["+label+"][o"+str(n)+"]overlay=0:0:enable='between(t,"+str(start)+","+str(end)+")':format=auto["+new_label+"]")
        label=new_label
    duration=24 if site=="aion2" else 26
    filters.append("["+label+"]format=yuv420p[final]")
    mid=temp/(name+"-middle.mp4")
    run(*inputs,"-filter_complex",";".join(filters),"-map","[final]",
        "-t",duration,"-r",FPS,"-c:v","libx264","-preset","ultrafast","-crf","26",mid)
    playlist=temp/(name+"-playlist.txt")
    playlist.write_text("\n".join(["file '"+str(x.resolve())+"'" for x in (segments[0],mid,segments[1])])+"\n",encoding="utf-8")
    joined=temp/(name+"-concat.mp4")
    run("-f","concat","-safe","0","-i",playlist,"-c","copy",joined)
    result=DEST/(name+".mp4")
    audio=temp/"ambient.wav"
    run("-i",joined,"-i",audio,"-map","0:v:0","-map","1:a:0",
        "-c:v","copy","-c:a","aac","-b:a","96k","-shortest",
        "-movflags","+faststart",result)
    if result.stat().st_size<100000:
        raise RuntimeError("Tiny final video: "+name)
    card(photo,site,lang).resize((360,640)).save(DEST/(name+"-poster.webp"),"WEBP",quality=85)
    logging.info("Final media %s %s",name,result.stat().st_size)


async def main():
    logging.basicConfig(level=logging.INFO,format="%(levelname)s %(message)s")
    DEST.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="bumblev-media-") as working:
        temp=Path(working)
        ambient(temp/"ambient.wav")
        async with async_playwright() as pw:
            browser=await pw.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
            try:
                await screenshots(browser)
                for site in ("aion2","sp500"):
                    raw=await record(browser,site,temp)
                    photo=Image.open(DEST/("aion2-classes.webp" if site=="aion2" else "sp500-home.webp")).convert("RGB")
                    for lang in ("en","ko"):
                        render_video(raw,site,lang,photo,temp)
            finally:
                await browser.close()
    assets=sorted([{"name":p.name,"size":p.stat().st_size} for p in DEST.iterdir() if p.is_file()],key=lambda x:x["name"])
    manifest={
        "generated_at":datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "capture_method":"Playwright Chromium recordings of real published owner websites",
        "sources":LIVE,
        "note":"AION2 boss figures are explanatory animations, not live game combat. Market analysis is educational, not advice.",
        "assets":assets,
    }
    (DEST/"manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    assert sum(name.endswith(".mp4") for name in (x["name"] for x in assets))==4
    assert sum(name.endswith(".webp") for name in (x["name"] for x in assets))==8
    logging.info("Finished %s public media assets",len(assets))


if __name__=="__main__":
    asyncio.run(main())
