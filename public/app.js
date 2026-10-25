import { t, setLang, getLang } from './i18n.js';
import { play, setMuted, isMuted, unlock } from './sfx.js';
import { connect } from './net.js';
import { createLocal } from './local.js';
import { config } from './config.js';
import { mountAds } from './ads.js';
import { KO_LETTERS, EN_LETTERS, normalizeWord, initialOf } from '../shared/chars.js';

const $ = (id) => document.getElementById(id);
const RING = 326.73;
const DICT_VERSION = 2; // 2: one-letter words allowed
const COLORS = ['#ffc83d', '#5cc8ff', '#ff8fab', '#7ee8a5'];
const lettersOf = (lang) => (lang === 'ko' ? KO_LETTERS : EN_LETTERS);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

const st = {
  mode: null, // 'single' | 'online'
  setupMode: null, // 'single' | 'create' | 'join'
  transport: null, view: null, offset: 0, you: null, code: null, names: {},
  seenSeq: 0, prevPhase: null, keysLang: null, lastSecond: null,
  lastSubmit: 0, composing: false, submitAfterComposition: false, wasMyTurn: false, localData: null,
};

/* ---------- small helpers ---------- */
let toastTimer;
function toast(msg, bad = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
const nameOf = (id) => st.names[id] ?? '?';
function show(screen) {
  document.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.id !== `s-${screen}`; });
  window.scrollTo(0, 0);
  setTimeout(mountAds, 0);
}
const currentScreen = () => [...document.querySelectorAll('[data-screen]')].find((e) => !e.hidden)?.id.slice(2);

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.title = t('title');
  $('btn-lang').textContent = t('langBtn');
  $('btn-mic').textContent = '🎤';
  $('btn-mic').setAttribute('aria-label', t('mic'));
  $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', isMuted() ? t('unmute') : t('mute'));
  for (const o of $('f-time').options) o.textContent = `${o.value}${t('sec')}`;
  for (const o of $('f-rounds').options) o.textContent = `${o.value}${t('roundsUnit')}`;
  for (const o of $('f-max').options) o.textContent = `${o.value}${t('people')}`;
  renderHeroKeys();
  if (st.setupMode) setupLabels();
  if (st.view) render(st.view);
}

/* ---------- keycaps ---------- */
function renderHeroKeys() {
  const sample = getLang() === 'ko' ? ['ㅅ', 'ㅇ', 'ㄱ', 'ㅈ', 'ㅎ'] : ['w', 'o', 'r', 'd', 's'];
  $('hero-keys').innerHTML = sample.map((c, i) => `<span class="key${i === 1 || i === 3 ? ' used' : ''}">${c}</span>`).join('');
}
function buildKeys(lang) {
  if (st.keysLang === lang) return;
  st.keysLang = lang;
  const letters = lettersOf(lang);
  $('keys').style.setProperty('--cols', lang === 'ko' ? 7 : 8);
  $('keys').innerHTML = letters.map((l) => `<span class="key" data-l="${l}">${lang === 'ko' ? l : l.toUpperCase()}</span>`).join('');
}

