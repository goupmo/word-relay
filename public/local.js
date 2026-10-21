// Solo mode: the same room engine the server uses, running in the browser, with the AI as the second player.
import { createRooms } from '../shared/rooms.js';
import { pickBotWord } from './bot.js';

export function createLocal({ dicts, categories }, onMessage) {
  const rooms = createRooms({ dicts, categories, now: Date.now, rand: Math.random });
  const timers = new Set();
  let botId = null;
  let started = false;
  let scheduledFor = null;

  const me = rooms.connect((msg) => {
    // Deferred: calling back into the room while it is still broadcasting would deliver a stale view last.
    if (msg.t === 'joined' && !started) queueMicrotask(() => rooms.handle(botId, { t: 'join', code: msg.code, name: 'AI' }));
    if (msg.t === 'room' && msg.phase === 'lobby' && msg.players.length === 2 && !started) {
      started = true;
      queueMicrotask(() => rooms.handle(me, { t: 'start' }));
    }
    onMessage(msg);
  });

  botId = rooms.connect((msg) => {
    if (msg.t !== 'room' || msg.phase !== 'round' || msg.round.winners || msg.round.turnId !== botId || msg.round.vote) return;
    const key = `${msg.round.deadline}:${msg.round.usedLetters.length}`;
    if (key === scheduledFor) return;
    scheduledFor = key;
    const limitMs = msg.settings.timeLimitSec * 1000;
    const wait = Math.min(1200 + Math.random() * 2800, limitMs * 0.7);
    const category = categories.find((c) => c.id === msg.category.id)[msg.settings.lang];
    const id = setTimeout(() => {
      timers.delete(id);
      const word = pickBotWord({ lang: msg.settings.lang, ...msg.round }, category, Math.random);
      if (word) rooms.handle(botId, { t: 'submit', word });
    }, wait);
    timers.add(id);
  });

  const ticker = setInterval(() => rooms.tick(), 250);

  return {
    send(msg) {
      if (msg.t === 'restart') started = false;
      rooms.handle(me, msg);
    },
    close() {
      clearInterval(ticker);
      timers.forEach(clearTimeout);
      rooms.disconnect(me);
      rooms.disconnect(botId);
    },
  };
}
