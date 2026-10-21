import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, submitWord, startObjection, castVote, resolveVote, dropPlayer } from '../shared/game.js';

const dict = { has: (w) => ['사자', '나비', '다람쥐'].includes(w) };
const LIMIT = 10000;
const mk = (ids) => createRound({ lang: 'ko', categoryId: 'x', playerIds: ids, timeLimitMs: LIMIT, now: 1000 });
const alive = (r) => r.players.filter((p) => p.alive).map((p) => p.id);

test('dropping the player whose turn it is passes the turn on', () => {
  const r = mk(['a', 'b', 'c']);
  dropPlayer(r, 'a', 5000);
  assert.deepEqual(alive(r), ['b', 'c']);
  assert.equal(r.players[r.turn].id, 'b');
  assert.equal(r.deadline, 5000 + LIMIT);
});

test('dropping someone else leaves the turn alone', () => {
  const r = mk(['a', 'b', 'c']);
  const d = r.deadline;
  dropPlayer(r, 'c', 5000);
  assert.deepEqual(alive(r), ['a', 'b']);
  assert.equal(r.players[r.turn].id, 'a');
  assert.equal(r.deadline, d);
});

test('dropping down to one survivor ends the round', () => {
  const r = mk(['a', 'b']);
  dropPlayer(r, 'b', 5000);
  assert.deepEqual(r.winners, ['a']);
});

test('dropping twice or an unknown id does nothing', () => {
  const r = mk(['a', 'b', 'c']);
  dropPlayer(r, 'c', 5000);
  const snap = JSON.stringify(r);
  dropPlayer(r, 'c', 6000);
  dropPlayer(r, 'nobody', 6000);
  assert.equal(JSON.stringify(r), snap);
});

test('dropping the target of a vote cancels the vote and restores the timer', () => {
  const r = mk(['a', 'b', 'c', 'd']);
  submitWord(r, 'a', '사자', dict, 2000); // deadline 12000, turn b
  startObjection(r, 'c', 2500);
  dropPlayer(r, 'a', 3000);
  assert.equal(r.vote, null);
  assert.equal(r.pending, null);
  assert.equal(r.deadline, 3000 + (12000 - 2500));
});

test('dropping the current-turn player during a vote advances the turn once the vote ends', () => {
  const r = mk(['a', 'b', 'c', 'd']);
  submitWord(r, 'a', '사자', dict, 2000); // turn b
  startObjection(r, 'c', 2500);
  dropPlayer(r, 'b', 3000);
  assert.equal(r.players[r.turn].id, 'b'); // paused
  castVote(r, 'd', false);
  assert.equal(resolveVote(r, 3100), 'rejected');
  assert.equal(r.players[r.turn].id, 'c');
  assert.equal(r.deadline, 3100 + LIMIT);
});
