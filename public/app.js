import { t, setLang, getLang } from './i18n.js';
import { play, setMuted, isMuted, unlock } from './sfx.js';
import { connect } from './net.js';
import { createLocal } from './local.js';
import { config } from './config.js';
import { mountAds } from './ads.js';
import { KO_LETTERS, EN_LETTERS, normalizeWord, initialOf } from '../shared/chars.js';

const $ = (id) => document.getElementById(id);
const RING = 326.73;
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

function render(v) {
  if (v.phase === 'lobby') {
    if (st.mode === 'single') return; // solo starts immediately; never show the lobby
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
  const me = v.players.find((p) => p.id === st.you);
  const aliveCount = v.players.filter((p) => p.alive).length;
  const myTurn = v.phase === 'round' && r.turnId === st.you && !r.vote && !!me?.alive;

  $('players').innerHTML = v.players.map((p, i) =>
    `<div class="player${p.id === r.turnId ? ' turn' : ''}${p.alive ? '' : ' out'}">${avatar(p.name, i)}<div class="pinfo"><div class="pname">${esc(p.name)}</div><div class="pscore">★ ${p.score}</div></div></div>`).join('');
  const roundKey = `${v.match.played}:${v.category.id}`;
  if (roundKey !== st.roundKey) { st.roundKey = roundKey; $('word').value = ''; } // new round: drop any unsent text
  $('round-no').textContent = t('round', Math.min(v.match.rounds, v.match.played + (v.phase === 'round' ? 1 : 0)), v.match.rounds);
  $('cat-name').textContent = v.category.name;

  const whose = $('whose');
  whose.textContent = v.phase !== 'round' ? '' : myTurn ? t('yourTurn') : t('turnOf', nameOf(r.turnId));
  whose.classList.toggle('mine', myTurn);

  const canObject = v.phase === 'round' && !!r.pending && r.pending.playerId !== st.you && !!me?.alive && !r.vote && aliveCount >= 3;
  $('bubble').hidden = !r.pending;
  if (r.pending) $('bubble-text').innerHTML = `${esc(r.pending.word)} <span class="who">${esc(nameOf(r.pending.playerId))}</span>`;
  $('btn-object').hidden = !canObject;

  for (const k of $('keys').children) k.classList.toggle('used', r.usedLetters.includes(k.dataset.l));
  syncLit();

  $('word').disabled = !myTurn;
  $('btn-submit').disabled = !myTurn;
  if (myTurn && !st.wasMyTurn) { $('word').focus({ preventScroll: true }); }
  st.wasMyTurn = myTurn;
  if (!myTurn) $('hint').textContent = '';

  renderVote(v, me);
  renderBetween(v);
}

function renderVote(v, me) {
  const vote = v.round.vote;
  $('vote').hidden = !vote;
  if (!vote) return;
  $('vote-title').textContent = t('voteTitle', vote.word);
  const eligible = !!me?.alive && st.you !== vote.targetId && !(st.you in vote.votes);
  $('vote-buttons').hidden = !eligible;
  $('vote-state').textContent = eligible ? '' : t('voted');
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
  const canRestart = st.mode === 'single' || v.host === st.you;
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
  if ((v.phase === 'between' || v.phase === 'done') && st.prevPhase === 'round' && v.round.winners?.includes(st.you)) play('win');
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
    const words = await (await fetch(`/data/dict-${lang}.json`)).json();
    st.localData.dicts[lang] = new Set(words);
    (st.localData.loaded ??= {})[lang] = true;
  }
  return st.localData;
}

/* ---------- setup form ---------- */
function setupLabels() {
  const m = st.setupMode;
  $('setup-title').textContent = t(m === 'single' ? 'single' : m);
  $('setup-go').textContent = t(m === 'single' ? 'singleGo' : m === 'create' ? 'createGo' : 'joinGo');
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
  if (st.setupMode === 'single') {
    $('setup-go').disabled = true;
    $('setup-msg').textContent = t('loading');
    try {
      const data = await loadLocalData(lang);
      st.mode = 'single';
      st.transport = createLocal(data, onMessage);
      st.transport.send({ t: 'create', ...opts, maxPlayers: 2 });
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
  return !!v && v.phase === 'round' && v.round.turnId === st.you && !v.round.vote;
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
