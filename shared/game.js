import { KO_LETTERS, EN_LETTERS, normalizeWord, initialOf } from './chars.js';

const lettersOf = (lang) => (lang === 'ko' ? KO_LETTERS : EN_LETTERS);

export function createRound({ lang, categoryId, playerIds, timeLimitMs, now }) {
  return {
    lang,
    categoryId,
    players: playerIds.map((id) => ({ id, alive: true })),
    turn: 0,
    usedLetters: [],
    usedWords: [],
    deadline: now + timeLimitMs,
    timeLimitMs,
    pending: null,
    vote: null,
    winners: null,
  };
}

export const availableLetters = (round) => lettersOf(round.lang).filter((l) => !round.usedLetters.includes(l));

const aliveIds = (round) => round.players.filter((p) => p.alive).map((p) => p.id);

function nextAlive(round, from) {
  const n = round.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (round.players[idx].alive) return idx;
  }
  return from;
}

function finishIfOver(round) {
  const alive = aliveIds(round);
  if (alive.length <= 1 || availableLetters(round).length === 0) round.winners = alive;
}

// Takes the player at `idx` out of the round and hands the turn to the next survivor.
export function eliminate(round, idx, now) {
  round.players[idx].alive = false;
  round.pending = null;
  finishIfOver(round);
  if (!round.winners) {
    round.turn = nextAlive(round, idx);
    round.deadline = now + round.timeLimitMs;
  }
}

export function submitWord(round, playerId, raw, dict, now) {
  const me = round.players[round.turn];
  if (round.winners || round.vote || me.id !== playerId) return { ok: false, reason: 'not_your_turn' };
  if (now > round.deadline) return { ok: false, reason: 'too_late' };
  const word = normalizeWord(raw, round.lang);
  const letter = word && initialOf(word, round.lang);
  if (!word || !letter) return { ok: false, reason: 'invalid' };

  let reason = null;
  if (round.usedLetters.includes(letter)) reason = 'letter_used';
  else if (round.usedWords.includes(word)) reason = 'duplicate';
  else if (!dict.has(word)) reason = 'not_in_dict';
  if (reason) {
    eliminate(round, round.turn, now);
    return { ok: false, reason };
  }

  round.usedLetters.push(letter);
  round.usedWords.push(word);
  round.pending = { playerId, word, letter };
  finishIfOver(round);
  if (!round.winners) {
    round.turn = nextAlive(round, round.turn);
    round.deadline = now + round.timeLimitMs;
  }
  return { ok: true };
}

export function tick(round, now) {
  if (round.winners || round.vote || now <= round.deadline) return false;
  eliminate(round, round.turn, now);
  return true;
}
