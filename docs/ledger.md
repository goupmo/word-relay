# ledger — plan: docs/superpowers/plans/2026-10-21-word-relay-online.md
Pre-flight: tasks share interfaces via shared/game.js, Dict {has}; consistent.
Task 1: complete (npm test -> 6/6 pass)
Ruling: npm script uses glob (node --test tests/*.test.js) because Node 24 rejects a directory arg — cost if wrong: none
Task 2: complete (npm test -> 9/9). Ruling: words need >=2 chars in both languages (one-syllable Korean nouns like 곰 excluded) - avoids accidental one-letter submissions; cost: some valid short words rejected. Ruling: Korean dict = kowiktionary titles minus words ending in 다 + category words (no nouns-only POS data available); objection voting covers errors.
Task 3: complete (npm test -> 21/21)
Task 4: complete (npm test -> 31/31). Ruling: vote resolves early once the outcome cannot change (majority reached or unreachable) - faster than waiting for all voters; cost if wrong: none. Ruling: each word can be challenged once (pending cleared after any vote).
Task 5: complete (npm test -> 50/50). Ruling: added host-only {t:'restart'} (done->lobby) and engine dropPlayer() (not in plan) - needed for disconnects/replay; cost: none. Ruling: server messages carry one 'event' {seq,type,...} per broadcast so clients can play sounds.
Ruling: moved server/rooms.js -> shared/rooms.js so single mode runs the same room engine in the browser with an AI player (one UI path for both modes); cost if wrong: none (pure move, tests green).
Task 6: complete (npm test -> 54/54; browser-verified: ko+en solo game, AI reply, timer ring + low-time state, key highlight, input clears on new round, mobile 375px layout).
Task 7: complete (browser-verified with two tabs: create -> invite link ?room= -> join -> start -> turn handoff -> client-side 'letter used' hint -> timeout -> final standings; wrong code shows error).
Ruling: pickBotWord(state, category, rand, blankChance=0.12) takes the room view's round (lang, usedLetters, usedWords) instead of an engine Round - cost: none.
Ruling: no auto-reconnect in online mode; a dropped socket already removes the player server-side, so the app returns to the start screen with a message (plan said retry every 3s) - cost: a flaky connection ends the game for that player.
Ruling: Enter handling = submit once after IME composition ends (compositionend) or immediately when not composing, 400ms duplicate guard - covers Chrome and Safari orders; NOT verified with a real Korean IME (automation types plain characters).
Ruling: added public/local.js (solo host: shared room engine + AI player in the browser).
Ruling: Kakao share uses the text template (no image needed); needs kakaoJsKey and a registered Web domain, NOT verifiable without the user's key.
Task 8: complete (ads.js no-ops without adfitUnitId; slots only on home/lobby/result; about+privacy pages served 200; hook findings fixed: removed 2 glow shadows, raised used-key and danger-button contrast). Ruling: privacy.html uses placeholder contact@example.com (user's real email not published without consent) - MUST be replaced before ad review; AdFit script injection NOT verified without an account.
Task 9: partial - render.yaml + README written; actual deploy, Kakao key and AdFit id need the user's accounts (stop condition: side effect outside this worktree).
