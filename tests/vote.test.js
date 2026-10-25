import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRound, submitWord, tick, availableLetters, startObjection, castVote, resolveVote,
  createMatch, recordRound, matchResult,
} from '../shared/game.js';

const dict = { has: (w) => new Set(['사자', '나비', '다람쥐']).has(w) };
const LIMIT = 10000;
const mk = (ids) => createRound({ lang: 'ko', categoryId: 'animal', playerIds: ids, timeLimitMs: LIMIT, now: 1000 });
const alive = (r) => r.players.filter((p) => p.alive).map((p) => p.id);
// a plays 사자, then c objects at t=2500
const withObjection = (ids) => {
  const r = mk(ids);
  assert.deepEqual(submitWord(r, 'a', '사자', dict, 2000), { ok: true });
  assert.deepEqual(startObjection(r, 'c', 2500), { ok: true });
  return r;
};

test('objection majority removes word, eliminates submitter and frees the letter', () => {
  const r = withObjection(['a', 'b', 'c', 'd']);
  assert.equal(resolveVote(r, 2600), 'pending');
  assert.equal(castVote(r, 'd', true), true);
  assert.equal(resolveVote(r, 2700), 'upheld');
  assert.deepEqual(alive(r), ['b', 'c', 'd']);
  assert.deepEqual(r.usedWords, []);
  assert.ok(availableLetters(r).includes('ㅅ'));
  assert.equal(r.players[r.turn].id, 'b');
  assert.equal(r.deadline, 2700 + LIMIT);
  assert.equal(r.vote, null);
});

test('tie keeps the word', () => {
  const r = withObjection(['a', 'b', 'c', 'd', 'e']); // voters b,c,d,e -> need 3 yes
  castVote(r, 'd', true);
  castVote(r, 'b', false);
  castVote(r, 'e', false);
  assert.equal(resolveVote(r, 2700), 'rejected');
  assert.deepEqual(alive(r), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(r.usedWords, ['사자']);
});

test('non-voters count as no after the vote timeout', () => {
  const r = withObjection(['a', 'b', 'c', 'd']);
  assert.equal(resolveVote(r, r.vote.deadline - 1), 'pending');
  assert.equal(resolveVote(r, r.vote.deadline), 'rejected');
  assert.deepEqual(alive(r), ['a', 'b', 'c', 'd']);
});

test('turn timer is paused during the vote and resumes after rejection', () => {
  const r = withObjection(['a', 'b', 'c', 'd']);
  assert.equal(tick(r, 999999), false);
  const remaining = 12000 - 2500; // original deadline minus objection time
  const at = r.vote.deadline;
  resolveVote(r, at);
  assert.equal(r.deadline, at + remaining);
});

test('a word can only be objected to once', () => {
  const r = withObjection(['a', 'b', 'c', 'd']);
  resolveVote(r, r.vote.deadline);
  assert.deepEqual(startObjection(r, 'd', 99999), { ok: false, reason: 'no_pending' });
});

test('two alive players cannot object', () => {
  const r = mk(['a', 'b']);
  submitWord(r, 'a', '사자', dict, 2000);
  assert.deepEqual(startObjection(r, 'b', 2500), { ok: false, reason: 'too_few_players' });
});

test('with two players left a flagged word can still be challenged, and the opponent decides', () => {
  const r = mk(['a', 'b']);
  assert.deepEqual(submitWord(r, 'a', '가나다라', dict, 2000), { ok: true, unverified: true });
  assert.deepEqual(startObjection(r, 'b', 2500), { ok: true });
  assert.equal(resolveVote(r, 2600), 'upheld');
  assert.deepEqual(r.winners, ['b']);
});

test('submitter cannot object or vote; others cannot object twice', () => {
  const r = mk(['a', 'b', 'c']);
  submitWord(r, 'a', '사자', dict, 2000);
  assert.deepEqual(startObjection(r, 'a', 2500), { ok: false, reason: 'self' });
  assert.deepEqual(startObjection(r, 'zzz', 2500), { ok: false, reason: 'not_alive' });
  assert.deepEqual(startObjection(r, 'b', 2500), { ok: true });
  assert.deepEqual(startObjection(r, 'c', 2600), { ok: false, reason: 'already_voting' });
  assert.equal(castVote(r, 'a', true), false);
  assert.equal(castVote(r, 'b', false), false); // objector already voted yes
});

test('no objection without a pending word', () => {
  const r = mk(['a', 'b', 'c']);
  assert.deepEqual(startObjection(r, 'b', 2000), { ok: false, reason: 'no_pending' });
});

test('words cannot be submitted during a vote', () => {
  const r = withObjection(['a', 'b', 'c', 'd']);
  assert.deepEqual(submitWord(r, 'b', '나비', dict, 2600), { ok: false, reason: 'not_your_turn' });
});

test('scores add up and match is done after N rounds', () => {
  const m = createMatch(['a', 'b', 'c'], 2);
  recordRound(m, ['a']);
  assert.deepEqual(matchResult(m), { scores: { a: 1, b: 0, c: 0 }, done: false, leaders: ['a'] });
  recordRound(m, ['b', 'c']);
  assert.deepEqual(matchResult(m), { scores: { a: 1, b: 1, c: 1 }, done: true, leaders: ['a', 'b', 'c'] });
});
