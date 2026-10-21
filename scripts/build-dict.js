// Builds public/data/dict-{ko,en}.json from raw word lists plus the category words.
// Usage: node scripts/build-dict.js --ko <kowiktionary-all-titles-in-ns0> --en <enable1.txt>
// (see data/SOURCES.md for where the raw files come from)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { normalizeWord } from '../shared/chars.js';

const args = process.argv.slice(2);
const arg = (name) => args[args.indexOf(name) + 1];
const cats = JSON.parse(readFileSync(new URL('../data/categories.json', import.meta.url), 'utf8'));

function build(lang, file) {
  const set = new Set();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const w = normalizeWord(line, lang);
    if (!w) continue;
    // Korean titles are dictionary forms: drop verbs/adjectives (…다) to keep mostly nouns.
    if (lang === 'ko' && w.endsWith('다')) continue;
    set.add(w);
  }
  for (const c of cats) for (const w of c[lang].words) set.add(w);
  return [...set].sort();
}

mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
for (const lang of ['ko', 'en']) {
  const words = build(lang, arg(`--${lang}`));
  writeFileSync(new URL(`../public/data/dict-${lang}.json`, import.meta.url), JSON.stringify(words), 'utf8');
  console.log(`${lang}: ${words.length} words`);
}
