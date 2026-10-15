import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roomFromURL} from '../src/links.js';
import {inviteURL} from '../../releases/0.5.0/platform.js';
test('native invitations accept only a room code, never a token or an arbitrary target',()=>{
 assert.equal(roomFromURL('thenus://room?code=ABCDEFGH'),'ABCDEFGH');
 for(const value of ['https://evil.test/?code=ABCDEFGH','thenus://evil?code=ABCDEFGH','thenus://room?code=<script>','thenus://room?code=1234','javascript:alert(1)'])assert.equal(roomFromURL(value),null);
 assert.equal(inviteURL('ABCDEFGH'),'https://bumblev95.github.io/geuttae-uri/?room=ABCDEFGH');
 assert.throws(()=>inviteURL('ABCDEFGH&token=secret'));
});
test('Android packages local code and no broad photo, camera or storage permissions',async()=>{
 const config=JSON.parse(await readFile(new URL('../capacitor.config.json',import.meta.url)));
 assert.equal(config.server.url,undefined);assert.equal(config.server.hostname,'bumblev95.github.io');assert.equal(config.server.cleartext,false);
 const manifest=await readFile(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 assert.doesNotMatch(manifest,/READ_MEDIA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|CAMERA/);assert.match(manifest,/allowBackup="false"/);
 const bundle=await readFile(new URL('../www/mobile.js',import.meta.url),'utf8');assert.doesNotMatch(bundle,/\/ai-draft/);assert.match(bundle,/출시 예정/);
});
