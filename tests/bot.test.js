import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBotWord } from '../public/bot.js';
import { initialOf } from '../shared/chars.js';

const category = { words: ['사자', '사과', '나비', '다람쥐', '라마'] };
const state = (extra) => ({ lang: 'ko', usedLetters: [], usedWords: [], ...extra });
const always = () => 0.5; // never the "give up" roll, picks the middle candidate

test('never picks a word that starts with a used letter', () => {
  const s = state({ usedLetters: ['ㅅ', 'ㄴ'] });
  for (let i = 0; i < 20; i++) {
    const w = pickBotWord(s, category, Math.random, 0);
    assert.ok(w === null || !s.usedLetters.includes(initialOf(w, 'ko')), w);
  }
});

test('never picks a word that was already played', () => {
  const s = state({ usedWords: ['다람쥐', '라마', '나비'], usedLetters: ['ㄷ', 'ㄹ', 'ㄴ'] });
  const picks = new Set();
  for (let i = 0; i < 30; i++) picks.add(pickBotWord(s, category, Math.random, 0));
  assert.ok(![...picks].some((w) => ['다람쥐', '라마', '나비'].includes(w)));
});

test('returns null when no candidate is left', () => {
  const s = state({ usedLetters: ['ㅅ', 'ㄴ', 'ㄷ', 'ㄹ'] });
  assert.equal(pickBotWord(s, category, always, 0), null);
});

test('can blank out on purpose so the AI is beatable', () => {
  assert.equal(pickBotWord(state(), category, () => 0.05, 0.1), null);
  assert.notEqual(pickBotWord(state(), category, () => 0.5, 0.1), null);
});
