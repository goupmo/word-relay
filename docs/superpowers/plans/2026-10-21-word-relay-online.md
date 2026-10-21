# 단어 릴레이 배틀(가제) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한글/영어 단어 타이핑 턴제 게임을 싱글(서버 없이)과 2~4인 실시간 대전(카카오톡 초대)으로 만들고 배너 광고 자리를 단다.

**Architecture:** 게임 규칙은 `shared/`의 순수 JS 모듈 하나로 만들어 서버(권위 판정)와 브라우저(싱글 모드)가 똑같이 쓴다. Node.js + `ws` 서버가 정적 파일과 방/타이머/투표를 맡는다. 화면은 프레임워크 없는 바닐라 JS(ES modules)다.

**Tech Stack:** Node.js 20+, `ws`, `node:test`(내장), 바닐라 JS/CSS, Web Audio API, Kakao JS SDK, 카카오 애드핏.

**Spec:** `docs/superpowers/specs/2026-10-21-tapple-online-design.md`

## Global Constraints

- 게임 이름은 가제 "단어 릴레이 배틀"(코드명 `wordrelay`). "태플/Tapple/만두게임즈/한글판"을 코드, 문구, 파일명, 광고 문구 어디에도 쓰지 않는다.
- 그래픽, 카테고리 문구, 효과음은 전부 새로 만든다. 외부 이미지/음원은 라이선스를 `data/SOURCES.md`에 기록한 것만 쓴다.
- 지원 언어는 한글(`ko`)과 영어(`en`). UI 문구와 게임 언어는 같은 토글로 바꾼다.
- 플레이어 2~4인. 제한 시간 기본 10초, 설정에서 변경. 라운드 수 기본 5.
- 판정 순서: 첫 글자 검사 → 중복 검사 → 사전 검사. 사전에 없으면 탈락. 통과한 단어에는 이의제기 가능(과반 투표).
- 판정은 서버 한 곳에서만 한다(온라인). 싱글 모드는 브라우저에서 같은 `shared/` 모듈로 판정한다.
- 게임 진행 중에는 광고를 띄우지 않는다. 광고는 메인, 대기실, 라운드 결과 화면에만.
- 개인정보처리방침, 이용 안내, 문의처 페이지가 있어야 한다.
- 로그인, 랭킹, 인앱 결제는 만들지 않는다.

## Review Focus

1. 한글 입력에 자모만 있는 값("ㅋㅋ"), 숫자, 공백, 이모지, Mac식 분리 자모(NFD)가 들어옴 → NFC로 맞춘 뒤 완성형 음절이 아니면 거절한다. (Task 1)
2. 쌍자음으로 시작하는 단어("까치", "딸기") → 각각 ㄱ, ㄷ 글자로 계산한다. (Task 1)
3. 마감 시각이 지난 뒤 도착한 제출, 자기 차례가 아닌 사람의 제출 → 무시하고 상태를 바꾸지 않는다. (Task 3, 5)
4. 플레이어가 도중에 접속을 끊음 / 방장이 나감 → 그 사람은 탈락 처리되고 게임은 계속, 방장은 다음 사람에게 넘어간다. (Task 5)
5. 없는 방 코드, 꽉 찬 방, 이미 시작된 방, 같은 닉네임으로 입장 → 이유가 있는 오류를 돌려주고 방 상태는 그대로다. (Task 5)
6. 한글 입력 중 엔터를 치면 이벤트가 두 번 발생(IME 조합 중) → 한 번만 제출된다. (Task 6)

---

## File Structure

```
package.json, .gitignore
shared/chars.js        글자 집합, 단어 정규화, 첫 글자 계산
shared/game.js        한 라운드의 규칙(제출/시간초과/이의제기/투표), 매치 점수
data/categories.json  카테고리(한/영 이름 + 봇이 쓸 단어 목록)
data/SOURCES.md       단어 목록 출처와 라이선스
scripts/build-dict.js 원본 단어 목록 -> public/data/dict-{ko,en}.json
public/data/dict-*.json 사전(소문자/완성형 단어 배열)
server/rooms.js       방 관리, 타이머, 메시지 처리 (네트워크 없이 테스트 가능)
server/server.js      http 정적 서빙 + ws 연결을 rooms.js에 연결
public/index.html, style.css
public/app.js         화면 전환, 이벤트 연결
public/i18n.js        문구 사전(ko/en)
public/sfx.js         Web Audio 효과음, 음소거
public/bot.js         싱글 모드 컴퓨터 상대
public/net.js         WebSocket 클라이언트
public/config.js      kakaoJsKey, adfitUnitId (비어 있으면 해당 기능 숨김)
public/privacy.html, about.html
tests/*.test.js
```

