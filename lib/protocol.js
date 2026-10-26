// Fait de BloxPlus le programme qui s'ouvre quand on clique sur « Jouer » sur roblox.com
// (protocoles roblox-player: et roblox:), comme Bloxstrap. Les valeurs d'origine sont sauvegardées.
const { app } = require('electron');
const { regAdd, regQuery } = require('./system');

const PROTOCOLS = ['roblox-player', 'roblox'];
// BLOXPLUS_REG_BASE : racine du registre redirigeable pour les tests (jamais le vrai registre).
const REG_BASE = process.env.BLOXPLUS_REG_BASE || 'HKCU\\Software\\Classes';
const keyFor = (p) => `${REG_BASE}\\${p}\\shell\\open\\command`;

function ourCommand() {
  if (app.isPackaged) return `"${process.execPath}" "%1"`;
  return `"${process.execPath}" "${app.getAppPath()}" "%1"`;
}

async function isRegistered() {
  const cmd = await regQuery(keyFor('roblox-player'), null);
  return cmd === ourCommand();
}

async function register(store) {
  const backup = store.get('protocolBackup') || {};
  for (const p of PROTOCOLS) {
    const current = await regQuery(keyFor(p), null);
    if (current && current !== ourCommand()) backup[p] = current;
    await regAdd(`${REG_BASE}\\${p}`, null, `URL: ${p} Protocol`);
    await regAdd(`${REG_BASE}\\${p}`, 'URL Protocol', '');
    await regAdd(keyFor(p), null, ourCommand());
  }
  store.set('protocolBackup', backup);
}

async function unregister(store, playerExe) {
  const backup = store.get('protocolBackup') || {};
  for (const p of PROTOCOLS) {
    const value = backup[p] || (playerExe ? `"${playerExe}" %1` : null);
    if (value) await regAdd(keyFor(p), null, value);
  }
}

function extractUri(argv) {
  return argv.find((a) => /^roblox(-player)?:/i.test(a)) || null;
}

module.exports = { register, unregister, isRegistered, extractUri };
