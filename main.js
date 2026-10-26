// BloxPlus Launcher — processus principal.
const { app, BrowserWindow, ipcMain, shell, Notification, screen, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { JsonStore } = require('./lib/store');
const { findPlayerVersionDir, versionRoots, bloxplusVersions, logsDir } = require('./lib/paths');
const installer = require('./lib/installer');
const fflags = require('./lib/fflags');
const gamesettings = require('./lib/gamesettings');
const mods = require('./lib/mods');
const shaders = require('./lib/shaders');
const optimizer = require('./lib/optimizer');
const protocol = require('./lib/protocol');
const api = require('./lib/api');
const { Tracker, levelFromXp } = require('./lib/tracker');
const logs = require('./lib/logs');
const { pidsOf, spawnDetached } = require('./lib/system');

const DEFAULTS = {
  fflags: {},
  fflagsImported: false,
  preset: null,
  hardware: null,
  launch: { multiInstance: false, applyMods: true, highPriority: false, playMode: 'leger' },
  pendingSince: null, // mode léger : début de la partie en cours pendant que BloxPlus est fermé (ms)
  countedLogs: [], // logs Roblox dont le temps a déjà été ajouté (évite les doublons)
  logsImported: {}, // logs Roblox déjà lus pour les jeux récents : nom → date de modification
  shaders: { enabled: false, preset: '1-naturel' },
  overlay: { enabled: false },
  notify: { friends: true, serverRegion: false, adminInServer: true },
  profile: { userId: null, username: null, displayName: null },
  favorites: [],
  friendSeen: {},
  adminWatch: { ids: [] },
  playtime: { totalSeconds: 0, xp: 0, byDay: {}, byPlace: {} },
  accent: '#7c5cff',
  protocolEnabled: true,
  roblox: { latest: null },
  protocolBackup: {},
};

const CAPTURE = process.argv.includes('--capture');
const userData = app.getPath('userData');
const store = new JsonStore(path.join(userData, 'config.json'), DEFAULTS);
const modsDir = path.join(userData, 'mods');
const reshadeStore = path.join(userData, 'reshade');
const presetsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'presets', 'reshade')
  : path.join(__dirname, 'presets', 'reshade');

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let playHidden = false; // fenêtre détruite exprès pendant le jeu : ne pas quitter
let overlayTimer = null;
let mutexHolder = null;
const tracker = new Tracker(store);

// ---------- Lancement de Roblox ----------

function prepareVersion(v, warnings) {
  fflags.writeToVersion(v.dir, store.data.fflags);
  try {
    if (store.data.launch.applyMods) mods.apply(v.dir, modsDir);
    else mods.restore(v.dir);
  } catch (e) { warnings.push(`Mods : ${e.message}`); }
  try {
    const r = shaders.apply(v.dir, reshadeStore, presetsDir, store.data.shaders);
    if (r === 'missing') {
      installShaders().then(() => applyShadersIfIdle()).catch(() => { /* signalé par shaders:progress */ });
      warnings.push('Shaders : téléchargement de ReShade en cours, ils seront actifs au prochain lancement.');
    }
  } catch (e) { warnings.push(`Shaders : ${e.message}`); }
}

// ReShade et les shaders sont téléchargés une seule fois (promesse partagée), avec l'avancement en direct.
let shaderInstall = null;
function installShaders() {
  if (!shaderInstall) {
    shaderInstall = shaders.install(reshadeStore, { onProgress: (p) => send('shaders:progress', p) }).finally(() => { shaderInstall = null; });
  }
  return shaderInstall;
}

// Fin du téléchargement : on installe dans la version de Roblox si elle n'est pas ouverte (sinon au prochain lancement).
async function applyShadersIfIdle() {
  const v = currentVersion();
  if (!v || !store.data.shaders.enabled || (await pidsOf('RobloxPlayerBeta.exe')).length) return;
  try { shaders.apply(v.dir, reshadeStore, presetsDir, store.data.shaders); } catch { /* retenté au lancement */ }
}

// Garde le mutex de Roblox pour autoriser plusieurs fenêtres (comme Bloxstrap / BetterStrap).
function ensureMultiInstanceMutex() {
  if (mutexHolder && mutexHolder.exitCode === null) return;
  const script = `$m = New-Object System.Threading.Mutex($false, 'ROBLOX_singletonMutex'); [void]$m.WaitOne(0); Wait-Process -Id ${process.pid}`;
  mutexHolder = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, stdio: 'ignore' });
}

