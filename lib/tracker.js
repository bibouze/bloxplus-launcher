// Suivi des sessions : détecte quand Roblox tourne, lit ses logs pour savoir dans quel jeu / serveur
// on se trouve, et cumule le temps de jeu.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { pidsOf } = require('./system');
const { logsDir } = require('./paths');

const { JOIN_RE, UNIVERSE_RE, UDMUX_RE, LEAVE_RE } = require('./logs');

const POLL_MS = 5000;

class Tracker extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.running = false;
    this.pids = [];
    this.sessionStart = 0;
    this.current = null; // { placeId, universeId, jobId, ip, since }
    this.logFile = null;
    this.logOffset = 0;
    this.lastTick = Date.now();
    this.ticks = 0;
    this.muted = false; // vrai quand le mode léger passe le relais : le temps sera relu dans les logs au retour
  }

  start() {
    this.timer = setInterval(() => this.tick().catch(() => {}), POLL_MS);
    this.tick().catch(() => {});
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.fastTimer);
    this.flush();
  }

  // Après un lancement : vérifie toutes les 2 s (au lieu de 5 s) jusqu'à voir Roblox, 90 s au plus.
  watchStart() {
    clearTimeout(this.fastTimer);
    const until = Date.now() + 90000;
    const step = () => {
      this.tick().catch(() => {}).finally(() => {
        if (!this.running && Date.now() < until && this.timer) this.fastTimer = setTimeout(step, 2000);
      });
    };
    this.fastTimer = setTimeout(step, 2000);
  }

  state() {
    return {
      running: this.running,
      instances: this.pids.length,
      sessionSeconds: this.running ? Math.round((Date.now() - this.sessionStart) / 1000) : 0,
      current: this.current,
    };
  }

  async tick() {
    const now = Date.now();
    const elapsed = Math.min(now - this.lastTick, POLL_MS * 3);
    this.lastTick = now;

    const pids = await pidsOf('RobloxPlayerBeta.exe');
    this.pids = pids;
    const wasRunning = this.running;
    this.running = pids.length > 0;

    if (this.running && !wasRunning) {
      this.sessionStart = now;
      this.logFile = null;
      // initial : Roblox tournait déjà à l'ouverture de BloxPlus (le joueur l'a ouvert exprès).
      this.emit('started', { pids, initial: this.ticks === 0 });
    }
    this.ticks++;
    if (!this.running && wasRunning) {
      this.leave();
      this.flush();
      this.emit('stopped');
      return;
    }
    if (!this.running) return;

    if (this.muted) return;
    this.readLog();
    this.addTime(elapsed / 1000);
  }

  // Lit uniquement les nouvelles lignes du log Player le plus récent.
  readLog() {
    let newest = null;
    try {
      for (const name of fs.readdirSync(logsDir)) {
        if (!name.includes('_Player_')) continue;
        const full = path.join(logsDir, name);
        const st = fs.statSync(full);
        if (!newest || st.mtimeMs > newest.mtime) newest = { full, mtime: st.mtimeMs, size: st.size };
      }
    } catch { return; }
    if (!newest) return;
    if (newest.full !== this.logFile) {
      // Nouveau log : on le lit depuis le début seulement s'il a été créé pendant cette session.
      this.logFile = newest.full;
      this.logOffset = newest.mtime >= this.sessionStart - 60000 ? 0 : newest.size;
    }
    if (newest.size <= this.logOffset) return;
    let chunk;
    try {
      const fd = fs.openSync(newest.full, 'r');
      const buf = Buffer.alloc(newest.size - this.logOffset);
      fs.readSync(fd, buf, 0, buf.length, this.logOffset);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch { return; }
    this.logOffset = newest.size;

    for (const line of chunk.split(/\r?\n/)) {
      let m;
      if ((m = line.match(JOIN_RE))) {
        this.leave();
        this.current = { jobId: m[1], placeId: Number(m[2]), universeId: null, ip: null, since: Date.now() };
      } else if (this.current && (m = line.match(UNIVERSE_RE)) && Number(m[1]) === this.current.placeId) {
        this.current.universeId = Number(m[2]);
      } else if (this.current && (m = line.match(UDMUX_RE))) {
        this.current.ip = m[1];
        this.emit('joined', { ...this.current });
      } else if (this.current && LEAVE_RE.test(line)) {
        this.leave();
      }
    }
  }

  leave() {
    if (!this.current) return;
    this.emit('left', { ...this.current });
    this.current = null;
  }

  addTime(seconds) {
    const pt = this.store.data.playtime;
    pt.totalSeconds += seconds;
    pt.xp += seconds / 60;
    const day = new Date().toISOString().slice(0, 10);
    pt.byDay[day] = (pt.byDay[day] || 0) + seconds;
    if (this.current) {
      const key = String(this.current.placeId);
      const entry = pt.byPlace[key] ||= { seconds: 0, lastPlayed: 0, universeId: null, name: null };
      entry.seconds += seconds;
      entry.lastPlayed = Date.now();
      if (this.current.universeId) entry.universeId = this.current.universeId;
    }
    if (Date.now() - (this.lastSave || 0) > 60000) this.flush();
  }

  flush() {
    this.lastSave = Date.now();
    this.store.save();
  }
}

// Niveau à partir de l'XP (1 XP par minute de jeu).
function levelFromXp(xp) {
  const level = Math.floor(Math.sqrt(xp / 30)) + 1;
  const curr = 30 * (level - 1) ** 2;
  const next = 30 * level ** 2;
  return { level, progress: (xp - curr) / (next - curr), xpToNext: Math.ceil(next - xp) };
}

module.exports = { Tracker, levelFromXp };
