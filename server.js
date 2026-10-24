// Serves the game. Run `npm start` and open http://<this computer's IP>:8080 on any device on the same Wi-Fi.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const VENDOR = { '/vendor/three.module.min.js': join(fileURLToPath(new URL('.', import.meta.url)), 'node_modules/three/build/three.module.min.js') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '').replace(/^(\.\.[/\\])+/, '');
  const file = VENDOR[url.pathname] || join(ROOT, rel || 'index.html');
  if (!VENDOR[url.pathname] && !file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file.endsWith('/') ? join(file, 'index.html') : file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Mysön körs på http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  På samma wifi: http://${a.address}:${PORT}`);
  }
});