function releaseMultiInstanceMutex() {
  if (mutexHolder && mutexHolder.exitCode === null) mutexHolder.kill();
  mutexHolder = null;
}

// ---------- Installation / mise à jour de Roblox par BloxPlus ----------

function emitProgress(p) {
  send('roblox:progress', p);
  // Lancé sans fenêtre (clic sur le site) : on montre l'avancement si Roblox doit être installé.
  if ((p.phase === 'download' || p.phase === 'extract') && !mainWindow && !CAPTURE) showMainWindow(true);
}

let installing = null;
function installRoblox() {
  if (!installing) {
    installing = installer.ensure({
      extraRoots: versionRoots.filter((r) => r !== bloxplusVersions),
      onProgress: emitProgress,
      isRunning: async () => (await pidsOf('RobloxPlayerBeta.exe')).length > 0,
    }).then((r) => {
      if (store.data.roblox.latest !== r.version) { store.data.roblox.latest = r.version; store.save(); }
      return r;
    }).finally(() => { installing = null; });
  }
  return installing;
}

// Efface les versions de BloxPlus devenues inutiles (une mise à jour faite pendant une partie ne les a pas nettoyées).
async function cleanOldVersions() {
  try {
    const v = currentVersion();
    if (!v || !v.managedByBloxPlus || (await pidsOf('RobloxPlayerBeta.exe')).length) return;
    installer.cleanOld(bloxplusVersions, path.basename(v.dir));
  } catch { /* sans importance */ }
}

// BloxPlus doit rester le programme associé à roblox:// (le launcher officiel reprend l'association à ses mises à jour).
async function ensureProtocol() {
  if (CAPTURE || !store.data.protocolEnabled) return;
  try { if (!(await protocol.isRegistered())) await protocol.register(store); } catch { /* registre inaccessible */ }
}

async function launch(uri) {
  const running = (await pidsOf('RobloxPlayerBeta.exe')).length > 0;
  if (store.data.launch.multiInstance) ensureMultiInstanceMutex();
  else if (running && !uri) throw new Error('Roblox est déjà ouvert. Activez le multi-instance dans Paramètres pour ouvrir plusieurs fenêtres.');

  const warnings = [];
  let updated = false;
  try {
    updated = (await installRoblox()).updated;
  } catch (e) {
    if (!currentVersion()) throw new Error(`Roblox n'a pas pu être installé : ${e.message}`);
    warnings.push(`Mise à jour de Roblox impossible (${e.message}) : la version déjà installée est utilisée.`);
  }
  const v = currentVersion();
  if (!v) throw new Error('Roblox est introuvable.');
  prepareVersion(v, warnings);
  spawnDetached(v.exe, uri ? [uri] : ['--app'], { cwd: v.dir });
  ensureProtocol();

  if (store.data.launch.highPriority) {
    setTimeout(async () => {
      for (const pid of await pidsOf('RobloxPlayerBeta.exe')) {
        try { os.setPriority(pid, os.constants.priority.PRIORITY_HIGH); } catch { /* droits insuffisants */ }
      }
    }, 10000);
  }
  tracker.watchStart();
  return { ok: true, version: v.name, warnings, updated };
}

// ---------- Mode de jeu léger : passage de relais au gardien (CONTRACTS §2.3 bis) ----------

