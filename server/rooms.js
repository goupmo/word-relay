import {
  createRound, submitWord, tick as tickRound, startObjection, castVote, resolveVote, dropPlayer,
  createMatch, recordRound,
} from '../shared/game.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const BETWEEN_MS = 5000;
const OUT_REASONS = ['letter_used', 'duplicate', 'not_in_dict'];
const clamp = (n, lo, hi, dflt) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, Math.round(+n))) : dflt);

export function createRooms({ dicts, categories, now, rand }) {
  const conns = new Map(); // connId -> { send, code, name }
  const rooms = new Map(); // code -> room
  let nextConn = 1;

  const send = (id, msg) => conns.get(id)?.send(msg);
  const error = (id, reason) => send(id, { t: 'error', reason });

  function view(room) {
    const r = room.round;
    const scores = room.match?.scores ?? {};
    const cat = room.category;
    return {
      t: 'room',
      code: room.code,
      phase: room.phase,
      host: room.host,
      settings: { maxPlayers: room.maxPlayers, timeLimitSec: room.timeLimitSec, rounds: room.rounds, lang: room.lang },
      serverNow: now(),
      nextAt: room.nextAt,
      event: room.event,
      match: room.match && { rounds: room.match.rounds, played: room.match.played },
      category: cat && { id: cat.id, name: cat[room.lang].name },
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        alive: r ? (r.players.find((x) => x.id === p.id)?.alive ?? false) : true,
        score: scores[p.id] ?? 0,
      })),
      round: r && {
        turnId: r.winners ? null : r.players[r.turn].id,
        deadline: r.deadline,
        usedLetters: r.usedLetters,
        usedWords: r.usedWords,
        pending: r.pending && { playerId: r.pending.playerId, word: r.pending.word },
        vote: r.vote && { objectorId: r.vote.objectorId, targetId: r.vote.targetId, word: r.vote.word, votes: r.vote.votes, deadline: r.vote.deadline },
        winners: r.winners,
      },
    };
  }

  const broadcast = (room) => {
    const v = view(room);
    for (const p of room.players) send(p.id, v);
  };

  const setEvent = (room, e) => { room.event = { seq: ++room.seq, ...e }; };

  function startRound(room) {
    if (room.players.length < 2) { room.phase = 'done'; return; }
    const fresh = categories.filter((c) => !room.usedCategories.includes(c.id));
    const pool = fresh.length ? fresh : categories;
    room.category = pool[Math.floor(rand() * pool.length)];
    room.usedCategories.push(room.category.id);
    room.round = createRound({
      lang: room.lang, categoryId: room.category.id, playerIds: room.players.map((p) => p.id),
      timeLimitMs: room.timeLimitSec * 1000, now: now(),
    });
    room.phase = 'round';
  }

  // Runs after any state change: closes the round if it is over.
  function settle(room) {
    if (room.phase !== 'round' || !room.round.winners) return;
    recordRound(room.match, room.round.winners);
    room.phase = room.match.played >= room.match.rounds ? 'done' : 'between';
    room.nextAt = now() + BETWEEN_MS;
  }

  function newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  }

  const cleanName = (n) => {
    const s = typeof n === 'string' ? n.trim() : '';
    return s.length >= 1 && s.length <= 12 ? s : null;
  };

  function join(connId, room, name) {
    room.players.push({ id: connId, name });
    conns.get(connId).code = room.code;
    send(connId, { t: 'joined', code: room.code, you: connId });
    broadcast(room);
  }

  function leave(connId) {
    const conn = conns.get(connId);
    const room = conn && rooms.get(conn.code);
    if (!room) return;
    conn.code = null;
    if (room.phase === 'round') {
      dropPlayer(room.round, connId, now());
      setEvent(room, { type: 'out', playerId: connId, reason: 'left' });
    }
    room.players = room.players.filter((p) => p.id !== connId);
    if (!room.players.length) { rooms.delete(room.code); return; }
    if (room.host === connId) room.host = room.players[0].id;
    settle(room);
    broadcast(room);
  }

  const handlers = {
    create(id, msg) {
      const name = cleanName(msg.name);
      if (!name) return error(id, 'bad_name');
      if (msg.lang !== 'ko' && msg.lang !== 'en') return error(id, 'bad_options');
      if (conns.get(id).code) leave(id);
      const room = {
        code: newCode(), host: id, lang: msg.lang, phase: 'lobby', players: [],
        maxPlayers: clamp(msg.maxPlayers, 2, 4, 4), timeLimitSec: clamp(msg.timeLimitSec, 5, 30, 10),
        rounds: clamp(msg.rounds, 1, 10, 5), round: null, match: null, category: null,
        usedCategories: [], nextAt: null, event: null, seq: 0,
      };
      rooms.set(room.code, room);
      join(id, room, name);
    },
    join(id, msg) {
      const name = cleanName(msg.name);
      if (!name) return error(id, 'bad_name');
      const room = rooms.get(String(msg.code ?? '').toUpperCase());
      if (!room) return error(id, 'no_room');
      if (room.phase !== 'lobby') return error(id, 'already_started');
      if (room.players.length >= room.maxPlayers) return error(id, 'room_full');
      if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return error(id, 'name_taken');
      if (conns.get(id).code) leave(id);
      join(id, room, name);
    },
    start(id, _msg, room) {
      if (room.host !== id) return error(id, 'not_host');
      if (room.phase !== 'lobby') return error(id, 'already_started');
      if (room.players.length < 2) return error(id, 'need_players');
      room.match = createMatch(room.players.map((p) => p.id), room.rounds);
      room.usedCategories = [];
      startRound(room);
      broadcast(room);
    },
    restart(id, _msg, room) {
      if (room.host !== id) return error(id, 'not_host');
      if (room.phase !== 'done') return error(id, 'bad_phase');
      Object.assign(room, { phase: 'lobby', round: null, match: null, category: null, event: null });
      broadcast(room);
    },
    submit(id, msg, room) {
      if (room.phase !== 'round') return error(id, 'not_your_turn');
      const res = submitWord(room.round, id, msg.word, dicts[room.lang], now());
      if (res.ok) setEvent(room, { type: 'word', playerId: id, word: room.round.pending?.word ?? room.round.usedWords.at(-1) });
      else if (OUT_REASONS.includes(res.reason)) setEvent(room, { type: 'out', playerId: id, reason: res.reason, word: String(msg.word).slice(0, 30) });
      else return error(id, res.reason); // not_your_turn / too_late / invalid: nothing changed
      settle(room);
      broadcast(room);
    },
    object(id, _msg, room) {
      if (room.phase !== 'round') return error(id, 'no_pending');
      const res = startObjection(room.round, id, now());
      if (!res.ok) return error(id, res.reason);
      setEvent(room, { type: 'vote_start', playerId: id, targetId: room.round.vote.targetId });
      broadcast(room);
    },
    vote(id, msg, room) {
      if (room.phase !== 'round' || !castVote(room.round, id, msg.yes)) return error(id, 'cannot_vote');
      const res = resolveVote(room.round, now());
      if (res !== 'pending') setEvent(room, { type: 'vote_result', result: res });
      settle(room);
      broadcast(room);
    },
    leave(id) { leave(id); },
  };

  return {
    connect(sendFn) {
      const id = `c${nextConn++}`;
      conns.set(id, { send: sendFn, code: null });
      return id;
    },
    handle(id, msg) {
      const conn = conns.get(id);
      if (!conn || !msg || typeof msg !== 'object') return;
      const fn = handlers[msg.t];
      if (!fn || !Object.hasOwn(handlers, msg.t)) return;
      const room = rooms.get(conn.code);
      if (!room && !['create', 'join', 'leave'].includes(msg.t)) return error(id, 'no_room');
      fn(id, msg, room);
    },
    disconnect(id) {
      leave(id);
      conns.delete(id);
    },
    tick() {
      const t = now();
      for (const room of rooms.values()) {
        let changed = false;
        if (room.phase === 'round') {
          const r = room.round;
          if (r.vote) {
            const res = resolveVote(r, t);
            if (res !== 'pending') { setEvent(room, { type: 'vote_result', result: res }); changed = true; }
          } else {
            const who = r.players[r.turn].id;
            if (tickRound(r, t)) { setEvent(room, { type: 'out', playerId: who, reason: 'timeout' }); changed = true; }
          }
          settle(room);
        } else if (room.phase === 'between' && t >= room.nextAt) {
          startRound(room);
          changed = true;
        }
        if (changed) broadcast(room);
      }
    },
  };
}
