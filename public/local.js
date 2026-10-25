// Offline play: the same room engine the server uses, running in the browser.
// opts.extra = names of more people sharing this device (pass-and-play); opts.ai = add the computer as a player.
// Everyone is a connection of one room; on a shared screen the call is made for whoever the action belongs to.
import { createRooms } from '../shared/rooms.js';
import { pickBotWord } from './bot.js';

export function createLocal({ dicts, categories }, onMessage, { extra = [], ai = true } = {}) {
  const rooms = createRooms({ dicts, categories, now: Date.now, rand: Math.random });
  const timers = new Set();
  const total = 1 + extra.length + (ai ? 1 : 0);
  let botId = null;
  let started = false;
  let view = null;
  let scheduledFor = null;
  let votedFor = null;

  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };

  const me = rooms.connect((msg) => {
    if (msg.t === 'room') view = msg;
    // Deferred: calling back into the room while it is still broadcasting would deliver a stale view last.
    if (msg.t === 'joined' && !started) {
      queueMicrotask(() => {
        for (const [i, c] of friends.entries()) rooms.handle(c, { t: 'join', code: msg.code, name: extra[i] });
        if (ai) rooms.handle(botId, { t: 'join', code: msg.code, name: 'AI' });
      });
    }
    if (msg.t === 'room' && msg.phase === 'lobby' && msg.players.length === total && !started) {
      started = true;
      queueMicrotask(() => rooms.handle(me, { t: 'start' }));
    }
    onMessage(msg);
  });
  const friends = extra.map(() => rooms.connect(() => {}));
  const humans = [me, ...friends];

  botId = ai ? rooms.connect((msg) => {
    if (msg.t !== 'room' || msg.phase !== 'round' || msg.round.winners) return;
    const category = categories.find((c) => c.id === msg.category.id)[msg.settings.lang];
    const vote = msg.round.vote;
    if (vote) { // the AI votes too: it challenges words that are not on its category list
      const me2 = msg.players.find((p) => p.id === botId);
      if (!me2?.alive || vote.targetId === botId || botId in vote.votes || votedFor === vote.word) return;
      votedFor = vote.word;
      later(() => rooms.handle(botId, { t: 'vote', yes: !category.words.includes(vote.word) }), 1200);
      return;
    }
    if (msg.round.turnId !== botId) return;
    const key = `${msg.round.deadline}:${msg.round.usedLetters.length}`;
    if (key === scheduledFor) return;
    scheduledFor = key;
    const wait = Math.min(1200 + Math.random() * 2800, msg.settings.timeLimitSec * 700);
    later(() => {
      const word = pickBotWord({ lang: msg.settings.lang, ...msg.round }, category, Math.random);
      if (word) rooms.handle(botId, { t: 'submit', word });
    }, wait);
  }) : null;

  const ticker = setInterval(() => rooms.tick(), 250);

  const alive = (v, id) => !!v.players.find((p) => p.id === id)?.alive;
  const isHuman = (id) => humans.includes(id);
  // A human who may challenge the word on the table: alive, not its author; the player on turn goes first.
  const objectorId = (v) => {
    const r = v?.round;
    if (!r?.pending || r.vote || v.phase !== 'round') return null;
    const ok = humans.filter((h) => alive(v, h) && h !== r.pending.playerId);
    return ok.includes(r.turnId) ? r.turnId : (ok[0] ?? null);
  };
  // The next human who still has to vote.
  const voterId = (v) => {
    const vote = v?.round?.vote;
    return vote ? (humans.find((h) => alive(v, h) && h !== vote.targetId && !(h in vote.votes)) ?? null) : null;
  };

  return {
    isHuman, objectorId, voterId,
    send(msg) {
      if (msg.t === 'restart') started = false;
      let actor = me;
      if (msg.t === 'submit') actor = view?.round?.turnId;
      else if (msg.t === 'object') actor = objectorId(view);
      else if (msg.t === 'vote') actor = voterId(view);
      if (actor && (msg.t === 'submit' ? isHuman(actor) : true)) rooms.handle(actor, msg);
    },
    close() {
      clearInterval(ticker);
      timers.forEach(clearTimeout);
      for (const c of humans) rooms.disconnect(c);
      if (botId) rooms.disconnect(botId);
    },
  };
}
