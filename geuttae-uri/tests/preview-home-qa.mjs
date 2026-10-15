import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const version = JSON.parse(await readFile(new URL('../version.json', import.meta.url))).version;
const publicBase = process.env.PREVIEW_BASE_URL;
const out = fileURLToPath(new URL(`./qa-output/preview-${publicBase ? 'public' : 'local'}/`, import.meta.url));
await mkdir(out, {recursive: true});
let server;
if (!publicBase) {
  // Static frontend only: never start or modify the multiplayer server/data.
  server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      assert.ok(file.startsWith(root + path.sep));
      const data = await readFile(file);
      res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const base = publicBase || `http://127.0.0.1:${server.address().port}/geuttae-uri/`;
const browser = await chromium.launch({args: ['--no-sandbox']});
const report = [];

async function assertHome(page, language, errors) {
  assert.deepEqual(errors, [], 'JavaScript runtime errors');
  assert.equal(await page.locator('html').getAttribute('lang'), language);
  assert.equal(await page.locator('body').getAttribute('data-screen'), 'home');
  assert.equal(await page.locator('#build-label').textContent(), `TEST v${version}`);
  assert.equal(await page.locator('#app .home-screen').isVisible(), true, 'Home must be visible');
  await page.locator('#app .home-screen').evaluate(async element => {
    await Promise.all(element.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished));
  });
  assert.equal(await page.locator('#app h1').isVisible(), true, 'Home heading must be visible');
  const demo = page.locator('#app [data-action="demo"]');
  assert.equal(await demo.count(), 1);
  assert.equal(await demo.isVisible(), true, 'Demo must be visible');
  assert.equal(await demo.isEnabled(), true, 'Demo must be usable');
  // Check the chosen language, without requiring Korean on English browsers.
  assert.ok((await demo.innerText()).includes(language === 'ko' ? '먼저 체험해 보기' : 'Try the demo'));
  assert.equal(await page.locator('.loading-state').count(), 0, 'Loading placeholder must be gone');
  for (const img of await page.locator('.memory-collage img').all()) {
    await img.evaluate(element => element.decode());
    assert.ok(await img.evaluate(element => element.naturalWidth > 0));
    assert.equal(await img.isVisible(), true);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
}

try {
  const cases = [
    {locale:'ko-KR', expected:'ko'}, {locale:'en-CA', expected:'en'},
    {locale:'fr-CA', expected:'en'},
    {locale:'ko-KR', saved:'en', expected:'en'}, {locale:'en-CA', saved:'ko', expected:'ko'}
  ];
  for (const scenario of cases) {
    const id = scenario.locale + (scenario.saved ? '-saved-' + scenario.saved : '-fresh');
    const context = await browser.newContext({locale:scenario.locale, viewport:{width:390, height:844}});
    // Only static GETs to the preview origin are allowed. Demo interaction stays local.
    await context.route('**/*', route => {
      const request = route.request();
      return request.method() === 'GET' && new URL(request.url()).origin === new URL(base).origin
        ? route.continue() : route.abort('blockedbyclient');
    });
    if (scenario.saved) await context.addInitScript(language => {
      if (!localStorage.getItem('thenus-language')) localStorage.setItem('thenus-language', language);
    }, scenario.saved);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base);
      await page.waitForFunction(value => document.getElementById('build-label')?.textContent === value, `TEST v${version}`);
      await assertHome(page, scenario.expected, errors);
      if (!scenario.saved) assert.equal(await page.evaluate(() => localStorage.getItem('thenus-language')), null, 'Automatic detection must not create a saved choice');
      await page.screenshot({path:path.join(out, id + '-home.png'), fullPage:true, animations:'disabled'});
      await page.setViewportSize({width:1280, height:900});
      await assertHome(page, scenario.expected, errors);
      await page.screenshot({path:path.join(out, id + '-desktop.png'), fullPage:true, animations:'disabled'});
      await page.setViewportSize({width:390, height:844});
      const next = scenario.expected === 'ko' ? 'en' : 'ko';
      await page.locator('#settings-toggle').click();
      await page.locator(`[data-language="${next}"]`).click();
      assert.equal(await page.locator(`[data-language="${next}"]`).getAttribute('aria-pressed'), 'true');
      await page.locator('#close-settings').click();
      await assertHome(page, next, errors);
      await page.reload();
      await page.waitForFunction(value => document.getElementById('build-label')?.textContent === value, `TEST v${version}`);
      await assertHome(page, next, errors);
      assert.equal(await page.evaluate(() => localStorage.getItem('thenus-language')), next);
      // Prove a real rendered control responds, without creating a real room.
      await page.locator('#app [data-action="demo"]').click();
      await page.locator('[data-action="start"]').waitFor({state:'visible'});
      assert.equal(await page.locator('body').getAttribute('data-screen'), 'lobby');
      assert.deepEqual(errors, []);
      report.push({id, status:'pass', initialLanguage:scenario.expected, switchedAndReloaded:next});
      console.log('BROWSER PASS:', id, 'home, images, mobile/desktop, switch, reload, demo');
    } catch (error) {
      report.push({id, status:'fail', message:error.message, errors});
      await page.screenshot({path:path.join(out, id + '-failure.png'), fullPage:true}).catch(() => {});
      await writeFile(path.join(out, id + '-failure.html'), await page.content());
      throw error;
    } finally { await context.close(); }
  }
  if (!publicBase) {
    // Negative fixtures ensure old string-only checks cannot hide blank/hidden/error states.
    const context = await browser.newContext({locale:'en-CA'});
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(value => document.getElementById('build-label')?.textContent === value, `TEST v${version}`);
    await page.locator('[data-action="demo"]').evaluate(el => el.style.display = 'none');
    await assert.rejects(assertHome(page, 'en', []), /Demo must be visible/);
    await page.locator('[data-action="demo"]').evaluate(el => el.style.display = '');
    await assert.rejects(assertHome(page, 'ko', []));
    await assert.rejects(assertHome(page, 'en', ['fixture runtime error']), /runtime errors/);
    await page.locator('#app').evaluate(el => el.replaceChildren());
    await assert.rejects(assertHome(page, 'en', []), /Home must be visible/);
    await context.close();
    console.log('REGRESSION PASS: hidden control, wrong language, runtime error and blank app rejected');
  }
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify({base, version, cases:report}, null, 2));
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
