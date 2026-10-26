// Installateur Roblox : manifeste, hôtes autorisés, MD5, nettoyage. Faux CDN HTTP local, dossiers temporaires, sans réseau.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const installer = require('../lib/installer');

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bp-inst-'));
const VERSION = 'version-0123456789abcdef';

// ---------- parseManifest ----------

test('parseManifest : manifeste valide', () => {
  const m = installer.parseManifest(`v0\r\nRobloxApp.zip\r\n${'A'.repeat(32)}\r\n10\r\n20\r\nshaders.zip\r\n${'b'.repeat(32)}\r\n5\r\n8\r\n`);
  assert.deepStrictEqual(m, [
    { name: 'RobloxApp.zip', md5: 'a'.repeat(32), size: 10, rawSize: 20 },
    { name: 'shaders.zip', md5: 'b'.repeat(32), size: 5, rawSize: 8 },
  ]);
});

test('parseManifest : refuse un en-tête inconnu, un MD5 ou une taille invalides', () => {
  assert.throws(() => installer.parseManifest('v1\nx\ny'), /inconnu/);
  assert.throws(() => installer.parseManifest(`v0\nA.zip\nnon-md5\n1\n1`), /invalide/);
  assert.throws(() => installer.parseManifest(`v0\nA.zip\n${'a'.repeat(32)}\nxx\n1`), /invalide/);
});

test('parseManifest : manifeste vide ou sans paquet complet → liste vide', () => {
  assert.deepStrictEqual(installer.parseManifest('v0\n'), []);
});

// ---------- Faux CDN ----------

function zipWithPlayer() {
  const src = tmp();
  fs.writeFileSync(path.join(src, 'RobloxPlayerBeta.exe'), 'MZ-faux');
  const zip = path.join(tmp(), 'RobloxApp.zip');
  execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-cf', zip, '-C', src, 'RobloxPlayerBeta.exe']);
  return fs.readFileSync(zip);
}

// files : { '<chemin>': Buffer|string }. Renvoie { url, hits, close }.
async function fauxCdn(files) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const body = files[req.url];
    if (body === undefined) { res.statusCode = 404; return res.end(); }
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, hits, close: () => new Promise((r) => server.close(r)) };
}

const manifestFor = (zip, md5Value = md5(zip)) => `v0\r\nRobloxApp.zip\r\n${md5Value}\r\n${zip.length}\r\n${zip.length}\r\n`;

test('install : refuse un CDN hors liste (HTTPS inconnu) sans rien laisser', async () => {
  const versionsDir = tmp();
  await assert.rejects(installer.install(VERSION, { versionsDir, cdn: 'https://evil.example.com' }), /non autorisé/);
  assert.deepStrictEqual(fs.readdirSync(versionsDir), []);
});

test('install : refuse HTTP en clair sans l\'option de test, même vers localhost', async () => {
  const zip = zipWithPlayer();
  const cdn = await fauxCdn({ [`/${VERSION}-rbxPkgManifest.txt`]: manifestFor(zip) });
  try {
    const versionsDir = tmp();
    await assert.rejects(installer.install(VERSION, { versionsDir, cdn: cdn.url }), /non autorisé/);
    assert.strictEqual(cdn.hits.length, 0, 'aucune requête ne doit partir');
    assert.deepStrictEqual(fs.readdirSync(versionsDir), []);
  } finally { await cdn.close(); }
});

test('install : succès (MD5 bon) → dossier de version, AppSettings.xml, pas de .partial', async () => {
  const zip = zipWithPlayer();
  const cdn = await fauxCdn({
    [`/${VERSION}-rbxPkgManifest.txt`]: manifestFor(zip),
    [`/${VERSION}-RobloxApp.zip`]: zip,
  });
  try {
    const versionsDir = tmp();
    const phases = new Set();
    const dir = await installer.install(VERSION, { versionsDir, cdn: cdn.url, allowLocalHttp: true, onProgress: (p) => phases.add(p.phase) });
    assert.strictEqual(dir, path.join(versionsDir, VERSION));
    assert.ok(fs.existsSync(path.join(dir, 'RobloxPlayerBeta.exe')));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'AppSettings.xml'), 'utf8'), installer.APP_SETTINGS_XML);
    assert.ok(!fs.existsSync(path.join(dir, '.dl')));
    assert.deepStrictEqual(fs.readdirSync(versionsDir), [VERSION]);
    assert.ok(phases.has('download') && phases.has('extract'));
  } finally { await cdn.close(); }
});

