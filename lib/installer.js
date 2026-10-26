// Installation et mise à jour de Roblox par BloxPlus, sans le launcher officiel.
// Source : CDN officiel de Roblox. Chaque paquet est vérifié par son MD5 (celui du manifeste) avant extraction ;
// l'extraction se fait avec tar.exe de Windows (aucune dépendance npm). Jamais de suppression dans le dossier
// de l'installation officielle (%LOCALAPPDATA%\Roblox) : seules les versions de BloxPlus peuvent être effacées.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const { run } = require('./system');

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
const DEFAULT_VERSIONS_DIR = path.join(localAppData, 'BloxPlus', 'Versions');

const CLIENT_VERSION_URL = 'https://clientsettings.roblox.com/v2/client-version/WindowsPlayer';
const CDN = 'https://setup.rbxcdn.com';
const ALLOWED_HOSTS = [/^clientsettings\.roblox\.com$/, /^setup\.rbxcdn\.com$/];
// Paquets du manifeste qu'on n'installe volontairement pas (WebView2 est déjà dans Windows 11).
const SKIPPED = new Set(['WebView2RuntimeInstaller.zip', 'RobloxPlayerInstaller.exe', 'RobloxPlayerLauncher.exe']);

// Dossier d'extraction de chaque paquet dans le dossier de version ('' = racine).
const PACKAGE_DIRS = {
  'RobloxApp.zip': '',
  'WebView2.zip': '',
  'shaders.zip': 'shaders',
  'ssl.zip': 'ssl',
  'content-avatar.zip': 'content/avatar',
  'content-configs.zip': 'content/configs',
  'content-fonts.zip': 'content/fonts',
  'content-sky.zip': 'content/sky',
  'content-sounds.zip': 'content/sounds',
  'content-textures2.zip': 'content/textures',
  'content-models.zip': 'content/models',
  'content-platform-fonts.zip': 'PlatformContent/pc/fonts',
  'content-platform-dictionaries.zip': 'PlatformContent/pc/shared_compression_dictionaries',
  'content-terrain.zip': 'PlatformContent/pc/terrain',
  'content-textures3.zip': 'PlatformContent/pc/textures',
  'extracontent-luapackages.zip': 'ExtraContent/LuaPackages',
  'extracontent-translations.zip': 'ExtraContent/translations',
  'extracontent-models.zip': 'ExtraContent/models',
  'extracontent-textures.zip': 'ExtraContent/textures',
  'extracontent-places.zip': 'ExtraContent/places',
};

const APP_SETTINGS_XML = '<?xml version="1.0" encoding="UTF-8"?>\r\n<Settings>\r\n\t<ContentFolder>content</ContentFolder>\r\n\t<BaseUrl>http://www.roblox.com</BaseUrl>\r\n</Settings>\r\n';

const tarExe = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

// ---------- Réseau ----------

// `allowLocalHttp` : option de test (serveur local qui simule le CDN) ; jamais activée en production.
// `hosts` : liste d'expressions d'hôtes HTTPS autorisés (Roblox par défaut ; lib/shaders.js passe la sienne).
function hostAllowed(u, allowLocalHttp, hosts = ALLOWED_HOSTS) {
  if (u.protocol === 'https:') return hosts.some((re) => re.test(u.hostname));
  return !!allowLocalHttp && u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
}

// Messages pour le joueur : erreurs réseau et disque courantes.
function friendly(e) {
  const known = {
    ENOTFOUND: 'Pas de connexion à Internet (serveur de Roblox introuvable).',
    EAI_AGAIN: 'Pas de connexion à Internet (serveur de Roblox introuvable).',
    ECONNRESET: 'La connexion à Roblox a été coupée.',
    ECONNREFUSED: 'Connexion à Roblox refusée.',
    ETIMEDOUT: 'Roblox ne répond pas (délai dépassé).',
    ENOSPC: "Plus assez d'espace disque pour installer Roblox.",
    EPERM: "Windows refuse l'accès au dossier d'installation (antivirus ?). Réessayez.",
    EBUSY: "Un fichier de l'installation est utilisé par un autre programme. Réessayez.",
    EACCES: "Windows refuse l'accès au dossier d'installation.",
  };
  return known[e?.code] || e?.message || 'Erreur inconnue';
}

