const test = require('node:test');
const assert = require('node:assert');
const { extractUri } = require('../lib/protocol');

test('extractUri trouve roblox: et roblox-player: (insensible à la casse)', () => {
  assert.strictEqual(extractUri(['app.exe', 'roblox://placeId=1']), 'roblox://placeId=1');
  assert.strictEqual(extractUri(['x', 'roblox-player:1+launchmode:play']), 'roblox-player:1+launchmode:play');
  assert.strictEqual(extractUri(['x', 'ROBLOX://a']), 'ROBLOX://a');
});

test('extractUri renvoie null sans URI ou avec un faux préfixe', () => {
  assert.strictEqual(extractUri([]), null);
  assert.strictEqual(extractUri(['--flag', 'C:\\roblox:fichier', 'robloxx://a', 'https://roblox.com']), null);
});

test('extractUri prend la première URI', () => {
  assert.strictEqual(extractUri(['roblox://1', 'roblox://2']), 'roblox://1');
});
