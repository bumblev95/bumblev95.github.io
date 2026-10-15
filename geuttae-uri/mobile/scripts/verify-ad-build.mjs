import assert from 'node:assert/strict';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const app = new URL('../android/app/', import.meta.url);
const configRoot = new URL('build/generated/source/buildConfig/', app);
const manifestRoot = new URL('build/intermediates/merged_manifests/', app);
const names = await readdir(manifestRoot, {recursive:true});
const report = [];
for (const variant of ['debug','release']) {
  const source = await readFile(new URL(variant+'/com/bumblevai/thenus/BuildConfig.java', configRoot),'utf8');
  const debug = variant === 'debug';
  assert.match(source, new RegExp('ADS_ENABLED = '+(debug?'true':'false')+';'));
  assert.ok(source.includes(debug?'ca-app-pub-3940256099942544/1033173712':'ca-app-pub-9723666081819297/3805489340'));
  const matches = names.filter(n=>n.split(path.sep)[0]===variant&&n.endsWith('AndroidManifest.xml'));
  assert.equal(matches.length,1,'Expected one merged manifest for '+variant);
  const manifest = await readFile(new URL(matches[0],manifestRoot),'utf8');
  assert.ok(manifest.includes(debug?'ca-app-pub-3940256099942544~3347511713':'ca-app-pub-9723666081819297~5568418149'));
  assert.ok(manifest.includes(debug?'com.bumblevai.thenus.test':'com.bumblevai.thenus'));
  const permissions = [...manifest.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(permissions.includes('com.google.android.gms.permission.AD_ID'));
  assert.ok(!permissions.some(p=>/READ_MEDIA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|CAMERA|RECORD_AUDIO|ACCESS_(FINE|COARSE)_LOCATION/.test(p)));
  report.push({variant,adsEnabled:debug,testAds:debug,permissions});
}
await writeFile(new URL('../qa-output/ad-build-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('AD BUILD PASS: test IDs only in debug; owner IDs and serving OFF in default release; merged permission report captured.');
