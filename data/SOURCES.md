# Word list sources

| Language | Source | License | Use |
|---|---|---|---|
| English | ENABLE word list (`enable1.txt`, https://github.com/dolph/dictionary) | Public domain | Dictionary check |
| Korean | Korean Wiktionary page titles, `kowiktionary-latest-all-titles-in-ns0` (https://dumps.wikimedia.org/kowiktionary/) | CC BY-SA 4.0 | Dictionary check (hangul words of 2+ syllables, entries ending in "다" removed) |
| Both | Category word lists, `scripts/make-categories.js` | Written for this project | Computer opponent words, always added to the dictionary |

Notes
- CC BY-SA requires attribution and that the word list itself stays under the same license. The attribution is shown on the About page (`public/about.html`). The game code is not part of that share-alike scope.
- Downloaded on 2026-10-21. Rebuild with `node scripts/build-dict.js --ko <file> --en <file>`.
- No audio, images, or card text from any commercial board game are used anywhere in this project.