/* ---------- rendering ---------- */
function avatar(name, i) {
  return `<span class="avatar" style="--c:${COLORS[i % COLORS.length]}">${esc([...name][0] ?? '?').toUpperCase()}</span>`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const offline = () => st.mode === 'single' || st.mode === 'hotseat';
// Who is acting on this screen: online it is this player; on a shared device it is whoever's turn it is.
const youId = (v) => (st.mode === 'hotseat' ? (st.transport.isHuman(v.round?.turnId) ? v.round.turnId : null) : st.you);

function render(v) {
  if (v.phase === 'lobby') {
    if (offline()) return; // offline games start immediately; never show the lobby
    renderLobby(v);
    if (currentScreen() !== 'lobby') show('lobby');
  } else {
    renderGame(v);
    if (currentScreen() !== 'game') show('game');
  }
}

function renderLobby(v) {
  $('lobby-code').textContent = v.code;
  $('lobby-players').innerHTML = v.players.map((p, i) =>
    `<li>${avatar(p.name, i)}<span>${esc(p.name)}${p.id === st.you ? ` (${t('you')})` : ''}</span>${p.id === v.host ? `<span class="tag">${t('host')}</span>` : ''}</li>`).join('');
  const isHost = v.host === st.you;
  $('lobby-start').hidden = !isHost;
  $('lobby-start').disabled = v.players.length < 2;
  $('lobby-note').style.color = 'var(--muted)';
  $('lobby-note').textContent = v.players.length < 2 ? t('waitMore') : isHost ? '' : t('waitHost');
  $('btn-kakao').hidden = !config.kakaoJsKey;
  $('btn-share').hidden = !navigator.share;
}

function renderGame(v) {
  const lang = v.settings.lang;
  buildKeys(lang);
  const r = v.round;
  const you = youId(v);
  const me = v.players.find((p) => p.id === you);
  const aliveCount = v.players.filter((p) => p.alive).length;
  const myTurn = v.phase === 'round' && r.turnId === you && !r.vote && !!me?.alive;

  $('players').innerHTML = v.players.map((p, i) =>
    `<div class="player${p.id === r.turnId ? ' turn' : ''}${p.alive ? '' : ' out'}">${avatar(p.name, i)}<div class="pinfo"><div class="pname">${esc(p.name)}</div><div class="pscore">★ ${p.score}</div></div></div>`).join('');
  const roundKey = `${v.match.played}:${v.category.id}`;
  if (roundKey !== st.roundKey) { st.roundKey = roundKey; $('word').value = ''; } // new round: drop any unsent text
  $('round-no').textContent = t('round', Math.min(v.match.rounds, v.match.played + (v.phase === 'round' ? 1 : 0)), v.match.rounds);
  $('cat-name').textContent = v.category.name;

  const whose = $('whose');
  whose.textContent = v.phase !== 'round' ? '' : myTurn && st.mode !== 'hotseat' ? t('yourTurn') : t('turnOf', nameOf(r.turnId));
  whose.classList.toggle('mine', myTurn);

  const canObject = v.phase === 'round' && !!r.pending && !r.vote && aliveCount >= 3 &&
    (st.mode === 'hotseat' ? st.transport.objectorId(v) !== null : r.pending.playerId !== you && !!me?.alive);
  $('bubble').hidden = !r.pending;
  if (r.pending) $('bubble-text').innerHTML = `${esc(r.pending.word)} <span class="who">${esc(nameOf(r.pending.playerId))}</span>`;
  $('btn-object').hidden = !canObject;

  for (const k of $('keys').children) k.classList.toggle('used', r.usedLetters.includes(k.dataset.l));
  syncLit();

  $('word').disabled = !myTurn;
  $('btn-submit').disabled = !myTurn;
  if (myTurn && st.wasMyTurn !== r.turnId && !micOn) { $('word').focus({ preventScroll: true }); }
  if (st.wasMyTurn !== (myTurn ? r.turnId : false) || v.phase !== 'round') cands = []; // new turn: forget old candidates
  st.wasMyTurn = myTurn ? r.turnId : false;
  renderCands();
  if (!myTurn) $('hint').textContent = '';

  renderVote(v, me);
  renderBetween(v);
}

function renderVote(v, me) {
  const vote = v.round.vote;
  $('vote').hidden = !vote;
  if (!vote) return;
  $('vote-title').textContent = t('voteTitle', vote.word);
  const voter = st.mode === 'hotseat' ? st.transport.voterId(v) : st.you;
  const eligible = st.mode === 'hotseat' ? voter !== null : !!me?.alive && st.you !== vote.targetId && !(st.you in vote.votes);
  $('vote-buttons').hidden = !eligible;
  $('vote-state').textContent = !eligible ? t('voted') : st.mode === 'hotseat' ? t('voterTurn', nameOf(voter)) : '';
}

function renderBetween(v) {
  const over = v.phase === 'between' || v.phase === 'done';
  $('between').hidden = !over;
  if (!over) return;
  setTimeout(mountAds, 0);
  const sorted = [...v.players].sort((a, b) => b.score - a.score);
  let title;
  if (v.phase === 'between') {
    const names = (v.round.winners ?? []).map(nameOf);
    title = names.length === 1 ? t('roundWinner', names[0]) : names.length ? t('roundWinners', names.join(', ')) : '';
  } else {
    const best = sorted[0]?.score ?? 0;
    const names = sorted.filter((p) => p.score === best).map((p) => p.name);
    title = names.length === 1 ? t('champion', names[0]) : t('champions', names.join(', '));
  }
  $('between-title').textContent = title;
  const roundWinners = v.round.winners ?? [];
  $('between-rank').innerHTML = sorted.map((p) =>
    `<li class="${v.phase === 'between' && roundWinners.includes(p.id) ? 'win' : ''}">${avatar(p.name, v.players.findIndex((x) => x.id === p.id))}<span>${esc(p.name)}</span><span class="pts">★ ${p.score}</span></li>`).join('');
  const done = v.phase === 'done';
  const canRestart = offline() || v.host === st.you;
  $('between-next').hidden = done;
  $('between-actions').hidden = !done;
  $('end-again').hidden = !canRestart;
  $('end-wait').hidden = !(done && !canRestart);
  $('end-wait').textContent = t('waitAgain');
}

/* ---------- events, sounds ---------- */
function handleEvent(v) {
  const e = v.event;
  if (e && e.seq > st.seenSeq) {
    st.seenSeq = e.seq;
    if (e.type === 'word') play('ok');
    else if (e.type === 'out') { play('fail'); toast(t(`out_${e.reason}`, nameOf(e.playerId)), true); }
    else if (e.type === 'vote_start') play('object');
    else if (e.type === 'vote_result') { play(e.result === 'upheld' ? 'ok' : 'fail'); toast(e.result === 'upheld' ? t('voteUpheld') : t('voteRejected')); }
  }
  if ((v.phase === 'between' || v.phase === 'done') && st.prevPhase === 'round' && (st.mode === 'hotseat' ? v.round.winners?.length : v.round.winners?.includes(st.you))) play('win');
  st.prevPhase = v.phase;
}

/* ---------- connection ---------- */
function onMessage(msg) {
  if (msg.t === 'joined') {
    st.you = msg.you; st.code = msg.code; st.seenSeq = 0; st.prevPhase = null; st.names = {};
    if (location.search) history.replaceState(null, '', '/');
  } else if (msg.t === 'error') {
    const text = t(`err_${msg.reason}`);
    if (currentScreen() === 'setup') $('setup-msg').textContent = text; else toast(text, true);
  } else if (msg.t === 'room') {
    for (const p of msg.players) st.names[p.id] = p.name;
    st.view = msg;
    st.offset = msg.serverNow - Date.now();
    handleEvent(msg);
    render(msg);
  }
}

function endSession() {
  micStop();
  st.transport?.close();
  Object.assign(st, { transport: null, view: null, mode: null, you: null, code: null, wasMyTurn: false });
  $('vote').hidden = true;
  $('between').hidden = true;
  show('home');
}
function leaveRoom() {
  st.transport?.send({ t: 'leave' });
  endSession();
}

async function loadLocalData(lang) {
  if (!st.localData) {
    const categories = await (await fetch('/data/categories.json')).json();
    st.localData = { categories, dicts: { ko: { has: () => false }, en: { has: () => false } } };
  }
  if (!st.localData.loaded?.[lang]) {
    // Bump DICT_VERSION whenever the word lists change: the files are cached for a day.
    const words = await (await fetch(`/data/dict-${lang}.json?v=${DICT_VERSION}`)).json();
    st.localData.dicts[lang] = new Set(words);
    (st.localData.loaded ??= {})[lang] = true;
  }
  return st.localData;
}

/* ---------- setup form ---------- */
function setupLabels() {
  const m = st.setupMode;
  $('setup-title').textContent = t(m === 'single' ? 'single' : m);
  $('setup-go').textContent = t(m === 'single' || m === 'hotseat' ? 'singleGo' : m === 'create' ? 'createGo' : 'joinGo');
  $('name-label').textContent = m === 'hotseat' ? `${t('name')} 1` : t('name');
}
function syncHumans() {
  const n = +$('f-humans').value;
  $('row-n3').hidden = n < 3;
  $('row-n4').hidden = n < 4;
}
function openSetup(mode, code = '') {
  st.setupMode = mode;
  setupLabels();
  $('f-name').value = store.get('name') ?? '';
  $('f-code').value = code;
  $('f-code').readOnly = !!code;
  $('row-code').hidden = mode !== 'join';
  $('row-max').hidden = mode !== 'create';
  $('row-time').hidden = mode === 'join';
  $('row-rounds').hidden = mode === 'join';
  for (const id of ['row-humans', 'row-names', 'row-ai']) $(id).hidden = mode !== 'hotseat';
  syncHumans();
  $('setup-msg').textContent = '';
  show('setup');
  $('f-name').focus();
}

$('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  unlock();
  const name = $('f-name').value.trim();
  if (!name) { $('setup-msg').textContent = t('err_bad_name'); return; }
  store.set('name', name);
  const lang = getLang();
  const opts = { name, lang, maxPlayers: +$('f-max').value, timeLimitSec: +$('f-time').value, rounds: +$('f-rounds').value };
  $('setup-msg').textContent = '';
  if (st.transport) endSession2();
  if (st.setupMode === 'single' || st.setupMode === 'hotseat') {
    const hot = st.setupMode === 'hotseat';
    const n = hot ? +$('f-humans').value : 1;
    const ai = hot ? $('f-ai').checked : true;
    const names = [name, ...[2, 3, 4].slice(0, n - 1).map((i) => $(`f-n${i}`).value.trim() || t('player', i))];
    if (ai && n > 3) { $('setup-msg').textContent = t('aiMax'); return; }
    const lower = names.map((x) => x.toLowerCase());
    if (new Set(lower).size < names.length || (ai && lower.includes('ai'))) { $('setup-msg').textContent = t('dupNames'); return; }
    $('setup-go').disabled = true;
    $('setup-msg').textContent = t('loading');
    try {
      const data = await loadLocalData(lang);
      st.mode = hot ? 'hotseat' : 'single';
      st.transport = createLocal(data, onMessage, { extra: names.slice(1), ai });
      st.transport.send({ t: 'create', ...opts, maxPlayers: names.length + (ai ? 1 : 0) });
      $('setup-msg').textContent = '';
    } catch {
      $('setup-msg').textContent = t('err_invalid');
    } finally {
      $('setup-go').disabled = false;
    }
    return;
  }
  st.mode = 'online';
  st.transport = connect(onMessage, () => { toast(t('disconnected'), true); endSession(); });
  if (st.setupMode === 'create') st.transport.send({ t: 'create', ...opts });
  else st.transport.send({ t: 'join', code: $('f-code').value.trim().toUpperCase(), name });
});
function endSession2() { st.transport?.close(); st.transport = null; }

