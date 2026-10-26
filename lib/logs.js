// Lecture des logs de Roblox (%LOCALAPPDATA%\Roblox\logs) : jeux et serveurs rejoints, durée des sessions.
// Sert au suivi en direct (tracker.js), à la reconstruction des sessions jouées pendant que BloxPlus était fermé
// (mode léger, CONTRACTS §2.3 bis) et à l'import des anciens jeux (§2.5).
// Ligne type : 2026-10-24T18:46:52.019Z,12.345,1a2b,6 [FLog::Output] ...
const fs = require('fs');
const path = require('path');

const JOIN_RE = /! Joining game '([0-9a-f-]+)' place (\d+) at ([\d.]+)/;
const UNIVERSE_RE = /placeid:(\d+),.*?universeid:(\d+)/;
const UDMUX_RE = /UDMUX Address = ([\d.]+), Port = \d+/;
const LEAVE_RE = /\[FLog::Network\] Time to disconnect replication data|Client:Disconnect/;
const TS_RE = /^(\d{4}-\d\d-\d\dT[\d:.]+Z),/;

// Logs du joueur (un par processus RobloxPlayerBeta), du plus récent au plus ancien.
function listPlayerLogs(dir) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (!name.includes('_Player_') || name.includes('CrashHandler')) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile()) out.push({ name, full, mtime: st.mtimeMs, size: st.size });
    } catch { /* supprimé entre-temps */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Analyse le texte d'un log.
 * → { start, end, segments: [{ jobId, placeId, universeId, start, end }] } (millisecondes ; start/end null si aucune date).
 * Un segment va de « Joining game » à la déconnexion (ou au dernier horodatage du log).
 */
function parseLog(text) {
  let start = null;
  let end = null;
  const segments = [];
  let cur = null;
  const close = (t) => { if (cur) { cur.end = t ?? cur.start; segments.push(cur); cur = null; } };
  for (const line of text.split(/\r?\n/)) {
    const tm = line.match(TS_RE);
    const t = tm ? Date.parse(tm[1]) : null;
    if (t != null && !Number.isNaN(t)) { if (start == null) start = t; end = t; }
    let m;
    if ((m = line.match(JOIN_RE))) {
      close(t);
      cur = { jobId: m[1], placeId: Number(m[2]), universeId: null, start: t ?? end ?? 0, end: null };
    } else if (cur && (m = line.match(UNIVERSE_RE)) && Number(m[1]) === cur.placeId) {
      cur.universeId = Number(m[2]);
    } else if (cur && LEAVE_RE.test(line)) {
      close(t);
    }
  }
  close(end);
  return { start, end, segments };
}

// Sessions des logs modifiés depuis `sinceMs` : [{ name, start, end, segments }], du plus ancien au plus récent.
// `maxFiles` borne le travail ; un log illisible est ignoré.
function readSessions(dir, sinceMs, maxFiles = 60) {
  const out = [];
  for (const f of listPlayerLogs(dir).filter((l) => l.mtime >= sinceMs).slice(0, maxFiles)) {
    let text;
    try { text = fs.readFileSync(f.full, 'utf8'); } catch { continue; }
    const p = parseLog(text);
    if (p.start != null && p.end != null) out.push({ name: f.name, mtime: f.mtime, ...p });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Comme readSessions, sans bloquer le processus principal, pour tous les logs récents (import au démarrage).
 * `skip(f)` écarte un log déjà traité. → { sessions, scanned: [{ name, mtime }] } (scanned = tous les logs examinés).
 */
async function readSessionsAsync(dir, { maxFiles = 80, skip } = {}) {
  const sessions = [];
  const scanned = [];
  for (const f of listPlayerLogs(dir).slice(0, maxFiles)) {
    scanned.push({ name: f.name, mtime: f.mtime });
    if (skip?.(f)) continue;
    let text;
    try { text = await fs.promises.readFile(f.full, 'utf8'); } catch { continue; }
    const p = parseLog(text);
    if (p.start != null && p.end != null) sessions.push({ name: f.name, mtime: f.mtime, ...p });
  }
  return { sessions: sessions.sort((a, b) => a.start - b.start), scanned };
}

// Réunit des intervalles [début, fin] qui se chevauchent (plusieurs instances = un seul temps de jeu).
function mergeIntervals(list) {
  const sorted = list.filter((i) => i.end > i.start).map((i) => [i.start, i.end]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// Découpe [start, end] par jour UTC (même convention que playtime.byDay) → { 'AAAA-MM-JJ': secondes }.
function secondsByDay(start, end) {
  const out = {};
  for (let t = start; t < end;) {
    const day = new Date(t).toISOString().slice(0, 10);
    const next = Math.min(end, Date.parse(day) + 86400e3);
    out[day] = (out[day] || 0) + (next - t) / 1000;
    t = next;
  }
  return out;
}

/**
 * Ajoute à `playtime` le temps des sessions lues dans les logs (mode léger : BloxPlus était fermé pendant la partie).
 * Temps total / XP / jours : union des sessions (plusieurs instances ne comptent qu'une fois, comme le tracker).
 * Par jeu : durée de chaque segment. `counted` (liste de noms de logs déjà comptés) évite tout doublon.
 * Renvoie { seconds, sessions, counted }.
 */
function applySessions(playtime, sessions, counted = []) {
  const fresh = sessions.filter((s) => !counted.includes(s.name));
  let seconds = 0;
  for (const [s, e] of mergeIntervals(fresh)) {
    for (const [day, sec] of Object.entries(secondsByDay(s, e))) {
      playtime.byDay[day] = (playtime.byDay[day] || 0) + sec;
      seconds += sec;
    }
  }
  playtime.totalSeconds += seconds;
  playtime.xp += seconds / 60;
  for (const s of fresh) {
    for (const g of s.segments) {
      const entry = playtime.byPlace[String(g.placeId)] ||= { seconds: 0, lastPlayed: 0, universeId: null, name: null };
      entry.seconds += Math.max(0, (g.end - g.start) / 1000);
      entry.lastPlayed = Math.max(entry.lastPlayed || 0, g.end);
      if (g.universeId) entry.universeId = g.universeId;
    }
  }
  return { seconds, sessions: fresh.length, counted: [...counted, ...fresh.map((s) => s.name)].slice(-50) };
}

/**
 * Import des anciens logs (CONTRACTS §2.5) : complète lastPlayed / universeId de chaque jeu, sans toucher aux
 * secondes (aucun temps inventé) et sans doublon (lastPlayed ne fait que monter). Renvoie le nombre de jeux modifiés.
 */
function importHistory(playtime, sessions) {
  let changed = 0;
  for (const s of sessions) {
    for (const g of s.segments) {
      const key = String(g.placeId);
      const entry = playtime.byPlace[key] ||= { seconds: 0, lastPlayed: 0, universeId: null, name: null };
      let touched = false;
      if (g.end > (entry.lastPlayed || 0)) { entry.lastPlayed = g.end; touched = true; }
      if (g.universeId && !entry.universeId) { entry.universeId = g.universeId; touched = true; }
      if (touched) changed++;
    }
  }
  return changed;
}

module.exports = {
  JOIN_RE, UNIVERSE_RE, UDMUX_RE, LEAVE_RE,
  listPlayerLogs, parseLog, readSessions, readSessionsAsync, mergeIntervals, secondsByDay, applySessions, importHistory,
};
