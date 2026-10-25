import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocal } from '../public/local.js';

const categories = [{ id: 'c', ko: { name: '동물', words: ['사자', '나비', '다람쥐', '라마'] }, en: { name: 'x', words: ['lion'] } }];
const data = { categories, dicts: { ko: new Set(['사자', '나비', '다람쥐', '라마', '가방']), en: new Set() } };
const OPTS = { t: 'create', name: 'A', lang: 'ko', maxPlayers: 4, timeLimitSec: 20, rounds: 1 };

function start(extra, ai) {
  const views = [];
  const local = createLocal(data, (m) => m.t === 'room' && views.push(m), { extra, ai });
  local.send(OPTS);
  return new Promise((resolve) => setTimeout(() => resolve({ local, last: () => views.at(-1) }), 50));
}

test('hot-seat without AI: humans only, submit is made by whoever is on turn', async () => {
  const { local, last } = await start(['B', 'C'], false);
  assert.deepEqual(last().players.map((p) => p.name), ['A', 'B', 'C']);
  assert.equal(last().phase, 'round');
  const first = last().round.turnId;
  assert.ok(local.isHuman(first));
  local.send({ t: 'submit', word: '사자' });
  assert.notEqual(last().round.turnId, first);
  assert.equal(last().round.pending.word, '사자');
  local.close();
});

test('with AI the AI is the last player and is not a human', async () => {
  const { local, last } = await start(['B'], true);
  const ids = last().players;
  assert.deepEqual(ids.map((p) => p.name), ['A', 'B', 'AI']);
  assert.equal(local.isHuman(ids[2].id), false);
  local.close();
});

test('the AI votes: it challenges a word that is not on its category list', async () => {
  const { local, last } = await start(['B'], true);
  while (last().round.turnId !== last().players[0].id) await new Promise((r) => setTimeout(r, 50));
  local.send({ t: 'submit', word: '가방' }); // in the dictionary, not a "동물"
  local.send({ t: 'object' });
  assert.ok(last().round.vote);
  local.send({ t: 'vote', yes: true });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(last().round.vote, null);
  assert.equal(last().players[0].alive, false);
  local.close();
});

test('objection is raised by a human who did not submit, votes go to humans one by one', async () => {
  const { local, last } = await start(['B', 'C'], false);
  local.send({ t: 'submit', word: '사자' });
  const author = last().round.pending.playerId;
  const objector = local.objectorId(last());
  assert.ok(objector && objector !== author);
  local.send({ t: 'object' });
  const v = last().round.vote;
  assert.equal(v.objectorId, objector);
  const voter = local.voterId(last());
  assert.ok(voter && voter !== v.targetId && !(voter in v.votes));
  local.send({ t: 'vote', yes: true });
  assert.equal(last().round.vote, null); // 2 of 2 eligible voters said yes
  local.close();
});
