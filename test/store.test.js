const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore } = require('../lib/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bp-store-'));

test('fichier absent : retourne les valeurs par défaut (copie indépendante)', () => {
  const defaults = { a: 1, n: { b: 2 } };
  const s = new JsonStore(path.join(tmp(), 'x.json'), defaults);
  assert.deepStrictEqual(s.data, defaults);
  s.data.n.b = 99;
  assert.strictEqual(defaults.n.b, 2);
});

test('JSON invalide : retourne les valeurs par défaut', () => {
  const f = path.join(tmp(), 'x.json');
  fs.writeFileSync(f, '{pas du json');
  assert.deepStrictEqual(new JsonStore(f, { a: 1 }).data, { a: 1 });
});

test('fusion profonde : clés manquantes gardent leur défaut, tableaux remplacés', () => {
  const f = path.join(tmp(), 'x.json');
  fs.writeFileSync(f, JSON.stringify({ n: { c: 3 }, list: [9], extra: true }));
  const s = new JsonStore(f, { n: { b: 2, c: 0 }, list: [1, 2] });
  assert.deepStrictEqual(s.data, { n: { b: 2, c: 3 }, list: [9], extra: true });
});

test('set/get avec clés pointées, crée les niveaux manquants et persiste', () => {
  const f = path.join(tmp(), 'sous', 'x.json');
  const s = new JsonStore(f, {});
  s.set('a.b.c', 5);
  assert.strictEqual(s.get('a.b.c'), 5);
  assert.strictEqual(s.get('a.zzz.c'), undefined);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: { b: { c: 5 } } });
  assert.strictEqual(fs.existsSync(f + '.tmp'), false);
  assert.strictEqual(new JsonStore(f, {}).get('a.b.c'), 5);
});