function gardienPath() {
  // Emballé : resources/gardien.exe (extraResources) ; en développement : native/gardien/ (npm run build:gardien).
  const candidates = [path.join(process.resourcesPath || '', 'gardien.exe'), path.join(__dirname, 'native', 'gardien', 'gardien.exe')];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// BloxPlus quitte entièrement ; le gardien (quelques Mo) le relance avec --after-play quand Roblox est fermé.
// Renvoie false si le gardien est introuvable : BloxPlus reste alors en mode complet.
function handOffToGardien() {
  const g = gardienPath();
  if (!g) return false;
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const args = ['--relaunch', exe];
  // electron.exe a besoin du dossier de l'application (hors version installée) ; --user-data-dir est transmis tel quel (essais).
  const extra = [...(app.isPackaged ? [] : [app.getAppPath()]), ...process.argv.filter((a) => a.startsWith('--user-data-dir='))];
  if (extra.length) args.push('--args', extra.map((a) => `"${a}"`).join(' '));
  if (store.data.launch.multiInstance) args.push('--multi');

  const previous = store.data.pendingSince;
  tracker.muted = true; // le temps de cette partie sera relu dans les logs
  store.data.pendingSince = Math.min(previous || Infinity, tracker.sessionStart);
  tracker.flush();
  const child = spawnDetached(g, args, { windowsHide: true });
  child.once('error', () => { // gardien impossible à lancer : on reste là
    tracker.muted = false;
    store.data.pendingSince = previous;
    enterPlayMode();
  });
  child.once('spawn', () => { releaseMultiInstanceMutex(); app.exit(0); });
  return true;
}

// Ajoute au temps de jeu les parties jouées pendant que BloxPlus était fermé, d'après l'horodatage des logs Roblox.
function reconstructSessions() {
  const since = store.data.pendingSince;
  if (!since) return;
  try {
    const sessions = logs.readSessions(logsDir, since - 60000).filter((s) => s.start >= since - 60000);
    const r = logs.applySessions(store.data.playtime, sessions, store.data.countedLogs);
    store.data.countedLogs = r.counted;
  } catch { /* logs illisibles : on abandonne ce relevé, sans bloquer le démarrage */ }
  store.data.pendingSince = null;
  store.save();
}

// Jeux récents dès le premier lancement (CONTRACTS §2.5) : complète lastPlayed / universeId d'après les anciens logs,
// sans toucher aux secondes (aucun temps inventé). Chaque log n'est lu qu'une fois tant qu'il ne change pas.
async function importOldGames() {
  try {
    const seen = store.data.logsImported;
    const { sessions, scanned } = await logs.readSessionsAsync(logsDir, { skip: (f) => seen[f.name] === f.mtime });
    const changed = logs.importHistory(store.data.playtime, sessions);
    store.data.logsImported = Object.fromEntries(scanned.map((f) => [f.name, f.mtime]));
    if (changed || sessions.length) store.save();
  } catch { /* logs illisibles : les jeux récents se rempliront en jouant */ }
}

// ---------- Infos sur le jeu en cours ----------

async function gameName(placeId, universeId) {
  try {
    const uid = universeId || (await api.request({ url: `https://apis.roblox.com/universes/v1/places/${placeId}/universe`, ttl: 3600e3 })).universeId;
    const g = await api.request({ url: `https://games.roblox.com/v1/games?universeIds=${uid}`, ttl: 600e3 });
    return { universeId: uid, name: g.data?.[0]?.name || null };
  } catch { return { universeId, name: null }; }
}

tracker.on('joined', async (cur) => {
  const info = await gameName(cur.placeId, cur.universeId);
  const entry = store.data.playtime.byPlace[String(cur.placeId)];
  if (entry && info.name) { entry.name = info.name; entry.universeId = info.universeId; }
  if (tracker.current?.jobId === cur.jobId) tracker.current.name = info.name;

  if (store.data.notify.serverRegion && cur.ip) {
    try {
      const geo = await api.request({ url: `https://ipinfo.io/${cur.ip}/json`, ttl: 86400e3 });
      const region = [geo.city, geo.region, geo.country].filter(Boolean).join(', ');
      if (tracker.current?.jobId === cur.jobId) tracker.current.region = region;
      notify('Serveur rejoint', `${info.name || 'Jeu'} — serveur situé à ${region}`);
    } catch { /* service indisponible */ }
  }
  send('tracker:event', { type: 'joined', state: tracker.state() });
});
tracker.on('left', () => send('tracker:event', { type: 'left', state: tracker.state() }));
tracker.on('started', ({ initial } = {}) => {
  // Roblox tournait déjà à l'ouverture de BloxPlus : le joueur l'a ouvert exprès, on ne le cache pas.
  // Si une partie en mode léger est en cours, son temps sera relu dans les logs à la fin.
  if (initial && store.data.pendingSince) tracker.muted = true;
  if (!initial && !CAPTURE && store.data.launch.playMode !== 'complet' && handOffToGardien()) return;
  if (store.data.overlay.enabled) showOverlay();
  send('tracker:event', { type: 'started', state: tracker.state() });
  syncWatchers();
  if (!initial && !CAPTURE) enterPlayMode();
});
tracker.on('stopped', () => {
  if (store.data.pendingSince) { reconstructSessions(); tracker.muted = false; }
  hideOverlay();
  alertedAdmins.clear();
  syncWatchers();
  showMainWindow();
  send('tracker:event', { type: 'stopped', state: tracker.state() });
  ensureProtocol();
});

// ---------- Surveillance : amis en ligne & admins dans le serveur ----------

async function presenceOf(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await api.request({ url: 'https://presence.roblox.com/v1/presence/users', method: 'POST', body: { userIds: ids.slice(i, i + 50) } });
    out.push(...(r.userPresences || []));
  }
  return out;
}

