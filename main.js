// BloxPlus Launcher — processus principal.
const { app, BrowserWindow, ipcMain, shell, Notification, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { JsonStore } = require('./lib/store');
const { findPlayerVersionDir } = require('./lib/paths');
const fflags = require('./lib/fflags');
const gamesettings = require('./lib/gamesettings');
const mods = require('./lib/mods');
const shaders = require('./lib/shaders');
const optimizer = require('./lib/optimizer');
const protocol = require('./lib/protocol');
const api = require('./lib/api');
const { Tracker, levelFromXp } = require('./lib/tracker');
const { pidsOf, spawnDetached } = require('./lib/system');

const DEFAULTS = {
  fflags: {},
  fflagsImported: false,
  preset: null,
  hardware: null,
  launch: { multiInstance: false, applyMods: true, highPriority: false, minimizeOnLaunch: true },
  shaders: { enabled: false, preset: '1-naturel' },
  overlay: { enabled: false },
  notify: { friends: true, serverRegion: false, adminInServer: true },
  profile: { userId: null, username: null, displayName: null },
  favorites: [],
  friendSeen: {},
  adminWatch: { ids: [] },
  playtime: { totalSeconds: 0, xp: 0, byDay: {}, byPlace: {} },
  accent: '#7c5cff',
  protocolEnabled: false,
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
let mutexHolder = null;
const tracker = new Tracker(store);

// ---------- Lancement de Roblox ----------

function prepareVersion() {
  const v = findPlayerVersionDir();
  if (!v) throw new Error("Roblox n'est pas installé (RobloxPlayerBeta.exe introuvable). Installez-le depuis roblox.com.");
  fflags.writeToVersion(v.dir, store.data.fflags);
  const warnings = [];
  try {
    if (store.data.launch.applyMods) mods.apply(v.dir, modsDir);
    else mods.restore(v.dir);
  } catch (e) { warnings.push(`Mods : ${e.message}`); }
  try {
    const r = shaders.apply(v.dir, reshadeStore, presetsDir, store.data.shaders);
    if (r === 'missing') warnings.push("Shaders activés mais ReShade n'est pas encore importé.");
  } catch (e) { warnings.push(`Shaders : ${e.message}`); }
  return { v, warnings };
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

async function launch(uri) {
  const running = (await pidsOf('RobloxPlayerBeta.exe')).length > 0;
  if (store.data.launch.multiInstance) ensureMultiInstanceMutex();
  else if (running && !uri) throw new Error('Roblox est déjà ouvert. Activez le multi-instance dans BetterBLOX pour ouvrir plusieurs fenêtres.');

  const { v, warnings } = prepareVersion();
  spawnDetached(v.exe, uri ? [uri] : [], { cwd: v.dir });

  if (store.data.launch.highPriority) {
    setTimeout(async () => {
      for (const pid of await pidsOf('RobloxPlayerBeta.exe')) {
        try { os.setPriority(pid, os.constants.priority.PRIORITY_HIGH); } catch { /* droits insuffisants */ }
      }
    }, 10000);
  }
  if (store.data.launch.minimizeOnLaunch && mainWindow && !CAPTURE) mainWindow.minimize();
  return { ok: true, version: v.name, warnings };
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
tracker.on('started', () => {
  if (store.data.overlay.enabled) showOverlay();
  send('tracker:event', { type: 'started', state: tracker.state() });
});
tracker.on('stopped', () => {
  hideOverlay();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  send('tracker:event', { type: 'stopped', state: tracker.state() });
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
  if (!uid) return;
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
}

function hideOverlay() {
  overlayWindow?.close();
  overlayWindow = null;
}

setInterval(() => {
  if (overlayWindow) overlayWindow.webContents.send('overlay:update', { ...tracker.state(), today: store.data.playtime.byDay[new Date().toISOString().slice(0, 10)] || 0 });
}, 1000);

// ---------- Fenêtre ----------

function send(channel, payload) {
  mainWindow?.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1040, minHeight: 680,
    frame: false, backgroundColor: '#090b11', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => { if (!CAPTURE) mainWindow.show(); });
  mainWindow.on('maximize', () => send('win:state', { maximized: true }));
  mainWindow.on('unmaximize', () => send('win:state', { maximized: false }));
  mainWindow.on('closed', () => { mainWindow = null; hideOverlay(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  if (CAPTURE) mainWindow.webContents.once('did-finish-load', runCapture);
}

// Mode capture : enregistre une image de chaque onglet (utilisé pour la doc et les tests).
async function runCapture() {
  const out = process.env.CAPTURE_DIR || path.join(__dirname, 'captures');
  fs.mkdirSync(out, { recursive: true });
  const tabs = ['home', 'games', 'friends', 'admins', 'better', 'optimize', 'shaders', 'settings'];
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
  return findPlayerVersionDir();
}

const handlers = {
  'app:info': () => {
    const v = currentVersion();
    return { version: app.getVersion(), roblox: v ? { dir: v.dir, name: v.name } : null, userData, modsDir };
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
    return store.data;
  },
  'api:request': (opts) => api.request(opts),

  'roblox:launch': (uri) => {
    if (uri != null && !/^roblox(-player)?:/i.test(uri)) throw new Error('Lien de lancement invalide');
    return launch(uri);
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

  'shaders:status': () => shaders.status(currentVersion()?.dir, reshadeStore),
  'shaders:presets': () => shaders.listPresets(presetsDir),
  'shaders:import': () => {
    const v = currentVersion();
    if (!v) throw new Error('Roblox introuvable');
    return shaders.importFromRoblox(v.dir, reshadeStore);
  },
  'shaders:set': async (cfg) => {
    store.set('shaders', { ...store.data.shaders, ...cfg });
    const v = currentVersion();
    const running = (await pidsOf('RobloxPlayerBeta.exe')).length > 0;
    let result = 'pending';
    if (v && !running) result = shaders.apply(v.dir, reshadeStore, presetsDir, store.data.shaders);
    return { result, running };
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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
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

    const uri = protocol.extractUri(process.argv);
    if (uri) {
      await handleUri(uri);
      // Lancé depuis le site : on ne garde que le suivi en arrière-plan, sans fenêtre.
    }
    createWindow();
    if (uri) mainWindow.once('ready-to-show', () => mainWindow.minimize());

    if (store.data.protocolEnabled && !(await protocol.isRegistered())) await protocol.register(store);
    if (!CAPTURE) {
      tracker.start();
      setInterval(watchFriends, 90e3);
      setInterval(watchAdmins, 60e3);
      setTimeout(watchFriends, 5000);
    }
  });

  app.on('window-all-closed', () => {
    tracker.stop();
    releaseMultiInstanceMutex();
    app.quit();
  });
}
