const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ALLOWLIST, PRESET_FLAGS, readFromVersion, writeToVersion } = require('../lib/fflags');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ff-'));

test('lecture : dossier sans fichier ou fichier corrompu → {}', () => {
  const d = tmp();
  assert.deepStrictEqual(readFromVersion(d), {});
  fs.mkdirSync(path.join(d, 'ClientSettings'));
  fs.writeFileSync(path.join(d, 'ClientSettings', 'ClientAppSettings.json'), 'xx');
  assert.deepStrictEqual(readFromVersion(d), {});
});

test('écriture : crée ClientSettings, convertit en chaînes, ignore vides/null', () => {
  const d = tmp();
  const file = writeToVersion(d, { A: 1, B: true, C: '', D: null, E: undefined, F: 'x' });
  assert.strictEqual(file, path.join(d, 'ClientSettings', 'ClientAppSettings.json'));
  assert.deepStrictEqual(readFromVersion(d), { A: '1', B: 'true', F: 'x' });
});

test('écriture : conserve 0 et false (valeurs falsy légitimes)', () => {
  const d = tmp();
  writeToVersion(d, { Z: 0, Y: false });
  assert.deepStrictEqual(readFromVersion(d), { Z: '0', Y: 'false' });
});

test('les réglages proposés sont cohérents', () => {
  assert.ok(new Set(ALLOWLIST).size === ALLOWLIST.length, 'doublon dans ALLOWLIST');
  for (const f of PRESET_FLAGS) {
    assert.ok(f.key && f.label && f.type, JSON.stringify(f));
    if (f.type === 'number') assert.ok(f.min <= f.max);
  }
});
