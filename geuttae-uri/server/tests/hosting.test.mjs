import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {railwayConfig} from '../src/railway.mjs';
import {checkPublicServer} from '../tools/check-public-server.mjs';

const baseEnv = {RAILWAY_PUBLIC_DOMAIN: 'quiz-test.up.railway.app', RAILWAY_VOLUME_MOUNT_PATH: '/data', PORT: '3000'};
const frontend = 'https://bumblev95.github.io';
const apiOrigin = 'https://quiz-test.up.railway.app';

async function withApp(t, options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gu-hosting-'));
  const app = await createApp({dataDir, publicOrigin: apiOrigin, frontendOrigins: frontend, ...options});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await fs.rm(dataDir, {recursive: true, force: true}); });
  const port = app.server.address().port;
  const send = (url = '/api/health', {host = 'healthcheck.railway.app', method = 'GET', origin, headers = {}} = {}) => new Promise((resolve, reject) => {
    const req = httpRequest({host: '127.0.0.1', port, path: url, method,
      headers: {Host: host, ...(origin === undefined ? {} : {Origin: origin}), ...headers}}, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
    });
    req.on('error', reject); req.end();
  });
  return {send, port};
}

test('Railway config derives HTTPS and a private child directory with exact web and Android origins', () => {
  const config = railwayConfig(baseEnv);
  assert.equal(config.publicOrigin, apiOrigin);
  assert.equal(config.dataDir, '/data/geuttae-uri');
  assert.deepEqual(config.frontendOrigins.split(','), [frontend, 'https://localhost']);
  assert.equal(config.healthcheckHost, 'healthcheck.railway.app');
  assert.equal(config.port, 3000);
  assert.equal(railwayConfig({...baseEnv, PUBLIC_ORIGIN: 'https://quiz.example.org'}).publicOrigin, 'https://quiz.example.org');
});

test('Railway refuses missing domains and non-HTTPS or decorated origins', () => {
  for (const value of ['http://api.example.org', 'https://api.example.org/', 'https://user:secret@api.example.org', 'https://api.example.org?token=secret', 'https://api.example.org#fragment']) {
    assert.throws(() => railwayConfig({...baseEnv, PUBLIC_ORIGIN: value}));
  }
  assert.throws(() => railwayConfig({...baseEnv, RAILWAY_PUBLIC_DOMAIN: ''}));
});

test('Railway refuses absent, relative, root or unnormalized volume paths', () => {
  for (const mount of [undefined, '', 'data', '/', '/data/../app', '/data/']) {
    assert.throws(() => railwayConfig({...baseEnv, RAILWAY_VOLUME_MOUNT_PATH: mount}));
  }
  assert.throws(() => railwayConfig({...baseEnv, DATA_DIR: '/app/data'}));
  assert.equal(railwayConfig({...baseEnv, DATA_DIR: '/data/geuttae-uri'}).dataDir, '/data/geuttae-uri');
});

test('Railway rejects invalid port numbers', () => {
  for (const port of ['0', '-1', '65536', 'NaN', '3.5']) assert.throws(() => railwayConfig({...baseEnv, PORT: port}));
});

test('The provider health hostname is denied unless explicitly enabled', async t => {
  const {send} = await withApp(t);
  assert.equal((await send()).status, 421);
});

test('Provider GET health probe succeeds without broadening the API host allowlist', async t => {
  const {send, port} = await withApp(t, {healthcheckHost: 'healthcheck.railway.app'});
  for (const host of ['healthcheck.railway.app', `healthcheck.railway.app:${port}`]) {
    const response = await send('/api/health', {host});
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).ok, true);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  for (const url of ['/api/rooms', '/api/health?bypass=1', '/api/rooms/ABCDEFGH/state', '/geuttae-uri/']) {
    assert.equal((await send(url)).status, 421);
  }
  for (const method of ['POST', 'OPTIONS', 'HEAD']) assert.equal((await send('/api/health', {method, origin: frontend})).status, 421);
});