/* ---------- game input ---------- */
function myTurnNow() {
  const v = st.view;
  return !!v && v.phase === 'round' && v.round.turnId === youId(v) && !v.round.vote;
}
function setHint(text) { $('hint').textContent = text; }

function submitWord() {
  if (!myTurnNow()) return;
  const now = Date.now();
  if (now - st.lastSubmit < 400) return; // Enter + button + IME can all fire for one press
  const v = st.view;
  const lang = v.settings.lang;
  const word = normalizeWord($('word').value, lang);
  if (!word) return setHint(lang === 'ko' ? t('hintInvalid') : t('hintInvalidEn'));
  const letter = initialOf(word, lang);
  if (!letter) return setHint(t('hintNoLetter'));
  if (v.round.usedLetters.includes(letter)) return setHint(t('hintUsed'));
  if (v.round.usedWords.includes(word)) return setHint(t('hintDup'));
  st.lastSubmit = now;
  setHint('');
  play('tap');
  st.transport.send({ t: 'submit', word });
  $('word').value = '';
  clearCandidates();
  syncLit();
}

function syncLit() {
  const v = st.view;
  const lang = v?.settings.lang;
  const raw = $('word').value.trim();
  const letter = lang && raw ? initialOf(raw.normalize('NFC'), lang) : null;
  for (const k of $('keys').children) k.classList.toggle('lit', !!letter && k.dataset.l === letter && !k.classList.contains('used'));
  if (v && myTurnNow()) {
    const word = normalizeWord(raw, lang);
    setHint(letter && v.round.usedLetters.includes(letter) ? t('hintUsed') : word && v.round.usedWords.includes(word) ? t('hintDup') : '');
  }
}