let lastFriendState = null;
async function watchFriends() {
  const uid = store.data.profile.userId;
  if (!uid || !store.data.notify.friends) return;
  try {
    const fr = await api.request({ url: `https://friends.roblox.com/v1/users/${uid}/friends`, ttl: 300e3 });
    const ids = (fr.data || []).map((f) => f.id);
    if (!ids.length) return;
    const pres = await presenceOf(ids);
    const now = Date.now();
    const state = {};
    for (const p of pres) {
      state[p.userId] = p.userPresenceType;
      if (p.userPresenceType > 0) store.data.friendSeen[p.userId] = now;
    }
    store.save();
    if (lastFriendState && store.data.notify.friends) {
      const cameOnline = pres.filter((p) => p.userPresenceType > 0 && !(lastFriendState[p.userId] > 0));
      if (cameOnline.length) {
        const users = await api.request({ url: 'https://users.roblox.com/v1/users', method: 'POST', body: { userIds: cameOnline.map((p) => p.userId) }, ttl: 3600e3 });
        for (const u of users.data || []) {
          const p = cameOnline.find((x) => x.userId === u.id);
          notify(`${u.displayName} est en ligne`, p.userPresenceType === 2 ? `Joue à ${p.lastLocation || 'un jeu'}` : 'Sur Roblox');
        }
      }
    }
    lastFriendState = state;
  } catch { /* réseau */ }
}

// Les surveillances ne tournent que si une notification en dépend (légèreté).
let friendsTimer = null;
let adminsTimer = null;
function syncWatchers() {
  if (CAPTURE) return;
  const wantFriends = store.data.notify.friends && !!store.data.profile.userId;
  const wantAdmins = store.data.notify.adminInServer && (store.data.adminWatch.ids || []).length > 0 && tracker.running;
  if (wantFriends && !friendsTimer) {
    friendsTimer = setInterval(watchFriends, 90e3);
    setTimeout(watchFriends, 5000);
  } else if (!wantFriends && friendsTimer) {
    clearInterval(friendsTimer);
    friendsTimer = null;
    lastFriendState = null;
  }
  if (wantAdmins && !adminsTimer) adminsTimer = setInterval(watchAdmins, 60e3);
  else if (!wantAdmins && adminsTimer) { clearInterval(adminsTimer); adminsTimer = null; }
}

const alertedAdmins = new Set();
async function watchAdmins() {
  const cur = tracker.current;
  const ids = store.data.adminWatch.ids || [];
  if (!cur || !ids.length || !store.data.notify.adminInServer) return;
  try {
    const pres = await presenceOf(ids);
    const inServer = pres.filter((p) => p.gameId && p.gameId === cur.jobId);
    if (inServer.length) {
      const users = await api.request({ url: 'https://users.roblox.com/v1/users', method: 'POST', body: { userIds: inServer.map((p) => p.userId) }, ttl: 3600e3 });
      for (const u of users.data || []) {
        const key = `${cur.jobId}:${u.id}`;
        if (alertedAdmins.has(key)) continue;
        alertedAdmins.add(key);
        notify('Admin dans ton serveur !', `${u.displayName} (@${u.name}) est sur le même serveur que toi.`);
      }
      send('tracker:event', { type: 'admins', admins: inServer.map((p) => p.userId) });
    }
  } catch { /* réseau */ }
}