test('Provider probe exception rejects browser origins and forged hosts', async t => {
  const {send} = await withApp(t, {healthcheckHost: 'healthcheck.railway.app'});
  for (const origin of [frontend, 'https://untrusted.invalid', 'null', '']) assert.equal((await send('/api/health', {origin})).status, 421);
  for (const host of ['evil.healthcheck.railway.app', 'healthcheck.railway.app.evil.invalid', 'user@healthcheck.railway.app', 'untrusted.invalid']) {
    assert.equal((await send('/api/health', {host})).status, 421);
  }
  assert.equal((await send('/api/health', {host: 'quiz-test.up.railway.app', origin: frontend})).status, 200);
  assert.equal((await send('/api/health', {host: 'quiz-test.up.railway.app', origin: 'https://untrusted.invalid'})).status, 403);
});

function mockAPI({healthPatch = {}, headerPatch = {}, allowEvil = false} = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    const origin = options.headers.Origin;
    if (origin !== frontend && !allowEvil) return new Response('{}', {status: 403});
    if (options.headers['Access-Control-Request-Headers'] === 'x-untrusted-header') return new Response('{}', {status: 403});
    const headers = {'Access-Control-Allow-Origin': frontend, 'Cache-Control': 'no-store', 'Strict-Transport-Security': 'max-age=63072000', ...headerPatch};
    if (options.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: {...headers, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Photo-Consent', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'}});
    }
    return new Response(JSON.stringify({ok: true, version: '0.3.2', deployment: 'single-instance', storage: 'private-server-files', ...healthPatch}), {status: 200, headers});
  };
  return {fetchImpl, calls};
}

test('Deployment preflight is read-only and does not claim physical-device readiness', async () => {
  const mock = mockAPI();
  const report = await checkPublicServer(apiOrigin, mock);
  assert.equal(report.checks.length, 3);
  assert.equal(report.readyForTwoDeviceTest, false);
  assert.equal(report.remaining.length, 4);
  assert.equal(mock.calls.length, 5);
  assert.ok(mock.calls.every(({options}) => !options.method || options.method === 'OPTIONS'));
  assert.ok(mock.calls.every(({options}) => options.redirect === 'error' && options.signal));
});

test('Deployment preflight rejects wrong backends, unsafe CORS and missing security headers', async () => {
  for (const options of [
    {healthPatch: {version: '0.2.0'}}, {healthPatch: {deployment: 'serverless'}},
    {headerPatch: {'Access-Control-Allow-Origin': '*'}},
    {headerPatch: {'Cache-Control': 'public'}}, {headerPatch: {'Strict-Transport-Security': ''}},
    {allowEvil: true},
  ]) await assert.rejects(checkPublicServer(apiOrigin, mockAPI(options)));
});

test('Deployment preflight rejects invalid URLs before making any request', async () => {
  let calls = 0;
  for (const url of ['http://localhost:3000', 'https://api.example.org/', 'https://user:secret@api.example.org', 'https://api.example.org?secret=1', undefined]) {
    await assert.rejects(checkPublicServer(url, {fetchImpl: async () => { calls++; }}));
  }
  assert.equal(calls, 0);
});

test('Android exact HTTPS local origin can preflight but cannot read a room without its bearer session', async t => {
  const {send} = await withApp(t, {frontendOrigins: railwayConfig(baseEnv).frontendOrigins});
  const host = new URL(apiOrigin).host;
  const ok = await send('/api/rooms', {host, method:'OPTIONS', origin:'https://localhost',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(ok.status,204);assert.equal(ok.headers['access-control-allow-origin'],'https://localhost');
  for (const origin of ['http://localhost','https://localhost.evil.test','https://localhost:9000']) {
    assert.equal((await send('/api/rooms', {host, method:'OPTIONS', origin})).status,403);
  }
  const denied=await send('/api/rooms/ABCDEFGH/state', {host,origin:'https://localhost'});
  assert.notEqual(denied.status,200);
});