// GET en flux, redirections suivies (hôtes autorisés seulement). Résout avec la réponse HTTP 200.
// o : { allowLocalHttp, timeoutMs, hosts }
function get(url, o = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error('Adresse invalide')); }
    if (!hostAllowed(u, o.allowLocalHttp, o.hosts)) return reject(new Error(`Hôte non autorisé : ${u.hostname}`));
    const req = (u.protocol === 'http:' ? http : https).get(u, { headers: { 'user-agent': 'BloxPlus-Launcher' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('Trop de redirections'));
        return resolve(get(new URL(res.headers.location, u).toString(), o, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} sur ${u.hostname}${u.pathname}`));
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(o.timeoutMs || 30000, () => req.destroy(Object.assign(new Error('Délai dépassé'), { code: 'ETIMEDOUT' })));
  });
}

async function getText(url, o) {
  const res = await get(url, o);
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// Télécharge `url` vers `file`, calcule le MD5 au fil de l'eau, appelle onBytes(n) à chaque morceau reçu.
async function downloadTo(url, file, onBytes, o) {
  const res = await get(url, o);
  const hash = crypto.createHash('md5');
  let size = 0;
  res.on('data', (c) => { hash.update(c); size += c.length; onBytes?.(c.length, Number(res.headers['content-length']) || 0); });
  await pipeline(res, fs.createWriteStream(file)); // ferme les deux flux si l'un échoue
  return { md5: hash.digest('hex'), size };
}

// Extrait une archive (zip, ou exécutable qui en contient une) avec tar.exe de Windows ; `members` limite les fichiers.
async function extract(file, dest, members = []) {
  fs.mkdirSync(dest, { recursive: true });
  const r = await run(tarExe(), ['-xf', file, '-C', dest, ...members], { timeout: 300000 });
  if (!r.ok) throw new Error(`Extraction de ${path.basename(file)} impossible : ${(r.stderr || r.err?.message || '').trim().slice(0, 200)}`);
}

// ---------- Version et manifeste ----------

async function latestVersion(opts = {}) {
  const text = await getText(opts.clientVersionUrl || CLIENT_VERSION_URL, { allowLocalHttp: opts.allowLocalHttp, timeoutMs: 10000 });
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('Réponse de Roblox illisible (version).'); }
  if (!/^version-[0-9a-f]+$/i.test(j.clientVersionUpload || '')) throw new Error('Version de Roblox invalide.');
  return { version: j.clientVersionUpload, clientVersion: j.version || null };
}

// Manifeste : « v0 » puis, pour chaque paquet, 4 lignes (nom, MD5, taille compressée, taille décompressée).
function parseManifest(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== 'v0') throw new Error('Manifeste de paquets Roblox inconnu.');
  const out = [];
  for (let i = 1; i + 4 <= lines.length; i += 4) {
    const [name, md5, size, rawSize] = lines.slice(i, i + 4);
    if (!/^[0-9a-f]{32}$/i.test(md5 || '') || !/^\d+$/.test(size || '')) throw new Error(`Manifeste invalide près de « ${name} ».`);
    out.push({ name, md5: md5.toLowerCase(), size: Number(size), rawSize: Number(rawSize) });
  }
  return out;
}

// ---------- Versions installées ----------

const hasPlayer = (dir) => fs.existsSync(path.join(dir, 'RobloxPlayerBeta.exe'));

// Dossier de la version `version` dans l'une des racines données (BloxPlus d'abord), ou null.
function findInstalled(version, roots) {
  for (const root of roots) {
    const dir = path.join(root, version);
    if (hasPlayer(dir)) return dir;
  }
  return null;
}

// Supprime les anciennes versions installées par BloxPlus (jamais celles du launcher officiel) sauf `keep`.
function cleanOld(versionsDir, keep) {
  let removed = 0;
  let entries = [];
  try { entries = fs.readdirSync(versionsDir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === keep) continue;
    if (!/^version-[0-9a-f]+(\.partial)?$/i.test(e.name)) continue;
    try { fs.rmSync(path.join(versionsDir, e.name), { recursive: true, force: true }); removed++; } catch { /* verrouillé : plus tard */ }
  }
  return removed;
}

// L'antivirus analyse souvent les fichiers fraîchement extraits : le renommage peut échouer brièvement.
async function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); } catch (e) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ---------- Installation ----------

/**
 * Installe `version` dans <versionsDir>/<version>. Renvoie le dossier.
 * opts : { versionsDir, cdn, onProgress({phase, version, done, total, message?}), concurrency }
 */
async function install(version, opts = {}) {
  const versionsDir = opts.versionsDir || DEFAULT_VERSIONS_DIR;
  const cdn = opts.cdn || CDN;
  const progress = (phase, done, total, message) => opts.onProgress?.({ phase, version, done, total, ...(message ? { message } : {}) });
  const finalDir = path.join(versionsDir, version);
  const stage = `${finalDir}.partial`;

  fs.mkdirSync(versionsDir, { recursive: true });
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, '.dl'), { recursive: true });

  try {
    const net = { allowLocalHttp: opts.allowLocalHttp };
    const manifest = parseManifest(await getText(`${cdn}/${version}-rbxPkgManifest.txt`, { ...net, timeoutMs: 15000 }));
    const packages = manifest.filter((p) => p.name in PACKAGE_DIRS);
    const unknown = manifest.filter((p) => !(p.name in PACKAGE_DIRS) && !SKIPPED.has(p.name)).map((p) => p.name);
    if (unknown.length) console.warn(`[installer] paquets inconnus ignorés : ${unknown.join(', ')}`);
    if (!packages.some((p) => p.name === 'RobloxApp.zip')) throw new Error('Le paquet principal de Roblox est introuvable.');
    const total = packages.reduce((a, p) => a + p.size, 0);

    // Téléchargement (quelques paquets en parallèle), chacun vérifié par son MD5.
    let done = 0;
    let lastEmit = 0;
    const bump = (n) => {
      done += n;
      const now = Date.now();
      if (now - lastEmit > 150) { lastEmit = now; progress('download', done, total); }
    };
    progress('download', 0, total);
    const queue = [...packages].sort((a, b) => b.size - a.size);
    let cancelled = false; // un paquet a échoué : les autres téléchargements s'arrêtent avant le nettoyage
    const workers = Array.from({ length: Math.min(opts.concurrency || 3, queue.length) }, async () => {
      while (queue.length && !cancelled) {
        const pkg = queue.shift();
        const file = path.join(stage, '.dl', pkg.name);
        let lastErr;
        for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
          let counted = 0;
          try {
            const r = await downloadTo(`${cdn}/${version}-${pkg.name}`, file, (n) => { counted += n; bump(n); }, net);
            if (r.md5 !== pkg.md5 || r.size !== pkg.size) throw new Error(`Paquet ${pkg.name} corrompu (MD5 ou taille différents).`);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            done -= counted; // on repart de zéro pour ce paquet
            fs.rmSync(file, { force: true });
          }
        }
        if (lastErr) { cancelled = true; throw lastErr; }
      }
    });
    const results = await Promise.allSettled(workers); // attend tous les workers avant tout nettoyage
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    progress('download', total, total);

    // Extraction avec tar.exe.
    let extracted = 0;
    progress('extract', 0, packages.length);
    for (const pkg of packages) {
      const dest = path.join(stage, PACKAGE_DIRS[pkg.name]);
      fs.mkdirSync(dest, { recursive: true });
      await extract(path.join(stage, '.dl', pkg.name), dest);
      progress('extract', ++extracted, packages.length);
    }

    if (!hasPlayer(stage)) throw new Error("RobloxPlayerBeta.exe est absent après l'extraction.");
    fs.writeFileSync(path.join(stage, 'AppSettings.xml'), APP_SETTINGS_XML);
    fs.rmSync(path.join(stage, '.dl'), { recursive: true, force: true });

    fs.rmSync(finalDir, { recursive: true, force: true });
    await renameWithRetry(stage, finalDir);
    return finalDir;
  } catch (e) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw Object.assign(new Error(friendly(e)), { code: e.code });
  }
}

/**
 * Vérifie la version courante et installe si elle manque (ni dans BloxPlus ni dans le launcher officiel).
 * L'ancienne version de BloxPlus n'est supprimée qu'après le succès, et pas si Roblox tourne (isRunning).
 * Renvoie { version, updated, dir }.
 * opts : { versionsDir, extraRoots: [dossiers lus en plus], onProgress, isRunning: async () => bool, ...install opts }
 */
async function ensure(opts = {}) {
  const versionsDir = opts.versionsDir || DEFAULT_VERSIONS_DIR;
  const roots = [versionsDir, ...(opts.extraRoots || [])];
  const progress = (phase, version, done, total, message) => opts.onProgress?.({ phase, version, done, total, ...(message ? { message } : {}) });

  progress('check', null, 0, 0);
  let latest;
  try {
    latest = await latestVersion(opts);
  } catch (e) {
    const err = Object.assign(new Error(friendly(e)), { code: e.code });
    progress('error', null, 0, 0, err.message);
    throw err;
  }
  const existing = findInstalled(latest.version, roots);
  if (existing) {
    progress('done', latest.version, 0, 0);
    return { version: latest.version, updated: false, dir: existing };
  }
  try {
    const dir = await install(latest.version, { ...opts, versionsDir });
    if (!(await opts.isRunning?.())) cleanOld(versionsDir, latest.version);
    progress('done', latest.version, 0, 0);
    return { version: latest.version, updated: true, dir };
  } catch (e) {
    progress('error', latest.version, 0, 0, e.message);
    throw e;
  }
}

module.exports = {
  DEFAULT_VERSIONS_DIR, PACKAGE_DIRS, APP_SETTINGS_XML,
  latestVersion, parseManifest, findInstalled, cleanOld, install, ensure, friendly,
  get, getText, downloadTo, extract,
};
