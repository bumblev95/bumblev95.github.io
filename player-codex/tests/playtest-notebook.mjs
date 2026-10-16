// UI-only synthetic drafts. No game is launched and no real observation is recorded.
import {strict as assert} from 'node:assert';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const origin='http://127.0.0.1:8766';
const key='players-codex:archeage:playtest-drafts:v1';
let server,browser;
async function open(page,locale='ko/') {
  await page.goto(origin+'/player-codex/archeage-chronicles/demo/'+locale);
  await page.waitForFunction(()=>!document.getElementById('notebook-app').hidden);
  await page.locator('#playtest-notebook summary').click();
  await page.locator('#playtest-form select[name="target_id"] option').first().waitFor({state:'attached'});
}
async function fill(page) {
  for(const [name,value] of Object.entries({title_ko:'합성 테스트 전용',title_en:'SYNTHETIC TEST ONLY',
    claim_ko:'실제 플레이가 아닌 UI 테스트',claim_en:'Synthetic UI fixture; no gameplay',subject_id:'synthetic-ui-subject',
    fact_key:'synthetic-ui-key',recorded_by:'synthetic-ui-recorder',build:'synthetic-ui-build',region:'synthetic-ui-region',variant:'synthetic-ui-setup'})) {
    await page.locator(`[name="${name}"]`).fill(value);
  }
}
try {
  server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
  for(let i=0;i<60;i++) {
    try {if((await fetch(origin+'/player-codex/')).ok)break;}catch{}
    await new Promise(r=>setTimeout(r,100));if(i===59)throw Error('Preview did not start');
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);
  assert.equal(await page.locator('.field-check').count(),7);
  assert.equal(await page.locator('[data-playtest-id]').count(),0);
  await fill(page);await page.getByRole('button',{name:'미검증 초안 저장',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('draft-list').children.length===1);
  assert.match(await page.locator('#draft-count').innerText(),/미검증.*1/);
  await page.getByRole('button',{name:'미검증 초안 저장',exact:true}).click();
  assert.match(await page.locator('#notebook-message').innerText(),/Duplicate fact/);
  assert.equal(await page.locator('#draft-list li').count(),1);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'초안 파일 내보내기'}).click()]);
  let bytes='';for await(const chunk of await download.createReadStream())bytes+=chunk;
  const exported=JSON.parse(bytes);
  assert.equal(exported.records[0].verification.status,'unverified');assert.equal(exported.records[0].observed_at,null);
  assert.equal(exported.records[0].verification.review,null);assert.equal(exported.evidence.length,0);
  await page.locator('.lang').click();
  await page.waitForFunction(()=>!document.getElementById('notebook-app').hidden);
  await page.locator('#playtest-notebook summary').click();
  assert.match(await page.locator('#draft-count').innerText(),/1 unverified/);
  const forged=structuredClone(exported);forged.records[0].verification.status='verified';
  await page.locator('#import-drafts').setInputFiles({name:'forged.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(forged))});
  await page.waitForFunction(()=>document.getElementById('notebook-message').textContent.includes('Import failed'));
  assert.equal(await page.locator('#draft-list li').count(),1);assert.equal(await page.locator('[data-playtest-id]').count(),0);
  // A valid file reimport is idempotent.
  await page.locator('#import-drafts').setInputFiles({name:'drafts.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>document.getElementById('notebook-message').textContent.includes('Imported unverified'));
  assert.equal(await page.locator('#draft-list li').count(),1);
  await page.getByRole('button',{name:/Remove draft:/}).click();assert.equal(await page.locator('#draft-list li').count(),0);
  // Malformed/stale storage must remain recoverable and cannot be overwritten.
  await page.evaluate(k=>{localStorage.setItem(k,'BROKEN SAVED DRAFT');localStorage.setItem('synthetic-other-app-data','MUST KEEP');},key);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('notebook-app').hidden);
  assert(await page.locator('button[type="submit"]').isDisabled());
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'BROKEN SAVED DRAFT');
  await page.locator('#playtest-notebook summary').click();
  const [oldDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export draft file'}).click()]);
  let oldBytes='';for await(const chunk of await oldDownload.createReadStream())oldBytes+=chunk;
  assert.equal(oldBytes,'BROKEN SAVED DRAFT');
  await page.getByRole('button',{name:'Start a new notebook draft'}).click();
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-other-app-data')),'MUST KEEP');
  assert(!(await page.locator('button[type="submit"]').isDisabled()));
  assert.deepEqual(errors,[]);
  await context.close();
  // A blocked-storage browser still offers an exportable in-memory draft.
  const noStorage=await browser.newContext({viewport:{width:360,height:800}});
  await noStorage.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Blocked','SecurityError');};});
  const p=await noStorage.newPage();await open(p);await fill(p);
  await p.getByRole('button',{name:'미검증 초안 저장',exact:true}).click();
  assert.match(await p.locator('#notebook-message').innerText(),/나가기 전에.*내보내/);
  assert.equal(await p.locator('#draft-list li').count(),1);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2));
  await noStorage.close();
  console.log('PASS: bilingual draft save/reload/export/import, forged approval rejection, duplicate prevention, storage recovery and 360px layout. All fixtures synthetic.');
}finally {if(browser)await browser.close();if(server)server.kill('SIGTERM');}