---

### Task 1: 프로젝트 틀과 글자 규칙

**Files:**
- Create: `package.json`, `.gitignore`, `shared/chars.js`, `tests/chars.test.js`

**Interfaces:**
- Produces (`shared/chars.js`):
  - `KO_LETTERS: string[]` = `['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']`
  - `EN_LETTERS: string[]` = a~z에서 q, x, z를 뺀 23자(소문자). 어려운 글자를 뺀 것은 제 판단.
  - `normalizeWord(raw: string, lang: 'ko'|'en'): string | null` — NFC 정규화 후 앞뒤 공백 제거. ko는 `[가-힣]` 2자 이상, en은 `[a-z]` 2자 이상(소문자로 변환)만 통과, 아니면 `null`.
  - `initialOf(word: string, lang): string | null` — ko는 첫 음절의 초성(쌍자음은 ㄱㄷㅂㅅㅈ으로 접음), en은 첫 글자. 글자 집합에 없으면 `null`.

- [ ] **Step 1: `git init`, `package.json`(`"type":"module"`, 의존성 `ws`, scripts `test: node --test tests/`, `start: node server/server.js`), `.gitignore`(`node_modules`) 만들고 `npm install` 실행**
- [ ] **Step 2: Write the failing test `tests/chars.test.js`**: `normalizeWord('ㅋㅋ','ko')`, `normalizeWord('가 나','ko')`, `normalizeWord('a1','en')`, `normalizeWord('😀','ko')`가 모두 `null`(Review 1); `normalizeWord('  Apple ','en') === 'apple'`; NFD로 분해한 "사과"가 NFC "사과"로 통과; `initialOf('까치','ko') === 'ㄱ'`, `initialOf('딸기','ko') === 'ㄷ'`, `initialOf('아이','ko') === 'ㅇ'`(Review 2); `initialOf('queen','en') === null`.
- [ ] **Step 3: Run `npm test`, expect FAIL (module not found)**
- [ ] **Step 4: Implement `shared/chars.js`** — 초성은 `(code - 0xAC00) / 588` 인덱스로 구한다.
- [ ] **Step 5: Run `npm test`, expect PASS**
- [ ] **Step 6: Commit** `git add . && git commit -m "feat: chars rules"`

---

### Task 2: 사전과 카테고리 데이터

**Files:**
- Create: `scripts/build-dict.js`, `data/SOURCES.md`, `data/categories.json`, `public/data/dict-ko.json`, `public/data/dict-en.json`, `tests/data.test.js`

**Interfaces:**
- Consumes: `normalizeWord`, `initialOf` (Task 1)
- Produces:
  - `public/data/dict-{ko,en}.json`: 정규화된 고유 단어의 문자열 배열. 목표 크기는 언어당 gzip 3MB 이하.
  - `data/categories.json`: `[{ id: string, ko: { name: string, words: string[] }, en: { name: string, words: string[] } }]`, 30개 이상, 각 언어 `words`는 40개 이상이며 모두 해당 언어 사전에 들어 있다.
  - 사전 객체는 `Dict = { has(word: string): boolean }` 형태이며 Task 3에서 정의한다. 파일을 읽어 `new Set(words)`로 감싸 `has`를 만든다.

