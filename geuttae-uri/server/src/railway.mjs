/** Railway launcher. No credentials, account creation, or paid provisioning. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createApp} from './server.mjs';

export function railwayConfig(env = process.env) {
  const domain = env.RAILWAY_PUBLIC_DOMAIN || '';
  const publicOrigin = env.PUBLIC_ORIGIN || (domain ? `https://${domain}` : '');
  let origin;
  try { origin = new URL(publicOrigin); } catch { throw new Error('Create an HTTPS domain before starting the multiplayer API.'); }
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) {
    throw new Error('PUBLIC_ORIGIN must be an exact HTTPS origin, with no path or credentials.');
  }
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!mount || !path.posix.isAbsolute(mount) || mount.endsWith('/') || path.posix.normalize(mount) !== mount) {
    throw new Error('Attach a dedicated private volume at an absolute mount path such as /data.');
  }
  const dataDir = path.posix.join(mount, 'geuttae-uri');
  if (env.DATA_DIR && env.DATA_DIR !== dataDir) {
    throw new Error('DATA_DIR must equal the private volume path followed by /geuttae-uri.');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  return {publicOrigin, mount, dataDir, port, frontendOrigins: 'https://bumblev95.github.io', healthcheckHost: 'healthcheck.railway.app'};
}

export async function startRailway(env = process.env) {
  const config = railwayConfig(env);
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (config.dataDir === appRoot || config.dataDir.startsWith(appRoot + path.sep)) {
    throw new Error('The photo volume must be outside the public application directory.');
  }
  // Never create a missing mount: an absent volume must not silently become ephemeral storage.
  const mountInfo = await fs.lstat(config.mount);
  if (!mountInfo.isDirectory() || await fs.realpath(config.mount) !== config.mount) throw new Error('Invalid private volume mount.');
  await fs.mkdir(config.dataDir, {recursive: false, mode: 0o700}).catch(error => {
    if (error.code !== 'EEXIST') throw error;
  });
  const info = await fs.lstat(config.dataDir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid private data directory.');
  // Initialize the dedicated volume and private child (never recursively), then drop root.
  if (process.getuid?.() === 0) {
    await fs.chown(config.mount, 1000, 1000);
    await fs.chmod(config.mount, 0o700);
    await fs.chown(config.dataDir, 1000, 1000);
    await fs.chmod(config.dataDir, 0o700);
    process.setgroups([]);
    process.setgid(1000);
    process.setuid(1000);
  }
  await fs.chmod(config.dataDir, 0o700);
  const app = await createApp({...config, maxRooms: 20});
  try {
    await new Promise((resolve, reject) => {
      app.server.once('error', reject);
      app.server.listen(config.port, '0.0.0.0', () => { app.server.off('error', reject); resolve(); });
    });
  } catch (error) { await app.close(); throw error; }
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const app = await startRailway();
    console.log('그때 우리 multiplayer API ready. Private volume; one instance; 20-room test limit.');
    let closing = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (closing) return;
      closing = true;
      await app.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('Multiplayer startup stopped:', error.code || error.message);
    process.exitCode = 1;
  }
}
