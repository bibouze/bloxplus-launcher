const test = require('node:test');
const assert = require('node:assert');
const { gpuScore, framerateFor, PRESETS, PRESET_KEYS } = require('../lib/optimizer');

test('gpuScore classe les cartes par puissance', () => {
  const s = (n) => gpuScore(n);
  assert.strictEqual(s('NVIDIA GeForce RTX 4090'), 100);
  assert.ok(s('NVIDIA GeForce RTX 4090') > s('NVIDIA GeForce RTX 3060'));
  assert.ok(s('NVIDIA GeForce RTX 3060') > s('NVIDIA GeForce GTX 1650'));
  assert.ok(s('NVIDIA GeForce GTX 1650') > s('Intel(R) UHD Graphics'));
  assert.strictEqual(s('Carte inconnue'), 25);
  assert.strictEqual(s(), 25);
});

test('framerateFor selon le niveau et la fréquence écran', () => {
  assert.strictEqual(framerateFor('performance', { gpu: { refresh: 144 } }), 240);
  assert.strictEqual(framerateFor('performance', { gpu: { refresh: 360 } }), 360);
  assert.strictEqual(framerateFor('ultra', { gpu: { refresh: 240 } }), 144);
  assert.strictEqual(framerateFor('ultra', { gpu: { refresh: 30 } }), 60);
  assert.strictEqual(framerateFor('balanced', {}), 60);
  assert.strictEqual(framerateFor('quality', { gpu: { refresh: 165 } }), 165);
});

test('PRESETS : 4 niveaux complets, PRESET_KEYS = union des flags', () => {
  assert.deepStrictEqual(Object.keys(PRESETS).sort(), ['balanced', 'performance', 'quality', 'ultra']);
  for (const p of Object.values(PRESETS)) {
    assert.ok(p.name && p.desc && p.settings && p.flags);
    assert.ok(p.beauty >= 1 && p.beauty <= 4 && p.fluidity >= 1 && p.fluidity <= 4);
    for (const v of Object.values(p.flags)) assert.strictEqual(typeof v, 'string');
  }
  for (const p of Object.values(PRESETS)) for (const k of Object.keys(p.flags)) assert.ok(PRESET_KEYS.includes(k));
  assert.strictEqual(new Set(PRESET_KEYS).size, PRESET_KEYS.length);
});

test('PRESETS : les flags sont tous dans la liste autorisée par Roblox', () => {
  const { ALLOWLIST } = require('../lib/fflags');
  for (const k of PRESET_KEYS) assert.ok(ALLOWLIST.includes(k), k);
});