- [ ] **Step 1: Write the failing test `tests/data.test.js`**: 두 사전 파일이 비어 있지 않은 배열이고 모든 항목이 `normalizeWord`를 통과한다; `categories.json`이 30개 이상이며 모든 카테고리의 `words`가 해당 사전에 포함되고 한글/영어 이름이 비어 있지 않다; `SOURCES.md`가 존재한다.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement `scripts/build-dict.js`** — 입력은 사용자가 내려받은 원본 파일 경로(인자). 한글은 명사만(우리말샘 CC BY-SA 등 라이선스가 허용하는 자료를 기본 후보로 확인), 영어는 퍼블릭 도메인/자유 라이선스 단어 목록(SCOWL, ENABLE 등)을 후보로 하고, 선택한 자료의 이름·URL·라이선스를 `data/SOURCES.md`에 적는다. 사용하는 자료가 상업적 이용(광고 수익)을 허용하는지 먼저 확인하고, 허용하지 않으면 다른 자료를 쓴다.
- [ ] **Step 4: `categories.json`을 직접 작성** — 원작 카드 문구를 참고하지 말고 새로 짓는다.
- [ ] **Step 5: Run `npm test`, expect PASS**
- [ ] **Step 6: Commit**

---

### Task 3: 라운드 규칙 — 제출과 시간 초과

**Files:**
- Create: `shared/game.js`, `tests/game.test.js`

**Interfaces:**
- Consumes: `normalizeWord`, `initialOf`, `KO_LETTERS`, `EN_LETTERS` (Task 1)
- Produces (`shared/game.js`):
  - `type Dict = { has(word: string): boolean }`
  - `createRound(opts: { lang: 'ko'|'en', categoryId: string, playerIds: string[], timeLimitMs: number, now: number }): Round`
  - `Round = { lang, categoryId, players: {id: string, alive: boolean}[], turn: number, usedLetters: string[], usedWords: string[], deadline: number, pending: {playerId: string, word: string, letter: string} | null, vote: Vote | null, winners: string[] | null, timeLimitMs: number }`
  - `submitWord(round: Round, playerId: string, raw: string, dict: Dict, now: number): { ok: true } | { ok: false, reason: 'not_your_turn'|'too_late'|'invalid'|'letter_used'|'duplicate'|'not_in_dict' }` — `not_your_turn`, `too_late`(now > deadline), `invalid`은 상태를 바꾸지 않는다. `letter_used`, `duplicate`, `not_in_dict`는 제출자를 탈락시킨다. 성공하면 글자와 단어를 기록하고 `pending`을 채우고 다음 살아 있는 사람으로 턴을 넘기며 `deadline = now + timeLimitMs`.
  - `tick(round: Round, now: number): boolean` — 투표 중이 아니고 `now > deadline`이면 현재 차례를 탈락시키고 `true`.
  - 라운드는 살아 있는 사람이 1명 이하이거나 모든 글자가 쓰이면 끝나고 `winners`가 살아 있는 사람 id 목록이 된다.
  - `availableLetters(round: Round): string[]`

- [ ] **Step 1: Write the failing tests** — 이름과 단언:
  - `valid word passes and turn advances`: 성공 후 `turn`이 다음 사람, `usedLetters`에 글자 포함.
  - `used letter eliminates`, `duplicate word eliminates`, `unknown word eliminates`.
  - `wrong player is ignored`: `not_your_turn`이고 `players` 변화 없음(Review 3).
  - `late submit is ignored` (`now = deadline + 1`): `too_late`, 상태 변화 없음(Review 3).
  - `tick eliminates only after deadline`.
  - `last survivor wins` / `all letters used ends round with every survivor as winner`.
  - `eliminated players are skipped in turn order`.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** the signatures above.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit**

---

### Task 4: 이의제기 투표와 매치 점수

**Files:**
- Modify: `shared/game.js`, `tests/game.test.js`