function notify(title, body) {
  if (CAPTURE || !Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

// ---------- Overlay du temps de jeu ----------

function showOverlay() {
  if (overlayWindow) return;
  const { workArea } = screen.getPrimaryDisplay();
  overlayWindow = new BrowserWindow({
    width: 250, height: 70, x: workArea.x + workArea.width - 270, y: workArea.y + 20,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, focusable: false,
    alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));
  overlayWindow.once('ready-to-show', () => overlayWindow?.showInactive());
  overlayWindow.on('closed', () => { overlayWindow = null; });
  overlayTimer = setInterval(() => {
    overlayWindow?.webContents.send('overlay:update', { ...tracker.state(), today: store.data.playtime.byDay[new Date().toISOString().slice(0, 10)] || 0 });
  }, 1000);
}

function hideOverlay() {
  clearInterval(overlayTimer);
  overlayTimer = null;
  overlayWindow?.close();
  overlayWindow = null;
}

// ---------- Fenêtre ----------

function send(channel, payload) {
  mainWindow?.webContents.send(channel, payload);
}

// Pendant le jeu : fenêtre détruite (processus de rendu libéré), seule l'icône de notification reste.
function enterPlayMode() {
  playHidden = true;
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip('BloxPlus — en jeu');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir BloxPlus', click: () => showMainWindow(true) },
      { label: 'Quitter', click: () => { playHidden = false; app.quit(); } },
    ]));
    tray.on('click', () => showMainWindow(true));
  }
  if (mainWindow) mainWindow.destroy();
}

// Affiche BloxPlus au premier plan (recrée la fenêtre si elle a été détruite). Appelé quand Roblox se ferme.
function showMainWindow(force = false) {
  if (!force && !playHidden && !mainWindow) return;
  playHidden = false;
  if (tray) { tray.destroy(); tray = null; }
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  bringToFront(mainWindow);
}

