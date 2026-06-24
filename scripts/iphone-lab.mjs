import { createServer, get as httpGet } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const labFile = resolve(root, 'preview', 'iphone-lab.html');

let expoPort = Number(process.env.EXPO_WEB_PORT || 8082);
let labPort = Number(process.env.IPHONE_LAB_PORT || 8099);
const expoHost = process.env.EXPO_WEB_HOST || '127.0.0.1';
let appUrl = process.env.EXPO_WEB_URL || `http://${expoHost}:${expoPort}`;
let labUrl = `http://127.0.0.1:${labPort}`;

let expoProcess = null;
const shouldOpenBrowser = process.env.IPHONE_LAB_NO_OPEN !== '1';

function requestOk(url, timeoutMs = 900) {
  return new Promise((resolveOk) => {
    const req = httpGet(url, (res) => {
      res.resume();
      resolveOk(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolveOk(false);
    });
    req.on('error', () => resolveOk(false));
  });
}

function requestText(url, timeoutMs = 900) {
  return new Promise((resolveText) => {
    const req = httpGet(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolveText(body);
          return;
        }
        resolveText(null);
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolveText(null);
    });
    req.on('error', () => resolveText(null));
  });
}

function portAvailable(port) {
  return Promise.all([
    portAvailableOnHost(port, '127.0.0.1'),
    portAvailableOnHost(port, '::1'),
  ]).then(([ipv4, ipv6]) => ipv4 && ipv6);
}

function portAvailableOnHost(port, host) {
  return new Promise((resolveOk) => {
    const probe = createNetServer();
    probe.once('error', (error) => {
      resolveOk(error?.code === 'EADDRNOTAVAIL');
    });
    probe.once('listening', () => {
      probe.close(() => resolveOk(true));
    });
    probe.listen(port, host);
  });
}

async function findFreePort(startAt) {
  let port = startAt;
  while (!(await portAvailable(port))) {
    port += 1;
  }
  return port;
}

async function getExistingLabHealth(port) {
  const text = await requestText(`http://127.0.0.1:${port}/health`);
  if (!text) {
    return null;
  }

  try {
    const health = JSON.parse(text);
    return health?.ok === true ? health : null;
  } catch {
    return null;
  }
}

function normalizeLocalUrl(value) {
  try {
    const url = new URL(value);
    const host = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
      ? 'loopback'
      : url.hostname;
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return `${url.protocol}//${host}:${port}`;
  } catch {
    return String(value || '');
  }
}

function sameLocalUrl(a, b) {
  return normalizeLocalUrl(a) === normalizeLocalUrl(b);
}

function openBrowser(url) {
  if (!shouldOpenBrowser) {
    return;
  }

  const command =
    process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];

  try {
    const opener = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    opener.on('error', () => {
      console.log(`[iphone-lab] Open manually: ${url}`);
    });
    opener.unref();
  } catch {
    console.log(`[iphone-lab] Open manually: ${url}`);
  }
}

async function ensureExpo() {
  const existingLab = await getExistingLabHealth(labPort);
  if (!process.env.EXPO_WEB_URL && existingLab?.appUrl && await requestOk(existingLab.appUrl, 5000)) {
    appUrl = existingLab.appUrl;
    console.log(`[iphone-lab] Reusing Expo Web from existing iPhone Lab at ${appUrl}`);
    return;
  }

  const candidateUrls = process.env.EXPO_WEB_URL
    ? [appUrl]
    : [
        appUrl,
        `http://localhost:${expoPort}`,
        `http://[::1]:${expoPort}`,
      ];

  for (const candidateUrl of candidateUrls) {
    if (await requestOk(candidateUrl, 5000)) {
      appUrl = candidateUrl;
      console.log(`[iphone-lab] Expo Web already responding at ${appUrl}`);
      return;
    }
  }

  if (!process.env.EXPO_WEB_URL && !(await portAvailable(expoPort))) {
    const previous = expoPort;
    expoPort = await findFreePort(expoPort + 1);
    appUrl = `http://${expoHost}:${expoPort}`;
    console.log(`[iphone-lab] Port ${previous} is busy. Using Expo Web port ${expoPort}`);
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['expo', 'start', '--web', '--port', String(expoPort), '--localhost'];
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.includes('=')),
  );

  console.log(`[iphone-lab] Starting Expo Web at ${appUrl}`);
  expoProcess = spawn(npx, args, {
    cwd: root,
    env: {
      ...cleanEnv,
      BROWSER: 'none',
    },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  expoProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[expo] ${chunk}`);
  });
  expoProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[expo] ${chunk}`);
  });
  expoProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.log(`[iphone-lab] Expo Web exited with code ${code}`);
    }
  });
}

function startLabServer() {
  labUrl = `http://127.0.0.1:${labPort}`;
  const server = createServer((req, res) => {
    const path = new URL(req.url || '/', labUrl).pathname;

    if (path === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, appUrl }));
      return;
    }

    if (path !== '/' && path !== '/iphone-lab.html') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const html = readFileSync(labFile, 'utf8').replaceAll('__APP_URL__', appUrl);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(html);
  });

  server.listen(labPort, '127.0.0.1', () => {
    console.log(`[iphone-lab] Opening ${labUrl}`);
    console.log(`[iphone-lab] iPhone frame points to ${appUrl}`);
    openBrowser(labUrl);
  });

  return server;
}

function shutdown(server) {
  server?.close();
  if (expoProcess && !expoProcess.killed) {
    expoProcess.kill();
  }
}

await ensureExpo();
let server = null;

if (!(await portAvailable(labPort))) {
  const health = await getExistingLabHealth(labPort);
  const expectedAppUrl = !health?.appUrl || sameLocalUrl(health.appUrl, appUrl);

  if (health && expectedAppUrl) {
    console.log(`[iphone-lab] iPhone Lab already running at ${labUrl}`);
    console.log(`[iphone-lab] Opening ${labUrl}`);
    openBrowser(labUrl);

    if (!expoProcess) {
      process.exit(0);
    }
  } else {
    const previous = labPort;
    labPort = await findFreePort(labPort + 1);
    labUrl = `http://127.0.0.1:${labPort}`;
    console.log(`[iphone-lab] Port ${previous} is busy. Using Lab port ${labPort}`);
    server = startLabServer();
  }
} else {
  server = startLabServer();
}

process.on('SIGINT', () => {
  shutdown(server);
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown(server);
  process.exit(0);
});