**Interfaces:**
- Consumes: Task 3 전체
- Produces:
  - `type Vote = { objectorId: string, targetId: string, word: string, votes: Record<string, boolean>, deadline: number }`
  - `startObjection(round: Round, objectorId: string, now: number): { ok: true } | { ok: false, reason: 'no_pending'|'self'|'not_alive'|'too_few_players'|'already_voting' }` — 살아 있는 사람이 3명 미만이면 `too_few_players`(2인전은 이의제기 불가, 제 판단). 투표 시작 시 `deadline`을 멈추기 위해 남은 시간을 `vote.deadline`(8초 후)으로 따로 둔다. 이의를 낸 사람은 자동으로 찬성.
  - `castVote(round: Round, voterId: string, yes: boolean): boolean` — 살아 있고 제출자가 아니며 아직 투표 안 한 사람만 유효.
  - `resolveVote(round: Round, now: number): 'pending'|'upheld'|'rejected'` — 모든 투표자가 투표했거나 `vote.deadline`이 지나면 결과를 낸다. 찬성이 투표 자격자의 과반이면 `upheld`: 제출자 탈락, 그 단어와 글자를 다시 쓸 수 있게 되돌리고, 턴은 탈락자 다음의 살아 있는 사람으로 둔다. 동률/미투표는 반대. `rejected`면 원래 `deadline`을 남은 시간만큼 다시 이어 간다.
  - `createMatch(playerIds: string[], rounds: number): Match`, `recordRound(match: Match, winners: string[]): void`, `matchResult(match: Match): { scores: Record<string, number>, done: boolean, leaders: string[] }` — 라운드 우승자에게 각 1점.

- [ ] **Step 1: Write the failing tests**: `objection majority removes word and eliminates submitter and frees letter`; `tie keeps word`; `non-voters count as no after timeout`; `timer is paused during vote and resumes after rejected`; `two alive players cannot object`; `submitter cannot object or vote`; `scores add up and match done after N rounds`.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit**

---

### Task 5: 방 서버

**Files:**
- Create: `server/rooms.js`, `server/server.js`, `tests/rooms.test.js`

**Interfaces:**
- Consumes: `shared/game.js` 전체, `public/data/dict-*.json`, `data/categories.json`
- Produces:
  - `createRooms(deps: { dicts: Record<'ko'|'en', Dict>, categories: Category[], now: () => number, rand: () => number }): Rooms`
  - `Rooms.connect(send: (msg: object) => void): string` — 연결 id를 돌려준다.
  - `Rooms.handle(connId: string, msg: object): void`, `Rooms.disconnect(connId: string): void`, `Rooms.tick(): void`(1초마다 `server.js`가 호출, 시간 초과/투표 마감 처리).
  - 클라이언트 → 서버: `{t:'create', name, lang, maxPlayers: 2|3|4, timeLimitSec, rounds}`, `{t:'join', code, name}`, `{t:'start'}`(방장만, 2명 이상일 때), `{t:'submit', word}`, `{t:'object'}`, `{t:'vote', yes: boolean}`, `{t:'leave'}`.
  - 서버 → 클라이언트: `{t:'joined', code, you}`, `{t:'room', phase:'lobby'|'round'|'between'|'done', host, players, round?, match?}`(상태가 바뀔 때마다 방 전원에게 전체 상태 전송), `{t:'error', reason: 'no_room'|'room_full'|'already_started'|'name_taken'|'not_host'|'need_players'}`.
  - 방 코드는 혼동되는 글자(0, O, 1, I)를 뺀 대문자 5자.
  - 접속이 끊긴 사람은 라운드 중이면 탈락 처리하고, 방장이 나가면 다음 사람이 방장, 마지막 사람이 나가면 방 삭제.
- Produces (`server/server.js`): `PORT` 환경변수(기본 3000)로 `public/`을 정적 서빙하고 `/ws`에서 WebSocket을 받는다.

- [ ] **Step 1: Write the failing tests** (가짜 `send`와 가짜 `now`로): `create returns code and host in lobby`; `join with unknown code -> no_room`, `full room -> room_full`, `started room -> already_started`, `same name -> name_taken`, and the room state is unchanged after each (Review 5); `start needs host and 2 players`; `submit by wrong player is ignored` (Review 3); `tick after deadline eliminates and broadcasts`; `disconnect mid-round eliminates that player and game continues`, `host leaving transfers host` (Review 4); `last player leaving deletes the room`.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement `rooms.js`** — 방별 상태 하나를 단일 객체로 관리, 모든 변경 뒤에 `broadcast(room)`.
- [ ] **Step 4: Implement `server.js`** — `http.createServer`로 정적 파일, `ws`의 `WebSocketServer({ path: '/ws' })`를 `Rooms`에 연결, `setInterval(rooms.tick, 1000)`.
- [ ] **Step 5: Run `npm test`, expect PASS; `npm start`로 `http://localhost:3000` 응답 확인**
- [ ] **Step 6: Commit**

