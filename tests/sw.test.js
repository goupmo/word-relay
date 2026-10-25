import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { start } from '../server/server.js';

// Runs public/sw.js against fake service-worker globals and returns its handlers.
function loadWorker({ online = true, cached = {} } = {}) {
  const handlers = {};
  const precached = [];
  const cache = { addAll: async (list) => precached.push(...list), put: async () => {}, keys: async () => [] };
  const caches = {
    open: async () => cache,
    keys: async () => [],
    match: async (req) => cached[typeof req === 'string' ? req : new URL(req.url).pathname],
  };
  const sandbox = {
    self: { addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches,
    location: new URL('http://game.test/'),
    fetch: async () => { if (!online) throw new Error('offline'); return { ok: true, clone() { return this; } }; },
    Response: { error: () => 'ERROR' },
    URL,
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), sandbox);
  return { handlers, precached };
}
const request = (path, extra = {}) => ({ url: `http://game.test${path}`, method: 'GET', mode: 'cors', ...extra });
const ask = (handlers, req) => {
  let answered;
  handlers.fetch({ request: req, respondWith: (p) => { answered = p; } });
  return answered;
};

test('every file the worker precaches exists on the server (a 404 would break installation)', async (t) => {
  const { handlers, precached } = loadWorker();
  await new Promise((resolve) => handlers.install({ waitUntil: (p) => p.then(resolve) }));
  assert.ok(precached.length > 10);
  const server = await start(0);
  t.after(() => server.close());
  for (const path of precached) {
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}${path}`)).status, 200, path);
  }
});

test('online: the network answer wins', async () => {
  const { handlers } = loadWorker({ online: true, cached: { '/app.js': 'STALE' } });
  const res = await ask(handlers, request('/app.js'));
  assert.equal(res.ok, true);
  assert.notEqual(res, 'STALE');
});

test('offline: falls back to the cached copy, and to the home page for navigation', async () => {
  const { handlers } = loadWorker({ online: false, cached: { '/app.js': 'CACHED-JS', '/': 'CACHED-HOME' } });
  assert.equal(await ask(handlers, request('/app.js')), 'CACHED-JS');
  assert.equal(await ask(handlers, request('/some/page', { mode: 'navigate' })), 'CACHED-HOME');
  assert.equal(await ask(handlers, request('/unknown.png')), 'ERROR');
});

test('cross-origin requests and non-GET requests are left to the browser', () => {
  const { handlers } = loadWorker();
  assert.equal(ask(handlers, { url: 'https://fonts.googleapis.com/css2', method: 'GET', mode: 'cors' }), undefined);
  assert.equal(ask(handlers, request('/ws', { method: 'POST' })), undefined);
});
