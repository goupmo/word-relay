import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRooms } from '../shared/rooms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};

// URL path -> file on disk, or null. Only public/, shared/ and the categories file are reachable.
function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p === '/') p = '/index.html';
  let base;
  let rel;
  if (p === '/data/categories.json') { base = path.join(root, 'data'); rel = 'categories.json'; }
  else if (p.startsWith('/shared/')) { base = path.join(root, 'shared'); rel = p.slice('/shared/'.length); }
  else { base = path.join(root, 'public'); rel = p.slice(1); }
  const file = path.resolve(base, rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

const cache = new Map(); // file -> { raw, gz, mtime }
function load(file) {
  const mtime = statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit;
  const raw = readFileSync(file);
  const entry = { raw, gz: raw.length > 1024 ? gzipSync(raw) : null, mtime };
  cache.set(file, entry);
  return entry;
}

const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

export function start(port = Number(process.env.PORT) || 3000) {
  const dicts = {
    ko: new Set(readJson('public/data/dict-ko.json')),
    en: new Set(readJson('public/data/dict-en.json')),
  };
  const rooms = createRooms({ dicts, categories: readJson('data/categories.json'), now: Date.now, rand: Math.random });

  const server = http.createServer((req, res) => {
    const file = resolveFile(req.url);
    if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const { raw, gz } = load(file);
    const headers = { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' };
    if (/\.(json|js|css|html|svg)$/.test(file)) headers['cache-control'] = 'no-cache';
    if (gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
      return res.end(gz);
    }
    res.writeHead(200, headers);
    res.end(raw);
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
  wss.on('connection', (ws) => {
    const id = rooms.connect((m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)));
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      rooms.handle(id, msg);
    });
    ws.on('close', () => rooms.disconnect(id));
    ws.on('error', () => ws.terminate());
  });

  const timer = setInterval(() => rooms.tick(), 1000);
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30000);
  server.on('close', () => { clearInterval(timer); clearInterval(beat); wss.close(); });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().then((s) => console.log(`http://localhost:${s.address().port}`));
}
