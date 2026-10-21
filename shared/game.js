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

export const VOTE_MS = 8000;

export function startObjection(round, objectorId, now) {
  if (round.vote) return { ok: false, reason: 'already_voting' };
  if (!round.pending) return { ok: false, reason: 'no_pending' };
  if (objectorId === round.pending.playerId) return { ok: false, reason: 'self' };
  if (!round.players.some((p) => p.alive && p.id === objectorId)) return { ok: false, reason: 'not_alive' };
  // With two players the lone voter would always win, so the dictionary decides alone.
  if (aliveIds(round).length < 3) return { ok: false, reason: 'too_few_players' };
  round.vote = {
    objectorId,
    targetId: round.pending.playerId,
    word: round.pending.word,
    letter: round.pending.letter,
    votes: { [objectorId]: true },
    deadline: now + VOTE_MS,
    remainingMs: Math.max(0, round.deadline - now),
  };
  return { ok: true };
}

export function castVote(round, voterId, yes) {
  const v = round.vote;
  if (!v || voterId === v.targetId || voterId in v.votes) return false;
  if (!round.players.some((p) => p.alive && p.id === voterId)) return false;
  v.votes[voterId] = !!yes;
  return true;
}

export function resolveVote(round, now) {
  const v = round.vote;
  if (!v) return 'pending';
  const voters = aliveIds(round).filter((id) => id !== v.targetId);
  const yes = voters.filter((id) => v.votes[id]).length;
  const no = voters.filter((id) => v.votes[id] === false).length;
  // Decided early once the remaining votes cannot change the outcome.
  const decided = yes * 2 > voters.length || (voters.length - no) * 2 <= voters.length;
  if (!decided && now < v.deadline) return 'pending';
  round.vote = null;
  round.pending = null; // each word can be challenged only once
  if (yes * 2 <= voters.length) {
    round.deadline = now + v.remainingMs;
    return 'rejected';
  }
  round.usedWords = round.usedWords.filter((w) => w !== v.word);
  round.usedLetters = round.usedLetters.filter((l) => l !== v.letter);
  eliminate(round, round.players.findIndex((p) => p.id === v.targetId), now);
  return 'upheld';
}

export function createMatch(playerIds, rounds) {
  return { rounds, played: 0, scores: Object.fromEntries(playerIds.map((id) => [id, 0])) };
}

export function recordRound(match, winners) {
  for (const id of winners) if (id in match.scores) match.scores[id] += 1;
  match.played += 1;
}

export function matchResult(match) {
  const best = Math.max(...Object.values(match.scores));
  return {
    scores: { ...match.scores },
    done: match.played >= match.rounds,
    leaders: Object.keys(match.scores).filter((id) => match.scores[id] === best),
  };
}

export function tick(round, now) {
  if (round.winners || round.vote || now <= round.deadline) return false;
  eliminate(round, round.turn, now);
  return true;
}
