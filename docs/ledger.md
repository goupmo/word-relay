# ledger — plan: docs/superpowers/plans/2026-10-21-word-relay-online.md
Pre-flight: tasks share interfaces via shared/game.js, Dict {has}; consistent.
Task 1: complete (npm test -> 6/6 pass)
Ruling: npm script uses glob (node --test tests/*.test.js) because Node 24 rejects a directory arg — cost if wrong: none
Task 2: complete (npm test -> 9/9). Ruling: words need >=2 chars in both languages (one-syllable Korean nouns like 곰 excluded) - avoids accidental one-letter submissions; cost: some valid short words rejected. Ruling: Korean dict = kowiktionary titles minus words ending in 다 + category words (no nouns-only POS data available); objection voting covers errors.
