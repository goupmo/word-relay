import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { start } from '../server/server.js';

test('serves static files, blocks path traversal, and plays a websocket handshake', async (t) => {
  const server = await start(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const mod = await fetch(base + '/shared/chars.js');
  assert.equal(mod.status, 200);
  assert.match(mod.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(base + '/data/categories.json')).status, 200);
  // installable app: manifest with icons that exist, and a service worker served from the root
  const mf = await fetch(base + '/manifest.webmanifest');
  assert.equal(mf.status, 200);
  assert.match(mf.headers.get('content-type'), /manifest\+json/);
  const manifest = await mf.json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose ?? 'any'}`);
  for (const need of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(sizes.includes(need), need);
  for (const icon of manifest.icons) assert.equal((await fetch(base + icon.src)).status, 200, icon.src);
  const sw = await fetch(base + '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.match(await home.text(), /rel="manifest"/);

  const dict = await fetch(base + '/data/dict-ko.json');
  assert.match(dict.headers.get('cache-control'), /max-age=86400/); // big word lists should not be re-downloaded every visit
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(base + '/..%2Fpackage.json')).status, 404);
  assert.equal((await fetch(base + '/nope.txt')).status, 404);

  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  const got = [];
  ws.on('message', (d) => got.push(JSON.parse(d)));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'create', name: '가', lang: 'ko', maxPlayers: 2, timeLimitSec: 10, rounds: 1 }));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(got.find((m) => m.t === 'joined')?.code.length, 5);
  ws.send('not json');
  ws.close();
});