/* ---------- voice input (browser speech recognition) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
// What the speech engine heard becomes tappable candidates; nothing is submitted until one is tapped.
let cands = [];
function addCandidates(alts, lang) {
  const found = [];
  for (const a of alts) {
    const tokens = a.trim().split(/\s+/);
    for (const s of lang === 'ko' ? [tokens.join(''), ...tokens] : tokens) {
      const w = normalizeWord(s, lang);
      if (w && !found.includes(w)) found.push(w);
    }
  }
  cands = [...found, ...cands.filter((w) => !found.includes(w))].slice(0, 8);
}
function renderCands() {
  const v = st.view;
  const box = $('cands');
  box.hidden = !cands.length || !v?.round;
  if (box.hidden) return;
  box.innerHTML = cands.map((w) => {
    const l = initialOf(w, v.settings.lang);
    const bad = !l || v.round.usedLetters.includes(l) || v.round.usedWords.includes(w);
    return `<button type="button" class="cand${bad ? ' bad' : ''}" data-w="${esc(w)}"${bad ? ' disabled' : ''}>${esc(w)}</button>`;
  }).join('');
}
$('cands').addEventListener('click', (e) => {
  const b = e.target.closest('.cand');
  if (!b) return;
  $('word').value = b.dataset.w;
  submitWord();
});
function clearCandidates() {
  cands = [];
  renderCands();
}
// Stays on until the player turns it off; the browser ends a session after silence, so it is restarted.
let micOn = false;
function micUi() {
  $('btn-mic').classList.toggle('on', micOn);
  $('btn-mic').setAttribute('aria-label', t(micOn ? 'micOff' : 'mic'));
  // While listening, the on-screen keyboard stays down; turn the mic off to type.
  $('word').inputMode = micOn ? 'none' : 'text';
  if (micOn) $('word').blur();
}
function micStop() {
  micOn = false;
  recognition?.abort();
  micUi();
}
function micListen() {
  if (!micOn || recognition) return;
  const rec = new SR();
  recognition = rec;
  rec.lang = getLang() === 'ko' ? 'ko-KR' : 'en-US';
  rec.continuous = true;
  rec.maxAlternatives = 5;
  rec.onresult = (e) => {
    const res = e.results[e.results.length - 1];
    if (!res.isFinal || !myTurnNow()) return; // words heard on someone else's turn are ignored
    addCandidates([...res].map((a) => a.transcript), st.view.settings.lang);
    renderCands();
    setHint(cands.length ? t('micPick') : t('micFail'));
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micStop(); setHint(t('micDenied')); }
    else if (e.error === 'network' || e.error === 'audio-capture') { micStop(); setHint(t('micFail')); }
  };
  rec.onend = () => { if (recognition === rec) recognition = null; if (micOn) setTimeout(micListen, 300); };
  try { rec.start(); } catch { recognition = null; micStop(); }
}
$('btn-mic').addEventListener('click', () => {
  if (micOn) return micStop();
  unlock();
  micOn = true;
  micUi();
  setHint('');
  micListen();
});

const wordInput = $('word');
wordInput.addEventListener('input', syncLit);
wordInput.addEventListener('compositionstart', () => { st.composing = true; });
wordInput.addEventListener('compositionend', () => {
  st.composing = false;
  if (st.submitAfterComposition) { st.submitAfterComposition = false; setTimeout(submitWord, 0); }
});
wordInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (st.composing || e.isComposing || e.keyCode === 229) { st.submitAfterComposition = true; return; }
  e.preventDefault();
  submitWord();
});
$('entry').addEventListener('submit', (e) => { e.preventDefault(); if (!st.composing) submitWord(); });

$('btn-object').addEventListener('click', () => st.transport.send({ t: 'object' }));
$('vote-yes').addEventListener('click', () => st.transport.send({ t: 'vote', yes: true }));
$('vote-no').addEventListener('click', () => st.transport.send({ t: 'vote', yes: false }));
$('end-again').addEventListener('click', () => st.transport.send({ t: 'restart' }));
$('end-home').addEventListener('click', leaveRoom);

/* ---------- lobby actions ---------- */
const inviteUrl = () => `${location.origin}/?room=${st.code}`;
$('lobby-start').addEventListener('click', () => st.transport.send({ t: 'start' }));
$('lobby-leave').addEventListener('click', leaveRoom);
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(inviteUrl()); toast(t('copied')); } catch { prompt(t('copyLink'), inviteUrl()); }
});
$('btn-share').addEventListener('click', () => navigator.share({ title: t('title'), text: t('inviteText', st.code), url: inviteUrl() }).catch(() => {}));
function loadKakao() {
  return new Promise((resolve, reject) => {
    if (window.Kakao) return resolve(window.Kakao);
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    s.onload = () => resolve(window.Kakao);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
$('btn-kakao').addEventListener('click', async () => {
  try {
    const K = await loadKakao();
    if (!K.isInitialized()) K.init(config.kakaoJsKey);
    const link = { mobileWebUrl: inviteUrl(), webUrl: inviteUrl() };
    K.Share.sendDefault({ objectType: 'text', text: t('inviteText', st.code), link, buttonTitle: t('join') });
  } catch {
    $('btn-copy').click(); // SDK blocked or key wrong: fall back to the link
  }
});

/* ---------- frame loop: timer ring ---------- */
function frame() {
  const v = st.view;
  if (v && currentScreen() === 'game') {
    const ring = $('ring');
    if (v.phase === 'round') {
      const vote = v.round.vote;
      if (vote) {
        ring.classList.add('paused');
        const left = Math.max(0, vote.deadline - (Date.now() + st.offset));
        $('vote-fill').style.transform = `scaleX(${Math.min(1, left / 8000)})`;
      } else {
        ring.classList.remove('paused');
        const limit = v.settings.timeLimitSec * 1000;
        const rem = Math.max(0, v.round.deadline - (Date.now() + st.offset));
        const sec = Math.ceil(rem / 1000);
        $('ring-fg').style.strokeDashoffset = String(RING * (1 - Math.min(1, rem / limit)));
        $('ring-num').textContent = String(sec);
        ring.classList.toggle('low', rem <= 3000);
        if (sec !== st.lastSecond) {
          if (rem <= 3000 && sec > 0 && myTurnNow()) play('tick');
          st.lastSecond = sec;
        }
      }
    } else if (v.phase === 'between') {
      const s = Math.max(0, Math.ceil((v.nextAt - (Date.now() + st.offset)) / 1000));
      $('between-next').textContent = t('nextIn', s);
      ring.classList.remove('low');
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
$('go-single').addEventListener('click', () => { unlock(); openSetup('single'); });
$('go-hotseat').addEventListener('click', () => { unlock(); openSetup('hotseat'); });
$('f-humans').addEventListener('change', syncHumans);
$('btn-mic').hidden = !SR;
$('go-create').addEventListener('click', () => { unlock(); openSetup('create'); });
$('go-join').addEventListener('click', () => { unlock(); openSetup('join'); });
$('setup-back').addEventListener('click', () => show('home'));
$('btn-brand').addEventListener('click', () => (st.transport ? leaveRoom() : show('home')));
$('btn-lang').addEventListener('click', () => { setLang(getLang() === 'ko' ? 'en' : 'ko'); applyI18n(); });
$('btn-mute').addEventListener('click', () => { unlock(); setMuted(!isMuted()); applyI18n(); });
document.addEventListener('pointerdown', unlock, { once: true });

setLang(getLang());
applyI18n();
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) openSetup('join', roomParam.toUpperCase().slice(0, 5)); else show('home');
requestAnimationFrame(frame);
