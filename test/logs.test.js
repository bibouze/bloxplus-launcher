// lib/logs.js : reconstruction des sessions à partir des horodatages des logs Roblox (dossiers temporaires).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logs = require('../lib/logs');

const J1 = '11111111-2222-3333-4444-555555555555';
const J2 = '99999999-2222-3333-4444-555555555555';
const line = (iso, msg) => `${iso},1.0,abcd,6 [FLog::Output] ${msg}`;
const join = (iso, job, place) => line(iso, `! Joining game '${job}' place ${place} at 128.116.1.2`);
const universe = (iso, place, uni) => line(iso, `GameJoinLoadTime placeid:${place}, universeid:${uni}, ok`);
const leave = (iso) => line(iso, 'Time to disconnect replication data: 0.01').replace('[FLog::Output]', '[FLog::Network]');
const ms = (iso) => Date.parse(iso);
const newPlaytime = () => ({ totalSeconds: 0, xp: 0, byDay: {}, byPlace: {} });

test('parseLog : segments, univers, départ, dernier horodatage si pas de départ', () => {
  const p = logs.parseLog([
    line('2026-10-24T10:00:00.000Z', 'start'),
    join('2026-10-24T10:00:05.000Z', J1, 100),
    universe('2026-10-24T10:00:06.000Z', 100, 555),
    leave('2026-10-24T10:30:05.000Z'),
    join('2026-10-24T10:31:00.000Z', J2, 200),
    line('2026-10-24T10:40:00.000Z', 'plus rien ensuite'),
  ].join('\r\n'));
  assert.strictEqual(p.start, ms('2026-10-24T10:00:00.000Z'));
  assert.strictEqual(p.end, ms('2026-10-24T10:40:00.000Z'));
  assert.deepStrictEqual(p.segments, [
    { jobId: J1, placeId: 100, universeId: 555, start: ms('2026-10-24T10:00:05.000Z'), end: ms('2026-10-24T10:30:05.000Z') },
    { jobId: J2, placeId: 200, universeId: null, start: ms('2026-10-24T10:31:00.000Z'), end: ms('2026-10-24T10:40:00.000Z') },
  ]);
});

test('parseLog : log sans horodatage ni jeu → rien d\'inventé', () => {
  const p = logs.parseLog('du texte\nsans date');
  assert.deepStrictEqual(p, { start: null, end: null, segments: [] });
});

test('secondsByDay : une session à cheval sur minuit UTC est coupée en deux jours', () => {
  const d = logs.secondsByDay(ms('2026-10-24T23:50:00Z'), ms('2026-10-25T00:20:00Z'));
  assert.deepStrictEqual(d, { '2026-10-24': 600, '2026-10-25': 1200 });
});

test('mergeIntervals : deux instances qui se chevauchent comptent une fois', () => {
  assert.deepStrictEqual(
    logs.mergeIntervals([{ start: 0, end: 100 }, { start: 50, end: 150 }, { start: 200, end: 300 }, { start: 5, end: 5 }]),
    [[0, 150], [200, 300]],
  );
});

test('applySessions : minuit UTC → secondes réparties par jour, total = somme', () => {
  const pt = newPlaytime();
  const s = [{ name: 'a', segments: [{ placeId: 1, universeId: 9, start: ms('2026-10-24T23:50:00Z'), end: ms('2026-10-25T00:20:00Z') }], start: ms('2026-10-24T23:50:00Z'), end: ms('2026-10-25T00:20:00Z') }];
  const r = logs.applySessions(pt, s);
  assert.deepStrictEqual(pt.byDay, { '2026-10-24': 600, '2026-10-25': 1200 });
  assert.strictEqual(pt.totalSeconds, 1800);
  assert.strictEqual(pt.xp, 30);
  assert.strictEqual(pt.byPlace['1'].seconds, 1800);
  assert.strictEqual(pt.byPlace['1'].universeId, 9);
  assert.strictEqual(r.seconds, 1800);
});

