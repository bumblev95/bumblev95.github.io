import {strict as assert} from 'node:assert';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const origin='http://127.0.0.1:8765';
const routes=[
  '/player-codex/',
  '/player-codex/ko/',
  '/player-codex/archeage-chronicles/',
  '/player-codex/archeage-chronicles/ko/',
  '/player-codex/archeage-chronicles/demo/',
  '/player-codex/archeage-chronicles/demo/ko/',
  '/player-codex/archeage-chronicles/news/',
  '/player-codex/archeage-chronicles/news/ko/'
];
let server;
let browser;
try{
  for(const route of routes){
    const file=path.join(root,route,'index.html');
    assert(existsSync(file), 'Missing '+file);
    const html=readFileSync(file,'utf8');
    assert.equal((html.match(/<h1\b/g)||[]).length,1, 'One H1: '+route);
    assert(html.includes('rel="canonical"'), 'Canonical: '+route);
    assert(html.includes('hreflang="ko"') && html.includes('hreflang="en"'), 'Bilingual hreflang: '+route);
    assert(html.includes('<main id="main">'), 'Main landmark: '+route);
    if(route.includes('/archeage-chronicles/') && !route.includes('/demo/') && !route.includes('/news/')) {
      assert(html.includes('<!-- official-news:start -->') && html.includes('<!-- official-news:end -->'),'Safe news markers missing: '+route);
      assert(html.includes('id="official-updates"'),'Latest official updates block missing: '+route);
    }
    const expectedLocale=route.includes('/ko/')?'ko':'en';
    assert(html.includes('<html lang="'+expectedLocale+'">'), 'Locale: '+route);
    assert(html.includes('href="/player-codex/assets/site.css'), 'Portable styling: '+route);
  }
  server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
  for(let i=0;i<60;i++){
    try{ const r=await fetch(origin+'/player-codex/');if(r.ok)break; }catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
    if(i===59)throw Error('Preview server did not start');
  }
  mkdirSync(path.join(root,'player-codex-test-screens'),{recursive:true});
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  for(const width of [360,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    // Stub only the third-party AdSense library during layout tests: this
  // prevents external ad runtime errors and never contacts a real ad server.
  await context.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({status:200,contentType:'application/javascript',body:'/* isolated Auto ads preview */'}));
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    for(const route of routes){
      const resp=await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:25000});
      assert(resp?.ok(), 'HTTP status for '+route);
      await page.waitForFunction(()=>[...document.styleSheets].some(x=>x.href?.includes('/player-codex/assets/site.css')),{timeout:10000});
      const state=await page.evaluate(()=>({
        scroll:document.documentElement.scrollWidth,
        viewport:document.documentElement.clientWidth,
        heading:!!document.querySelector('h1'),
        visible:document.querySelector('main')?.getBoundingClientRect().height>100,
      }));
      assert(state.heading && state.visible,'Main content visible: '+route+' at '+width+'px');
      assert(state.scroll<=state.viewport+2,'Horizontal overflow: '+route+' at '+width+'px '+JSON.stringify(state));
      if(route.includes('/demo/')){
        const release=JSON.parse(readFileSync(path.join(root,'player-codex/archeage-chronicles/data/playtest-records.json'),'utf8')).release;
        const dates=await page.locator('.demo-times tbody tr').evaluateAll(rows=>rows.map(row=>({
          zone:row.dataset.timeZone,
          times:[...row.querySelectorAll('time')].map(t=>({boundary:t.dataset.boundary,instant:t.dateTime,label:t.innerText.replace(/\s+/g,' ').trim()}))
        })));
        assert.deepEqual(dates.map(r=>r.zone),['America/Los_Angeles','Asia/Seoul','UTC'],'All demo time zones: '+route);
        for(const row of dates){
          assert.deepEqual(row.times.map(t=>t.boundary),['start','end'],'Both demo boundaries: '+route);
          for(const time of row.times){
            const expected=time.boundary==='start'?release.starts_at:release.ends_at;
            assert.equal(time.instant,expected,'Demo date matches evidence release window: '+route);
            const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:row.zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(expected)).map(p=>[p.type,p.value]));
            assert.equal(time.label,`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,'Correct local demo time: '+row.zone+' '+route);
          }
        }
        const missingAnchors=await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].map(a=>a.hash.slice(1)).filter(id=>!document.getElementById(id)));
        assert.deepEqual(missingAnchors,[],'Guide jump links resolve: '+route);
        assert.equal(await page.locator('#playtest-findings .field-check').count(),7,'Keep seven gameplay targets: '+route);
        assert.equal(await page.locator('#hinnon .demo-fact').count(),1,'Dungeon official facts: '+route);
        assert.equal(await page.locator('#hinnon .demo-pending').count(),1,'Dungeon unknowns remain distinct: '+route);
        assert(await page.locator('#demo-sources a[href="https://steamcommunity.com/games/3218230/announcements/detail/712289492929610763"]').count(),'Latest individual official source: '+route);
        await page.locator('.growth-jumps a[href="#pvp"]').click();
        assert.equal(new URL(page.url()).hash,'#pvp','Mobile/desktop PvP navigation: '+route);
        await page.locator('.demo-growth summary').click();
        assert(await page.locator('.demo-growth').evaluate(el=>el.open),'Progression summary expands: '+route);
        await page.locator('.demo-growth summary').click();
        await page.evaluate(()=>window.scrollTo(0,0));
      }
      const shot=(route.replace(/^\//,'').replaceAll('/','-').replace(/-$/,'')||'root')+'-'+width+'.png';
      await page.screenshot({path:path.join(root,'player-codex-test-screens',shot),fullPage:true,animations:'disabled'});
    }
    assert.deepEqual(errors,[],'Runtime errors at '+width+'px');
    await context.close();
  }
  // Official trailers must link to identifiable publisher sources in both languages.
  for(const locale of ['', 'ko/']){
    const pageUrl=origin+'/player-codex/archeage-chronicles/'+locale;
    const r=await fetch(pageUrl);
    assert(r.ok,'Official media test page missing: '+locale);
    const html=await r.text();
    assert(html.includes('id="official-videos"'),'Official videos section missing: '+locale);
    assert(html.includes('data-official-video="reveal"'),'Reveal trailer missing: '+locale);
    assert(html.includes('data-official-video="developer"'),'Developer briefing missing: '+locale);
    const ids=[...html.matchAll(/data-official-video="([^"]+)"/g)].map(x=>x[1]);
    assert.deepEqual(ids,['auroria','developer','reveal'],'Latest official gameplay must lead: '+locale);
    assert(html.includes('https://www.youtube.com/watch?v=E12uscaQvSA'),'Newest gameplay showcase link missing: '+locale);
    for(const u of ['https://www.youtube.com/watch?v=UeRY7LU0x3M','https://www.youtube.com/watch?v=78ZGLdQMPGU','https://store.steampowered.com/app/3218230/ArcheAge_Chronicles/','https://www.youtube.com/@ArcheAgeChronicles']){
      assert(html.includes(u),'Missing source video URL '+u+' : '+locale);
    }
    assert(html.includes('target="_blank" rel="noopener noreferrer"'),'Video links should open safely: '+locale);
  }
  const context=await browser.newContext({viewport:{width:390,height:844}});
  // Stub only the third-party AdSense library during layout tests: this
  // prevents external ad runtime errors and never contacts a real ad server.
  await context.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({status:200,contentType:'application/javascript',body:'/* isolated Auto ads preview */'}));
  const page=await context.newPage();
  await page.goto(origin+'/player-codex/',{waitUntil:'domcontentloaded'});
  await page.locator('.card-archeage').click();
  assert.equal(new URL(page.url()).pathname,'/player-codex/archeage-chronicles/','ArcheAge card navigation');
  await page.locator('.lang').click();
  assert.equal(new URL(page.url()).pathname,'/player-codex/archeage-chronicles/ko/','Language toggle to Korean');
  assert.equal(await page.locator('.official-video').count(),3,'Korean media cards visible');
  assert.equal(await page.locator('.official-video').first().getAttribute('data-official-video'),'auroria','Newest gameplay video should be the first card');
  await page.getByRole('link',{name:/준비 가이드 보기/}).click();
  assert.equal(new URL(page.url()).pathname,'/player-codex/archeage-chronicles/demo/ko/','Korean playtest guide link');
  await page.locator('.lang').click();
  assert.equal(new URL(page.url()).pathname,'/player-codex/archeage-chronicles/demo/','Guide language switch');
  await context.close();
  console.log('PASS: 8 routes × 4 viewport sizes, internal navigation, language links, page errors and horizontal overflow.');
}finally{
  if(browser)await browser.close();
  if(server)server.kill('SIGTERM');
}
