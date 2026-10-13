import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {sanitizeJpeg} from '../src/media.mjs';
const jpg=await readFile(new URL('./fixtures/sample.jpg',import.meta.url));
test('valid JPEG preserves dimensions',()=>{const r=sanitizeJpeg(jpg);assert.equal(r.width,48);assert.equal(r.height,32);});
test('EXIF/location and comment segments are removed on the server',()=>{const text=Buffer.from('Exif\0\0PRIVATE-GPS-DATA');const size=Buffer.alloc(2);size.writeUInt16BE(text.length+2);const tagged=Buffer.concat([jpg.subarray(0,2),Buffer.from([255,225]),size,text,jpg.subarray(2)]);const r=sanitizeJpeg(tagged);assert.equal(r.bytes.includes(Buffer.from('PRIVATE-GPS-DATA')),false);assert.equal(r.bytes.equals(jpg),true);});
test('fake MIME, malformed JPEG, and oversized images rejected',async()=>{for(const bytes of [Buffer.from('<svg>bad</svg>'),Buffer.alloc(900001),jpg.subarray(0,25),await readFile(new URL('./fixtures/too-wide.jpg',import.meta.url))])assert.throws(()=>sanitizeJpeg(bytes));});
test('metadata after image scan and unknown APP0 thumbnail are removed too',()=>{
 const text=Buffer.from('PRIVATE-GPS-AFTER-SCAN');const length=Buffer.alloc(2);length.writeUInt16BE(text.length+2);
 const segment=Buffer.concat([Buffer.from([255,225]),length,text]);
 const tagged=Buffer.concat([jpg.subarray(0,-2),segment,jpg.subarray(-2)]);
 assert.equal(sanitizeJpeg(tagged).bytes.equals(jpg),true);
 const app0=Buffer.concat([Buffer.from([255,224]),length,text]);
 assert.equal(sanitizeJpeg(Buffer.concat([jpg.subarray(0,2),app0,jpg.subarray(2)])).bytes.equals(jpg),true);
 assert.throws(()=>sanitizeJpeg(Buffer.concat([jpg,Buffer.from('hidden trailing data')])));
});