test('applySessions : 2 instances simultanées → temps total compté une fois, temps par jeu séparé', () => {
  const a = { name: 'a', start: ms('2026-10-24T10:00:00Z'), end: ms('2026-10-24T11:00:00Z'), segments: [{ placeId: 1, universeId: null, start: ms('2026-10-24T10:00:00Z'), end: ms('2026-10-24T11:00:00Z') }] };
  const b = { name: 'b', start: ms('2026-10-24T10:30:00Z'), end: ms('2026-10-24T11:30:00Z'), segments: [{ placeId: 2, universeId: null, start: ms('2026-10-24T10:30:00Z'), end: ms('2026-10-24T11:30:00Z') }] };
  const pt = newPlaytime();
  logs.applySessions(pt, [a, b]);
  assert.strictEqual(pt.totalSeconds, 5400); // 10h00 → 11h30, pas 7200
  assert.strictEqual(pt.byPlace['1'].seconds, 3600);
  assert.strictEqual(pt.byPlace['2'].seconds, 3600);
});

test('applySessions : pas de doublon si le log est déjà dans `counted`', () => {
  const s = [{ name: 'a', start: 0, end: 60000, segments: [{ placeId: 1, universeId: null, start: 0, end: 60000 }] }];
  const pt = newPlaytime();
  const r1 = logs.applySessions(pt, s);
  const r2 = logs.applySessions(pt, s, r1.counted);
  assert.strictEqual(pt.totalSeconds, 60);
  assert.strictEqual(r2.sessions, 0);
  assert.deepStrictEqual(r2.counted, ['a']);
});

test('importHistory : n\'invente aucun temps, ne fait que compléter lastPlayed/universeId, sans doublon', () => {
  const pt = newPlaytime();
  pt.byPlace['1'] = { seconds: 120, lastPlayed: ms('2026-10-25T00:00:00Z'), universeId: null, name: 'X' };
  const s = [{ name: 'a', segments: [
    { placeId: 1, universeId: 7, start: 0, end: ms('2026-10-20T00:00:00Z') }, // plus ancien : lastPlayed intact
    { placeId: 2, universeId: 8, start: 0, end: ms('2026-10-21T00:00:00Z') },
  ] }];
  assert.strictEqual(logs.importHistory(pt, s), 2);
  assert.strictEqual(pt.byPlace['1'].seconds, 120);
  assert.strictEqual(pt.byPlace['1'].lastPlayed, ms('2026-10-25T00:00:00Z'));
  assert.strictEqual(pt.byPlace['1'].universeId, 7);
  assert.strictEqual(pt.byPlace['2'].seconds, 0);
  assert.strictEqual(pt.byPlace['2'].lastPlayed, ms('2026-10-21T00:00:00Z'));
  assert.strictEqual(pt.totalSeconds, 0);
  assert.strictEqual(logs.importHistory(pt, s), 0); // second passage : rien ne change
});

test('readSessions / readSessionsAsync : lisent les logs _Player_, ignorent CrashHandler et illisibles', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-logs2-'));
  const body = [join('2026-10-24T10:00:05.000Z', J1, 100), leave('2026-10-24T10:10:00.000Z')].join('\n');
  fs.writeFileSync(path.join(dir, '0.0_20261024T100000Z_Player_ab.log'), body);
  fs.writeFileSync(path.join(dir, '0.0_20261024T100000Z_Player_ab_CrashHandler.log'), body);
  fs.writeFileSync(path.join(dir, 'vide_Player_cd.log'), '');
  fs.writeFileSync(path.join(dir, 'autre.log'), body);
  const sync = logs.readSessions(dir, 0);
  assert.strictEqual(sync.length, 1);
  assert.strictEqual(sync[0].segments[0].placeId, 100);
  const asy = await logs.readSessionsAsync(dir, { skip: (f) => f.name.startsWith('vide') });
  assert.strictEqual(asy.sessions.length, 1);
  assert.strictEqual(asy.scanned.length, 2);
  assert.deepStrictEqual(logs.readSessions(path.join(dir, 'absent'), 0), []);
});