test('install : MD5 faux → échec propre, aucun .partial ni version créée', async () => {
  const zip = zipWithPlayer();
  const cdn = await fauxCdn({
    [`/${VERSION}-rbxPkgManifest.txt`]: manifestFor(zip, 'f'.repeat(32)),
    [`/${VERSION}-RobloxApp.zip`]: zip,
  });
  try {
    const versionsDir = tmp();
    await assert.rejects(installer.install(VERSION, { versionsDir, cdn: cdn.url, allowLocalHttp: true }), /corrompu/);
    assert.deepStrictEqual(fs.readdirSync(versionsDir), []);
  } finally { await cdn.close(); }
});

test('install : paquet principal absent du manifeste → échec propre', async () => {
  const cdn = await fauxCdn({ [`/${VERSION}-rbxPkgManifest.txt`]: `v0\r\nshaders.zip\r\n${'a'.repeat(32)}\r\n1\r\n1\r\n` });
  try {
    const versionsDir = tmp();
    await assert.rejects(installer.install(VERSION, { versionsDir, cdn: cdn.url, allowLocalHttp: true }), /principal/);
    assert.deepStrictEqual(fs.readdirSync(versionsDir), []);
  } finally { await cdn.close(); }
});

// ---------- Versions installées ----------

test('findInstalled / cleanOld : ne touchent que les dossiers version-* de BloxPlus', () => {
  const root = tmp();
  for (const n of ['version-aaa', 'version-bbb', 'version-ccc.partial', 'autre']) fs.mkdirSync(path.join(root, n));
  fs.writeFileSync(path.join(root, 'version-aaa', 'RobloxPlayerBeta.exe'), '');
  assert.strictEqual(installer.findInstalled('version-aaa', [tmp(), root]), path.join(root, 'version-aaa'));
  assert.strictEqual(installer.findInstalled('version-bbb', [root]), null); // pas d'exe
  assert.strictEqual(installer.cleanOld(root, 'version-aaa'), 2);
  assert.deepStrictEqual(fs.readdirSync(root).sort(), ['autre', 'version-aaa']);
});

test('ensure : version déjà installée (racine supplémentaire) → pas de téléchargement', async () => {
  const official = tmp();
  fs.mkdirSync(path.join(official, VERSION));
  fs.writeFileSync(path.join(official, VERSION, 'RobloxPlayerBeta.exe'), '');
  const cdn = await fauxCdn({ '/v': JSON.stringify({ clientVersionUpload: VERSION, version: '0.1' }) });
  try {
    const r = await installer.ensure({ versionsDir: tmp(), extraRoots: [official], clientVersionUrl: `${cdn.url}/v`, allowLocalHttp: true });
    assert.deepStrictEqual(r, { version: VERSION, updated: false, dir: path.join(official, VERSION) });
    assert.deepStrictEqual(cdn.hits, ['/v']);
  } finally { await cdn.close(); }
});

test('latestVersion : réponse invalide → erreur claire', async () => {
  const cdn = await fauxCdn({ '/ok': '{"clientVersionUpload":"pas-une-version"}', '/ko': 'pas du json' });
  try {
    const o = { allowLocalHttp: true };
    await assert.rejects(installer.latestVersion({ ...o, clientVersionUrl: `${cdn.url}/ok` }), /invalide/);
    await assert.rejects(installer.latestVersion({ ...o, clientVersionUrl: `${cdn.url}/ko` }), /illisible/);
  } finally { await cdn.close(); }
});
