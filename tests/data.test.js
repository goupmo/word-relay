import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeWord } from '../shared/chars.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

test('dictionaries are non-empty and every entry is normalized', () => {
  for (const lang of ['ko', 'en']) {
    const words = read(`../public/data/dict-${lang}.json`);
    assert.ok(words.length > 10000, `${lang} dict too small: ${words.length}`);
    const bad = words.filter((w) => normalizeWord(w, lang) !== w);
    assert.deepEqual(bad.slice(0, 5), []);
  }
});

test('categories: 30+, named in both languages, words exist in dictionary', () => {
  const cats = read('../data/categories.json');
  assert.ok(cats.length >= 30);
  const dicts = { ko: new Set(read('../public/data/dict-ko.json')), en: new Set(read('../public/data/dict-en.json')) };
  const ids = new Set();
  for (const c of cats) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    for (const lang of ['ko', 'en']) {
      assert.ok(c[lang].name, `${c.id} ${lang} name`);
      assert.ok(c[lang].words.length >= 40, `${c.id} ${lang} has ${c[lang].words.length} words`);
      const missing = c[lang].words.filter((w) => !dicts[lang].has(w));
      assert.deepEqual(missing, [], `${c.id} ${lang}`);
    }
  }
});

test('SOURCES.md records the word list sources', () => {
  assert.ok(existsSync(new URL('../data/SOURCES.md', import.meta.url)));
});
