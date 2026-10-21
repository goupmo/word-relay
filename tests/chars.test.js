import test from 'node:test';
import assert from 'node:assert/strict';
import { KO_LETTERS, EN_LETTERS, normalizeWord, initialOf } from '../shared/chars.js';

test('letter sets have expected sizes', () => {
  assert.equal(KO_LETTERS.length, 14);
  assert.equal(EN_LETTERS.length, 23);
  for (const c of ['q', 'x', 'z']) assert.ok(!EN_LETTERS.includes(c));
});

test('normalizeWord rejects jamo-only, spaces, digits, emoji', () => {
  assert.equal(normalizeWord('ㅋㅋ', 'ko'), null);
  assert.equal(normalizeWord('가 나', 'ko'), null);
  assert.equal(normalizeWord('a1', 'en'), null);
  assert.equal(normalizeWord('😀', 'ko'), null);
  assert.equal(normalizeWord('가', 'ko'), null); // too short
});

test('normalizeWord trims and lowercases English', () => {
  assert.equal(normalizeWord('  Apple ', 'en'), 'apple');
});

test('normalizeWord converts NFD hangul to NFC', () => {
  const nfd = '사과'.normalize('NFD');
  assert.notEqual(nfd, '사과');
  assert.equal(normalizeWord(nfd, 'ko'), '사과');
});

test('initialOf folds double consonants', () => {
  assert.equal(initialOf('까치', 'ko'), 'ㄱ');
  assert.equal(initialOf('딸기', 'ko'), 'ㄷ');
  assert.equal(initialOf('아이', 'ko'), 'ㅇ');
});

test('initialOf english and excluded letters', () => {
  assert.equal(initialOf('apple', 'en'), 'a');
  assert.equal(initialOf('queen', 'en'), null);
});
