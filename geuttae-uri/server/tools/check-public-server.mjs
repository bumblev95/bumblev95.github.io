/** Read-only deployment preflight. Does not create rooms, upload photos, or publish a config. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export async function checkPublicServer(apiBase, {fetchImpl = fetch} = {}) {
  let url;
  try { url = new URL(apiBase); } catch { throw new Error('Supply the actual HTTPS API origin.'); }
  if (url.protocol !== 'https:' || url.origin !== apiBase) throw new Error('Use an exact HTTPS origin without credentials, a path, query, or fragment.');
  const frontend = 'https://bumblev95.github.io';
  const require = (value, message) => { if (!value) throw new Error(message); };
  const request = (pathname, options = {}) => fetchImpl(apiBase + pathname, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  const result = [];
  let response = await request('/api/health', {headers: {Origin: frontend}});
  require(response.status === 200, 'API health endpoint is not ready.');
  require(response.headers.get('access-control-allow-origin') === frontend, 'The existing Pages origin is not explicitly allowed.');
  require(response.headers.get('cache-control')?.includes('no-store'), 'The API response must not be cached.');
  require(response.headers.get('strict-transport-security')?.includes('max-age='), 'HTTPS/HSTS configuration is missing.');
  const health = await response.json();
  require(health.ok === true && health.version === '0.3.0' && health.deployment === 'single-instance' && health.storage === 'private-server-files', 'The server is not the expected multiplayer backend.');
  result.push('HTTPS API health, version, no-store and explicit Pages origin');
  response = await request('/api/rooms', {method: 'OPTIONS', headers: {
    Origin: frontend, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type,x-photo-consent',
  }});
  require(response.status === 204 && response.headers.get('access-control-allow-origin') === frontend, 'Pages CORS preflight failed.');
  const headers = (response.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map(value => value.trim());
  require(['authorization', 'content-type', 'x-photo-consent'].every(value => headers.includes(value)), 'The required upload/auth headers are not allowed.');
  const methods = (response.headers.get('access-control-allow-methods') || '').split(',').map(value => value.trim());
  require(['GET', 'POST'].every(value => methods.includes(value)), 'The required API methods are not allowed.');
  result.push('Bearer-auth and photo-upload CORS preflight');
  for (const origin of ['https://untrusted.invalid', 'null']) {
    response = await request('/api/health', {headers: {Origin: origin}});
    require(response.status === 403 && !response.headers.get('access-control-allow-origin'), 'An untrusted origin was not blocked.');
  }
  response = await request('/api/rooms', {method: 'OPTIONS', headers: {
    Origin: frontend, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-untrusted-header',
  }});
  require(response.status === 403, 'An unsupported request header was not blocked.');
  result.push('Untrusted origins, null origins and unexpected headers blocked');
  return {checks: result, apiBase, readyForTwoDeviceTest: false,
    remaining: ['Authenticated two-browser gameplay and SSE', 'Private volume permissions and backup exclusion', 'Restart recovery and physical photo deletion', 'Two real phones on different networks']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await checkPublicServer(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
    console.log('Preflight passed only. Do not change runtime-config.json until the remaining checks pass.');
  } catch (error) {
    console.error('Public API preflight failed:', error.message);
    process.exitCode = 1;
  }
}