---

### Task 6: 화면, 효과음, 싱글 모드

**Files:**
- Create: `public/index.html`, `public/style.css`, `public/app.js`, `public/i18n.js`, `public/sfx.js`, `public/bot.js`, `public/config.js`, `tests/bot.test.js`

**Interfaces:**
- Consumes: `shared/*` (브라우저에서 `/shared/...`로 서빙: `server.js`가 `shared/` 폴더도 정적 경로로 연다), `categories.json`(서버가 `/data/categories.json`으로도 서빙), 사전 JSON.
- Produces:
  - `public/i18n.js`: `t(key: string): string`, `setLang(lang: 'ko'|'en'): void`.
  - `public/sfx.js`: `play(name: 'tap'|'tick'|'ok'|'fail'|'win'|'object'): void`, `setMuted(m: boolean): void` (Web Audio 합성음, 음소거 상태를 `localStorage`에 저장).
  - `public/bot.js`: `pickBotWord(round: Round, category: Category, rand: () => number): string | null` — 쓸 수 있는 글자로 시작하고 아직 안 쓰인 카테고리 단어를 고른다. 없으면 `null`(제출을 포기해 시간 초과로 탈락).
  - 화면: 메인(언어 토글, 싱글/방 만들기/방 입장) → 설정 → 게임판 → 결과.
  - 게임판: 카테고리 이름, 글자 버튼 판(쓰인 글자는 잠금 연출), 큰 타이머 링, 남은 시간이 3초 이하일 때 빨간 맥박과 `tick` 소리, 내 입력창, 플레이어 카드(탈락 표시), 직전 단어 말풍선과 이의제기 버튼.
  - 입력창 엔터는 `event.isComposing`이 `true`면 무시한다. 한 번만 제출된다(Review 6).
  - 제출 전에 글자 사용/중복 여부는 화면에서 미리 알려주고 서버에 보내지 않는다(실수로 탈락하는 것을 줄이려는 제 판단).

- [ ] **Step 1: Write the failing test `tests/bot.test.js`**: 사용된 글자로 시작하는 단어는 고르지 않는다; 이미 쓰인 단어는 고르지 않는다; 후보가 없으면 `null`.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement `bot.js`, `i18n.js`(ko/en 문구), `sfx.js`**
- [ ] **Step 4: Implement `index.html`, `style.css`, `app.js` 싱글 모드** — 봇은 1~4초 뒤에 낸다. 봇 단어도 `submitWord`를 거쳐 판정한다(사전 통과 단어만 봇 목록에 있으므로 정상 통과).
- [ ] **Step 5: Run `npm test`, expect PASS. 브라우저로 `http://localhost:3000`에서 직접 확인**: 한글/영어 각각 한 판, 타이머 맥박, 효과음, 음소거 유지, 한글 입력 후 엔터 1회 = 제출 1회, 모바일 폭(375px)에서 글자판이 깨지지 않는다.
- [ ] **Step 6: Commit**

---

### Task 7: 온라인 대전 클라이언트와 카카오 초대

**Files:**
- Create: `public/net.js`
- Modify: `public/app.js`, `public/index.html`, `public/style.css`, `public/config.js`

**Interfaces:**
- Consumes: Task 5의 프로토콜 전체, `public/config.js`의 `kakaoJsKey`
- Produces:
  - `public/net.js`: `connect(onMessage: (msg) => void): { send(msg: object): void, close(): void }` — 끊기면 3초 간격으로 재접속을 시도하고 화면에 "연결 끊김"을 알린다.
  - `public/config.js`: `export const config = { kakaoJsKey: '', adfitUnitId: '' }`
  - `inviteUrl(code: string): string` = `${location.origin}/?room=${code}`
  - 대기실: 방 코드, 참가자 목록, 방장만 보이는 시작 버튼(2명 이상), 링크 복사 버튼, 카카오톡 초대 버튼(`kakaoJsKey`가 있을 때만 보임, `Kakao.Share.sendDefault`의 feed 템플릿에 `inviteUrl`을 연결). 키가 없으면 링크 복사만 보인다.
  - `?room=CODE`로 접속하면 닉네임 입력 후 바로 입장한다. 입장 오류(`no_room` 등)는 번역된 문구로 보여준다.
  - 온라인 게임판은 Task 6의 게임판을 재사용하고, 입력은 서버로 보낸다. 타이머는 서버가 보내는 `deadline`과 `now` 차이로 표시한다.

