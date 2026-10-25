import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from '../shared/rooms.js';

const KO = new Set(['사자', '나비', '다람쥐', '라마', '마늘', '바나나']);
const categories = [{ id: 'animal', ko: { name: '동물', words: ['사자'] }, en: { name: 'Animals', words: ['lion'] } }];

function setup() {
  const clock = { t: 1000 };
  const rooms = createRooms({
    dicts: { ko: { has: (w) => KO.has(w) }, en: { has: () => false } },
    categories,
    now: () => clock.t,
    rand: () => 0.5,
  });
  const client = () => {
    const msgs = [];
    const id = rooms.connect((m) => msgs.push(m));
    return {
      id, msgs,
      send: (m) => rooms.handle(id, m),
      last: (t) => [...msgs].reverse().find((m) => m.t === t),
      count: (t) => msgs.filter((m) => m.t === t).length,
    };
  };
  return { clock, rooms, client };
}

const OPTS = { t: 'create', name: '가', lang: 'ko', maxPlayers: 3, timeLimitSec: 10, rounds: 2 };
function lobby(n = 2, opts = {}) {
  const s = setup();
  const host = s.client();
  host.send({ ...OPTS, ...opts });
  const code = host.last('joined').code;
  const guests = [];
  for (let i = 1; i < n; i++) {
    const g = s.client();
    g.send({ t: 'join', code, name: 'p' + i });
    guests.push(g);
  }
  return { ...s, host, guests, code };
}

test('create returns code and puts the creator in the lobby as host', () => {
  const { host } = lobby(1);
  const j = host.last('joined');
  assert.match(j.code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(j.you, host.id);
  const room = host.last('room');
  assert.equal(room.phase, 'lobby');
  assert.equal(room.host, host.id);
  assert.equal(room.players.length, 1);
});

test('join errors leave the room untouched', () => {
  const { client, host, guests, code } = lobby(3, { maxPlayers: 3 });
  const before = host.count('room');
  const x = client();
  x.send({ t: 'join', code: 'ZZZZZ', name: 'x' });
  assert.equal(x.last('error').reason, 'no_room');
  x.send({ t: 'join', code, name: 'x' });
  assert.equal(x.last('error').reason, 'room_full');
  assert.equal(host.count('room'), before);
  assert.equal(host.last('room').players.length, 3);
  assert.ok(guests.length === 2);
});

test('same name is refused; started room is refused', () => {
  const { client, host, code } = lobby(2, { maxPlayers: 4 });
  const x = client();
  x.send({ t: 'join', code, name: '가' });
  assert.equal(x.last('error').reason, 'name_taken');
  host.send({ t: 'start' });
  x.send({ t: 'join', code, name: 'new' });
  assert.equal(x.last('error').reason, 'already_started');
  assert.equal(host.last('room').players.length, 2);
});

test('start needs the host and two players', () => {
  const s = lobby(1);
  s.host.send({ t: 'start' });
  assert.equal(s.host.last('error').reason, 'need_players');
  const g = s.client();
  g.send({ t: 'join', code: s.code, name: 'g' });
  g.send({ t: 'start' });
  assert.equal(g.last('error').reason, 'not_host');
  s.host.send({ t: 'start' });
  const room = s.host.last('room');
  assert.equal(room.phase, 'round');
  assert.equal(room.category.name, '동물');
  assert.equal(room.round.turnId, s.host.id);
  assert.equal(room.round.deadline, 1000 + 10000);
});

test('a valid word advances the turn and reports an event', () => {
  const { host, guests } = lobby(2);
  host.send({ t: 'start' });
  host.send({ t: 'submit', word: '사자' });
  const room = guests[0].last('room');
  assert.equal(room.round.turnId, guests[0].id);
  assert.deepEqual(room.round.usedLetters, ['ㅅ']);
  assert.equal(room.event.type, 'word');
  assert.equal(room.event.word, '사자');
});

test('a word that is not in the dictionary is accepted with a warning flag', () => {
  const { host, guests } = lobby(2);
  host.send({ t: 'start' });
  host.send({ t: 'submit', word: '가나다라' });
  const room = guests[0].last('room');
  assert.equal(room.event.type, 'word');
  assert.equal(room.event.unverified, true);
  assert.equal(room.round.pending.unverified, true);
  assert.equal(room.players.every((p) => p.alive), true);
});

test('submit by the wrong player is ignored', () => {
  const { host, guests } = lobby(2);
  host.send({ t: 'start' });
  const before = host.count('room');
  guests[0].send({ t: 'submit', word: '사자' });
  assert.equal(guests[0].last('error').reason, 'not_your_turn');
  assert.equal(host.count('room'), before);
  assert.equal(host.last('room').round.turnId, host.id);
});

test('tick after the deadline eliminates, ends the round and then the match', () => {
  const { host, guests, clock, rooms } = lobby(2);
  host.send({ t: 'start' });
  clock.t += 10001;
  rooms.tick();
  let room = guests[0].last('room');
  assert.equal(room.phase, 'between');
  assert.deepEqual(room.round.winners, [guests[0].id]);
  assert.equal(room.event.type, 'out');
  assert.equal(room.event.playerId, host.id);
  assert.equal(room.event.reason, 'timeout');
  assert.equal(room.players.find((p) => p.id === guests[0].id).score, 1);

  clock.t += 5000;
  rooms.tick();
  assert.equal(host.last('room').phase, 'round');
  clock.t += 10001;
  rooms.tick();
  room = host.last('room');
  assert.equal(room.phase, 'done');
});

test('objection vote through the room removes the word and the submitter', () => {
  const { host, guests, rooms, client } = lobby(3);
  host.send({ t: 'start' });
  host.send({ t: 'submit', word: '사자' });
  guests[1].send({ t: 'object' });
  assert.ok(host.last('room').round.vote);
  guests[0].send({ t: 'vote', yes: true });
  const room = host.last('room');
  assert.equal(room.round.vote, null);
  assert.equal(room.players.find((p) => p.id === host.id).alive, false);
  assert.deepEqual(room.round.usedLetters, []);
  assert.equal(room.event.type, 'vote_result');
  assert.equal(room.event.result, 'upheld');
  assert.ok(rooms && client);
});

test('disconnect mid-round eliminates that player and the game continues', () => {
  const { host, guests, rooms } = lobby(3);
  host.send({ t: 'start' });
  rooms.disconnect(guests[1].id); // not on turn
  let room = host.last('room');
  assert.equal(room.players.length, 2);
  assert.equal(room.phase, 'round');
  assert.equal(room.round.turnId, host.id);
  rooms.disconnect(host.id); // on turn, one survivor left
  room = guests[0].last('room');
  assert.equal(room.phase, 'between');
  assert.deepEqual(room.round.winners, [guests[0].id]);
});

test('host leaving transfers host', () => {
  const { host, guests, rooms } = lobby(2);
  rooms.disconnect(host.id);
  assert.equal(guests[0].last('room').host, guests[0].id);
});

test('the last player leaving deletes the room', () => {
  const { host, rooms, client, code } = lobby(1);
  rooms.disconnect(host.id);
  const x = client();
  x.send({ t: 'join', code, name: 'x' });
  assert.equal(x.last('error').reason, 'no_room');
});

test('bad names are refused', () => {
  const { client } = setup();
  const x = client();
  x.send({ ...OPTS, name: '   ' });
  assert.equal(x.last('error').reason, 'bad_name');
});
