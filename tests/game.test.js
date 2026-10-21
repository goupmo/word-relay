import test from 'node:test';
import assert from 'node:assert/strict';
import { KO_LETTERS } from '../shared/chars.js';
import { createRound, submitWord, tick, availableLetters } from '../shared/game.js';

const dict = { has: (w) => new Set(['사자', '사과', '호랑이', '나비', '다람쥐', '라마', '바나나', '마늘']).has(w) };
const LIMIT = 10000;
const mk = (ids = ['a', 'b', 'c'], now = 1000) =>
  createRound({ lang: 'ko', categoryId: 'animal', playerIds: ids, timeLimitMs: LIMIT, now });
const alive = (r) => r.players.filter((p) => p.alive).map((p) => p.id);

test('valid word passes and turn advances', () => {
  const r = mk();
  assert.deepEqual(submitWord(r, 'a', '사자', dict, 2000), { ok: true });
  assert.equal(r.players[r.turn].id, 'b');
  assert.deepEqual(r.usedLetters, ['ㅅ']);
  assert.deepEqual(r.pending, { playerId: 'a', word: '사자', letter: 'ㅅ' });
  assert.equal(r.deadline, 2000 + LIMIT);
});

test('used letter eliminates', () => {
  const r = mk();
  submitWord(r, 'a', '사자', dict, 2000);
  assert.deepEqual(submitWord(r, 'b', '사과', dict, 3000), { ok: false, reason: 'letter_used' });
  assert.deepEqual(alive(r), ['a', 'c']);
  assert.equal(r.players[r.turn].id, 'c');
});

test('duplicate word eliminates', () => {
  const r = mk();
  r.usedWords.push('나비'); // letter ㄴ itself is still free
  assert.deepEqual(submitWord(r, 'a', '나비', dict, 2000), { ok: false, reason: 'duplicate' });
  assert.deepEqual(alive(r), ['b', 'c']);
});

test('unknown word eliminates', () => {
  const r = mk();
  assert.deepEqual(submitWord(r, 'a', '가나다라', dict, 2000), { ok: false, reason: 'not_in_dict' });
  assert.deepEqual(alive(r), ['b', 'c']);
});

test('wrong player is ignored', () => {
  const r = mk();
  const before = JSON.stringify(r);
  assert.deepEqual(submitWord(r, 'b', '사자', dict, 2000), { ok: false, reason: 'not_your_turn' });
  assert.equal(JSON.stringify(r), before);
});

test('late submit is ignored', () => {
  const r = mk();
  const before = JSON.stringify(r);
  assert.deepEqual(submitWord(r, 'a', '사자', dict, r.deadline + 1), { ok: false, reason: 'too_late' });
  assert.equal(JSON.stringify(r), before);
});

test('invalid input is ignored without penalty', () => {
  const r = mk();
  const before = JSON.stringify(r);
  assert.deepEqual(submitWord(r, 'a', 'ㅋㅋ', dict, 2000), { ok: false, reason: 'invalid' });
  assert.equal(JSON.stringify(r), before);
});

test('tick eliminates only after the deadline', () => {
  const r = mk();
  assert.equal(tick(r, r.deadline), false);
  assert.deepEqual(alive(r), ['a', 'b', 'c']);
  const d = r.deadline;
  assert.equal(tick(r, d + 1), true);
  assert.deepEqual(alive(r), ['b', 'c']);
  assert.equal(r.players[r.turn].id, 'b');
  assert.equal(r.deadline, d + 1 + LIMIT);
});

test('last survivor wins', () => {
  const r = mk(['a', 'b']);
  submitWord(r, 'a', '사자', dict, 2000);
  submitWord(r, 'b', '가나다라', dict, 3000);
  assert.deepEqual(r.winners, ['a']);
  assert.deepEqual(submitWord(r, 'a', '나비', dict, 4000), { ok: false, reason: 'not_your_turn' });
});

test('all letters used ends round with every survivor as winner', () => {
  const r = mk(['a', 'b']);
  r.usedLetters = KO_LETTERS.filter((l) => l !== 'ㅅ');
  assert.deepEqual(availableLetters(r), ['ㅅ']);
  submitWord(r, 'a', '사자', dict, 2000);
  assert.deepEqual(r.winners, ['a', 'b']);
});

test('eliminated players are skipped in turn order', () => {
  const r = mk();
  submitWord(r, 'a', '사자', dict, 2000);
  tick(r, r.deadline + 1); // b times out
  submitWord(r, 'c', '나비', dict, r.deadline - 1);
  assert.equal(r.players[r.turn].id, 'a');
});

test('elimination clears the pending word', () => {
  const r = mk();
  submitWord(r, 'a', '사자', dict, 2000);
  tick(r, r.deadline + 1);
  assert.equal(r.pending, null);
});