- [ ] **Step 1: `net.js` 구현, 대기실/입장 화면 구현, 카카오 SDK `<script>` 추가(`kakaoJsKey`가 있으면 `Kakao.init`)**
- [ ] **Step 2: 수동 검증**: 브라우저 탭 두세 개로 방 만들기 → 링크로 입장 → 시작 → 서로 차례 넘기기 → 시간 초과 탈락 → 이의제기 투표(3인 이상) → 결과 화면; 한 탭을 닫으면 그 사람이 탈락하고 게임이 계속된다; 없는 방 코드로 들어가면 오류 문구가 보인다.
- [ ] **Step 3: Commit**

---

### Task 8: 광고 자리와 안내 페이지

**Files:**
- Create: `public/privacy.html`, `public/about.html`, `public/ads.js`
- Modify: `public/index.html`, `public/style.css`

**Interfaces:**
- Consumes: `config.adfitUnitId`
- Produces: `public/ads.js`의 `mountAds(): void` — `adfitUnitId`가 비어 있으면 아무것도 하지 않는다. 있으면 `.ad-slot` 요소(메인, 대기실, 라운드 결과 화면에만 존재)에 애드핏 스크립트를 붙인다. 게임판 화면에는 `.ad-slot`이 없다.

- [ ] **Step 1: 페이지 작성** — 게임 설명과 규칙, 개인정보처리방침(광고 쿠키 안내 포함), 문의 이메일, 푸터 링크. 원작을 언급하지 않는다.
- [ ] **Step 2: `ads.js` 구현, 광고 칸 3곳 추가** — 광고 칸 크기를 미리 잡아서 광고가 로드될 때 화면이 밀리지 않게 한다.
- [ ] **Step 3: 수동 검증**: 키가 비어 있으면 광고 칸이 보이지 않고, 게임판에 광고가 없다.
- [ ] **Step 4: Commit**

---

### Task 9: 배포와 최종 점검

**Files:**
- Create: `render.yaml`(또는 호스팅이 요구하는 설정 파일), `README.md`(배포와 키 입력 방법)

- [ ] **Step 1: 무료 호스팅(Render 기본)에 올리고 공개 주소를 받는다.** WebSocket이 `wss://`로 동작하는지 확인한다.
- [ ] **Step 2: 사용자가 카카오 개발자 사이트에서 앱 등록과 Web 플랫폼 주소 등록을 하고 JavaScript 키를 `config.js`에 넣는다.**
- [ ] **Step 3: 휴대폰 두 대와 PC로 3인 대전을 직접 해 본다**: 카카오톡 초대 링크로 입장, 한 판 완주.
- [ ] **Step 4: 출시 전 점검**: 이름/문구/그래픽에 원작 요소가 없는지, `data/SOURCES.md`의 라이선스가 상업 이용을 허용하는지, 개인정보처리방침이 광고 사용을 설명하는지 확인한다.
- [ ] **Step 5: Commit**

---

## Self-Review 결과

- 스펙 대비 빠진 것 없음: 규칙(T3~4), 한/영(T1~2, T6), 방+카카오 초대+실시간(T5, T7), 싱글(T6), 타이머/효과음/그래픽(T6), 이의제기(T4), 광고와 권리 배제(T8, T9, Global).
- 이름 일치 확인: `Round`, `Dict`, `Vote`, `createRound/submitWord/tick/startObjection/castVote/resolveVote`가 T3~T6에서 동일하다.
- 사전의 `loadDict` 언급은 T2 Interface에 있었으나 정의는 T5 `createRooms`의 `dicts`로 충분하므로 `Dict`(`has`)만 쓰도록 통일했다.
