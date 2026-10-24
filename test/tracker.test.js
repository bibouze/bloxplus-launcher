// Lecture des logs Roblox par lib/tracker, sur un dossier de logs temporaire (jamais le vrai).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-logs-'));
// Remplace lib/paths avant de charger le tracker (logsDir est lu à l'import).
const pathsId = require.resolve('../lib/paths');
require.cache[pathsId] = { id: pathsId, filename: pathsId, loaded: true, exports: { logsDir: logs } };
const { Tracker, levelFromXp } = require('../lib/tracker');

const FIXTURE = path.join(__dirname, 'fixtures', 'Player_log.txt');
const LOG = path.join(logs, '20261024T100000Z_Player_ab.log');
// copyFileSync garde la date du fixture : on fixe la date de modification pour ne pas dépendre de l'heure.
const copieLog = (date) => {
  fs.mkdirSync(logs, { recursive: true });
  fs.copyFileSync(FIXTURE, LOG);
  fs.utimesSync(LOG, date, date);
};
const newTracker = () => {
  const t = new Tracker({ data: { playtime: { totalSeconds: 0, xp: 0, byDay: {}, byPlace: {} } }, save() {} });
  t.sessionStart = Date.now();
  return t;
};

test('readLog : détecte jeu, univers, IP puis départ, et passe au jeu suivant', () => {
  copieLog(new Date());
  const t = newTracker();
  const ev = [];
  for (const n of ['joined', 'left']) t.on(n, (e) => ev.push([n, e]));
  t.readLog();
  const joined = ev.find(([n]) => n === 'joined')[1];
  assert.strictEqual(joined.placeId, 920587237);
  assert.strictEqual(joined.universeId, 3317771874);
  assert.strictEqual(joined.ip, '128.116.9.9');
  assert.strictEqual(joined.jobId, '11111111-2222-3333-4444-555555555555');
  assert.strictEqual(ev.filter(([n]) => n === 'left').length, 1);
  assert.strictEqual(t.current.placeId, 142823291); // second jeu rejoint après la déconnexion
});

test('readLog : ne relit pas les lignes déjà lues', () => {
  copieLog(new Date());
  const t = newTracker();
  let n = 0;
  t.on('joined', () => n++);
  t.readLog();
  t.readLog();
  assert.strictEqual(n, 1);
});

test('readLog : un log créé bien avant la session est ignoré (pas de relecture du passé)', () => {
  copieLog(new Date(Date.now() - 3600 * 1000));
  const t = newTracker();
  let n = 0;
  t.on('joined', () => n++);
  t.readLog();
  assert.strictEqual(n, 0);
  assert.strictEqual(t.current, null);
});

test('addTime cumule temps, XP, jour et jeu courant', () => {
  const t = newTracker();
  t.lastSave = Date.now();
  t.current = { placeId: 7, universeId: 8 };
  t.addTime(120);
  const pt = t.store.data.playtime;
  assert.strictEqual(pt.totalSeconds, 120);
  assert.strictEqual(pt.xp, 2);
  assert.strictEqual(pt.byPlace['7'].seconds, 120);
  assert.strictEqual(pt.byPlace['7'].universeId, 8);
  assert.strictEqual(Object.values(pt.byDay)[0], 120);
});

test('readLog : sans dossier de logs, ne plante pas', () => {
  const t = newTracker();
  fs.rmSync(logs, { recursive: true, force: true });
  assert.doesNotThrow(() => t.readLog());
});

test('levelFromXp : paliers et progression', () => {
  assert.deepStrictEqual(levelFromXp(0), { level: 1, progress: 0, xpToNext: 30 });
  assert.strictEqual(levelFromXp(29.9).level, 1);
  assert.strictEqual(levelFromXp(30).level, 2);
  assert.strictEqual(levelFromXp(120).level, 3); // 30*2² = 120
  const r = levelFromXp(75); // niveau 2 : 30 → 120
  assert.strictEqual(r.level, 2);
  assert.ok(Math.abs(r.progress - 0.5) < 1e-9);
  assert.strictEqual(r.xpToNext, 45);
});