function bringToFront(win) {
  win.show();
  win.setAlwaysOnTop(true);
  win.moveTop();
  win.focus();
  win.setAlwaysOnTop(false);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1040, minHeight: 680,
    frame: false, backgroundColor: '#090b11', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => { if (!CAPTURE) bringToFront(mainWindow); });
  mainWindow.on('maximize', () => send('win:state', { maximized: true }));
  mainWindow.on('unmaximize', () => send('win:state', { maximized: false }));
  mainWindow.on('closed', () => { mainWindow = null; if (!playHidden) hideOverlay(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  if (CAPTURE) mainWindow.webContents.once('did-finish-load', runCapture);
}

// Mode capture : enregistre une image de chaque onglet (utilisé pour la doc et les tests).
async function runCapture() {
  const out = process.env.CAPTURE_DIR || path.join(__dirname, 'captures');
  fs.mkdirSync(out, { recursive: true });
  const tabs = ['home', 'games', 'friends', 'admins', 'optimize', 'shaders', 'settings'];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(2500);
  for (const tab of tabs) {
    await mainWindow.webContents.executeJavaScript(`App.go('${tab}')`);
    await wait(tab === 'admins' || tab === 'games' || tab === 'optimize' ? 7000 : 3000);
    const img = await mainWindow.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${tab}.png`), img.toPNG());
  }
  await mainWindow.webContents.executeJavaScript("App.go('games'); Views.games.openGame(994732206)");
  await wait(7000);
  fs.writeFileSync(path.join(out, 'game-details.png'), (await mainWindow.webContents.capturePage()).toPNG());
  const errors = await mainWindow.webContents.executeJavaScript('window.__errors || []');
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors, null, 2));
  app.exit(0);
}

const EXTERNAL_OK = [/^https:\/\/(www\.)?roblox\.com\//, /^https:\/\/reshade\.me\//, /^https:\/\/github\.com\//, /^https:\/\/betterroblox\.com\//];
function openExternal(url) {
  if (EXTERNAL_OK.some((re) => re.test(url))) shell.openExternal(url);
}

// ---------- IPC ----------

function currentVersion() {
  return findPlayerVersionDir(store.data.roblox.latest);
}

const handlers = {
  'app:info': () => {
    const v = currentVersion();
    return { version: app.getVersion(), roblox: v ? { dir: v.dir, name: v.name, managedByBloxPlus: v.managedByBloxPlus } : null, userData, modsDir };
  },
  'win:minimize': () => mainWindow.minimize(),
  'win:maximize': () => (mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()),
  'win:close': () => mainWindow.close(),
  'shell:open': (url) => openExternal(url),
  'shell:openPath': (p) => {
    const allowed = [userData, modsDir, currentVersion()?.dir].filter(Boolean);
    if (allowed.some((a) => path.resolve(p).startsWith(path.resolve(a)))) return shell.openPath(p);
  },

  'store:get': () => store.data,
  'store:set': (key, value) => {
    const top = key.split('.')[0];
    if (!['launch', 'shaders', 'overlay', 'notify', 'profile', 'favorites', 'accent', 'adminWatch'].includes(top)) throw new Error('Clé non modifiable');
    store.set(key, value);
    if (key.startsWith('launch.multiInstance') && !value) releaseMultiInstanceMutex();
    if (key === 'overlay.enabled') (value && tracker.running ? showOverlay() : hideOverlay());
    if (/^(notify|adminWatch|profile)/.test(key)) syncWatchers();
    return store.data;
  },
  'api:request': (opts) => api.request(opts),

  'roblox:launch': (uri) => {
    if (uri != null && !/^roblox(-player)?:/i.test(uri)) throw new Error('Lien de lancement invalide');
    return launch(uri);
  },
  'roblox:install': async () => {
    const r = await installRoblox();
    return { version: r.version, updated: r.updated };
  },
  'roblox:state': () => tracker.state(),

  'fflags:get': () => ({ flags: store.data.fflags, allowlist: fflags.ALLOWLIST, presetFlags: fflags.PRESET_FLAGS }),
  'fflags:set': (flags) => {
    store.set('fflags', flags);
    const v = currentVersion();
    if (v) fflags.writeToVersion(v.dir, flags);
    return { ok: true, written: !!v };
  },

  'optimizer:detect': async () => {
    const hw = await optimizer.detectHardware();
    store.set('hardware', hw);
    return hw;
  },
  'optimizer:presets': () => optimizer.PRESETS,
  'optimizer:gameSettings': () => gamesettings.read(),
  'optimizer:apply': async (id) => {
    const preset = optimizer.PRESETS[id];
    if (!preset) throw new Error('Niveau inconnu');
    const flags = { ...store.data.fflags };
    for (const k of optimizer.PRESET_KEYS) delete flags[k];
    Object.assign(flags, preset.flags);
    store.data.fflags = flags;
    store.data.preset = id;
    store.save();
    const v = currentVersion();
    if (v) fflags.writeToVersion(v.dir, flags);
    const running = (await pidsOf('RobloxPlayerBeta.exe')).length > 0;
    let settingsWritten = false;
    if (!running) {
      settingsWritten = gamesettings.write({ ...preset.settings, FramerateCap: optimizer.framerateFor(id, store.data.hardware) });
    }
    return { ok: true, settingsWritten, running };
  },
  'optimizer:tweaks': async () => {
    const v = currentVersion();
    return v ? optimizer.windowsTweakState(v.exe) : { gpu: false, fso: false };
  },
  'optimizer:setTweak': async (name, on) => {
    const v = currentVersion();
    if (!v) throw new Error('Roblox introuvable');
    if (name === 'gpu') await optimizer.setHighPerformanceGpu(v.exe, on);
    if (name === 'fso') await optimizer.setFullscreenOptimizationsDisabled(v.exe, on);
    return optimizer.windowsTweakState(v.exe);
  },
  'optimizer:clean': () => optimizer.cleanCache(),

  'mods:list': () => mods.ensureModsDir(modsDir),
  'mods:open': () => { mods.ensureModsDir(modsDir); return shell.openPath(modsDir); },
  'mods:restore': () => {
    const v = currentVersion();
    return v ? mods.restore(v.dir) : 0;
  },

  'shaders:status': () => shaders.status(reshadeStore, store.data.shaders),
  'shaders:presets': () => shaders.listPresets(presetsDir),
  // → { result: 'applied' | 'pending' | 'downloading' | 'error', running, message? } (CONTRACTS §2.4)
  'shaders:set': async (cfg = {}) => {
    const next = { ...store.data.shaders };
    if (typeof cfg.enabled === 'boolean') next.enabled = cfg.enabled;
    if (typeof cfg.preset === 'string') {
      if (!fs.existsSync(path.join(presetsDir, `${path.basename(cfg.preset)}.ini`))) return { result: 'error', running: false, message: 'Style de shaders inconnu.' };
      next.preset = cfg.preset;
    }
    store.set('shaders', next);
    const running = (await pidsOf('RobloxPlayerBeta.exe')).length > 0;
    if (next.enabled && !shaders.status(reshadeStore, next).installed) {
      installShaders().then(() => applyShadersIfIdle()).catch(() => { /* l'erreur est déjà signalée par shaders:progress */ });
      return { result: 'downloading', running };
    }
    const v = currentVersion();
    if (!v || running) return { result: 'pending', running };
    try {
      shaders.apply(v.dir, reshadeStore, presetsDir, next);
      return { result: 'applied', running };
    } catch (e) {
      return { result: 'error', running, message: e.message };
    }
  },

  'protocol:get': () => protocol.isRegistered(),
  'protocol:set': async (on) => {
    if (on) await protocol.register(store);
    else await protocol.unregister(store, currentVersion()?.exe);
    store.set('protocolEnabled', on);
    return protocol.isRegistered();
  },

  'playtime:get': () => ({ ...store.data.playtime, level: levelFromXp(store.data.playtime.xp) }),
};

for (const [channel, fn] of Object.entries(handlers)) {
  ipcMain.handle(channel, (_e, ...args) => fn(...args));
}

// ---------- Démarrage ----------

async function handleUri(uri) {
  try {
    await launch(uri);
  } catch (e) {
    notify('BloxPlus', e.message);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const uri = protocol.extractUri(argv);
    if (uri) return handleUri(uri);
    showMainWindow(true);
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.bibouze.bloxplus');
    // Premier lancement : on reprend les FastFlags déjà présents dans Roblox pour ne rien perdre.
    if (!store.data.fflagsImported) {
      const v = currentVersion();
      if (v) store.data.fflags = { ...fflags.readFromVersion(v.dir), ...store.data.fflags };
      store.data.fflagsImported = true;
      store.save();
    }
    mods.ensureModsDir(modsDir);
    // minimizeOnLaunch (v1) → hideDuringPlay (1.1) → playMode (1.5) : on reprend le choix de l'utilisateur.
    const launchCfg = store.data.launch;
    if ('minimizeOnLaunch' in launchCfg) {
      launchCfg.hideDuringPlay = launchCfg.minimizeOnLaunch;
      delete launchCfg.minimizeOnLaunch;
    }
    if ('hideDuringPlay' in launchCfg) {
      launchCfg.playMode = launchCfg.hideDuringPlay === false ? 'complet' : 'leger';
      delete launchCfg.hideDuringPlay;
      store.save();
    }

    // Retour d'une partie jouée en mode léger (--after-play) ou reprise après un arrêt brutal : on relit les logs.
    if (store.data.pendingSince && !(await pidsOf('RobloxPlayerBeta.exe')).length) reconstructSessions();

    if (!CAPTURE) tracker.start();
    const uri = protocol.extractUri(process.argv);
    if (uri && !CAPTURE) {
      // Lancé depuis le site : pas de fenêtre, seulement l'icône ; elle apparaît à la fin de la partie
      // (ou tout de suite si Roblox ne démarre pas).
      enterPlayMode();
      await handleUri(uri);
      importOldGames();
      setTimeout(() => { if (playHidden && !tracker.running) showMainWindow(true); }, 120e3);
    } else {
      if (uri) await handleUri(uri);
      if (!CAPTURE) await importOldGames(); // avant la fenêtre : l'Accueil trouve déjà les jeux récents
      if (!mainWindow) createWindow(); // la mise à jour de Roblox a pu l'ouvrir déjà
      if (uri) mainWindow.once('ready-to-show', () => mainWindow.minimize());
    }

    await ensureProtocol();
    syncWatchers();
    cleanOldVersions();
  });

  app.on('before-quit', () => {
    tracker.stop();
    releaseMultiInstanceMutex();
  });

  app.on('window-all-closed', () => {
    if (playHidden) return; // en jeu : seule l'icône de notification reste
    tracker.stop();
    releaseMultiInstanceMutex();
    app.quit();
  });
}
