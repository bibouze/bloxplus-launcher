// Outils partagés par toutes les vues.
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason?.message || e.reason)));

const Views = {};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  games: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>',
  friends: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/><circle cx="12" cy="14" r="1.5"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="16" cy="10" r="1.3"/><path d="M12 21a2 2 0 0 1 0-4h1.5a2.5 2.5 0 0 0 0-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  users: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  thumb: '<path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 21H7"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  memory: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 7v10M11 7v10M15 7v10M3 20h18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  wand: '<path d="m15 4 5 5L9 20l-5-5z"/><path d="M13 6l5 5"/><path d="M4 4v3M2.5 5.5h3M19 15v3M17.5 16.5h3"/>',
  broom: '<path d="M19 3 11 11"/><path d="M5 13c3-2 6-1 7 0s1 4-1 7c-3 0-7-2-8-5z"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.5M10 6.5h.5"/>',
  gamepad: '<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 12h3M8.5 10.5v3"/>',
  heart: '<path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const VERIFIED = '<svg class="verified" viewBox="0 0 24 24"><path d="M12 1.5l2.6 2.3 3.4-.4.9 3.3 3 1.7-1.2 3.2 1.2 3.2-3 1.7-.9 3.3-3.4-.4L12 22.5l-2.6-2.3-3.4.4-.9-3.3-3-1.7 1.2-3.2-1.2-3.2 3-1.7.9-3.3 3.4.4z"/><path d="m8 12 3 3 5-6" stroke="#fff" stroke-width="2" fill="none"/></svg>';

function fmtDuration(sec, short = false) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (short) return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${sec} s`;
}
function fmtClock(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtNum(n) {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' Md';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + ' k';
  return String(n);
}
function timeAgo(ts) {
  if (!ts) return 'jamais';
  const s = (Date.now() - ts) / 1000;
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
function fmtBytes(b) {
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(1) + ' Go';
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(0) + ' Mo';
  return Math.round(b / 1024) + ' Ko';
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div>${esc(msg)}</div>`;
  $('#toasts').append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3800);
  setTimeout(() => el.remove(), 4200);
}

// Exécute une action asynchrone avec un bouton en état de chargement et un toast en cas d'erreur.
async function busy(btn, fn) {
  const html = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  try {
    return await fn();
  } catch (e) {
    toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'bad');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = html; }
  }
}

function toggleHtml(id, checked) {
  return `<label class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></label>`;
}

function emptyHtml(ic, text) {
  return `<div class="empty">${icon(ic)}<div>${text}</div></div>`;
}

// ---------- API Roblox (passent par le processus principal) ----------
const Rbx = {
  get: (url, ttl = 60e3) => bp.api({ url, ttl }),
  post: (url, body, ttl = 0) => bp.api({ url, method: 'POST', body, ttl }),

  async batch(ids, size, fn) {
    const out = [];
    for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
    return out;
  },

  async userThumbs(ids, type = 'avatar-headshot', size = '150x150') {
    ids = [...new Set(ids)].filter(Boolean);
    const list = await this.batch(ids, 100, async (chunk) =>
      (await this.get(`https://thumbnails.roblox.com/v1/users/${type}?userIds=${chunk.join(',')}&size=${size}&format=Png&isCircular=false`, 3600e3)).data || []);
    return Object.fromEntries(list.map((t) => [t.targetId, t.imageUrl]));
  },

  async gameIcons(universeIds) {
    universeIds = [...new Set(universeIds)].filter(Boolean);
    const list = await this.batch(universeIds, 50, async (chunk) =>
      (await this.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${chunk.join(',')}&size=256x256&format=Png&isCircular=false`, 3600e3)).data || []);
    return Object.fromEntries(list.map((t) => [t.targetId, t.imageUrl]));
  },

  async gameBanner(universeId) {
    const r = await this.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=1&size=768x432&format=Png`, 3600e3);
    return r.data?.[0]?.thumbnails?.[0]?.imageUrl || null;
  },

  async games(universeIds) {
    universeIds = [...new Set(universeIds)].filter(Boolean);
    return this.batch(universeIds, 50, async (chunk) => (await this.get(`https://games.roblox.com/v1/games?universeIds=${chunk.join(',')}`, 120e3)).data || []);
  },

  async universeOf(placeId) {
    return (await this.get(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, 86400e3)).universeId;
  },

  async users(ids) {
    ids = [...new Set(ids)].filter(Boolean);
    return this.batch(ids, 100, async (chunk) => (await this.post('https://users.roblox.com/v1/users', { userIds: chunk, excludeBannedUsers: false }, 3600e3)).data || []);
  },

  async presence(ids) {
    ids = [...new Set(ids)].filter(Boolean);
    return this.batch(ids, 50, async (chunk) => (await this.post('https://presence.roblox.com/v1/presence/users', { userIds: chunk })).userPresences || []);
  },

  async userByName(name) {
    const r = await this.post('https://users.roblox.com/v1/usernames/users', { usernames: [name], excludeBannedUsers: true });
    return r.data?.[0] || null;
  },
};

const PRESENCE = {
  0: { cls: '', label: 'Hors ligne' },
  1: { cls: 'online', label: 'En ligne' },
  2: { cls: 'ingame', label: 'En jeu' },
  3: { cls: 'studio', label: 'Dans Studio' },
  4: { cls: '', label: 'Invisible' },
};

function presenceLine(p) {
  if (!p) return '<span class="muted">Statut inconnu</span>';
  const info = PRESENCE[p.userPresenceType] || PRESENCE[0];
  if (p.userPresenceType === 2) return `<span class="badge game">${esc(p.lastLocation || 'En jeu')}</span>`;
  if (p.userPresenceType === 3) return `<span class="badge warn">Studio${p.lastLocation && p.lastLocation !== 'Studio' ? ' · ' + esc(p.lastLocation) : ''}</span>`;
  if (p.userPresenceType === 1) return '<span class="badge ok">En ligne</span>';
  return `<span class="muted">${info.label}</span>`;
}

function launchPlace(placeId, jobId) {
  let uri = `roblox://experiences/start?placeId=${encodeURIComponent(placeId)}`;
  if (jobId) uri += `&gameInstanceId=${encodeURIComponent(jobId)}`;
  return bp.roblox.launch(uri).then((r) => {
    toast(`Lancement de Roblox (${r.version})…`, 'ok');
    (r.warnings || []).forEach((w) => toast(w, 'warn'));
  });
}

function gameCardHtml(g, iconUrl, extra = '') {
  return `
    <div class="game-card" data-universe="${g.universeId || g.id}" data-place="${g.rootPlaceId || ''}">
      <div class="thumb">${iconUrl ? `<img src="${esc(iconUrl)}" loading="lazy" alt="">` : ''}${extra}</div>
      <div class="info">
        <div class="name ellipsis" title="${esc(g.name)}">${esc(g.name)}</div>
        <div class="sub">
          <span>${icon('users')}${fmtNum(g.playerCount ?? g.playing)}</span>
          ${g.totalUpVotes != null ? `<span>${icon('thumb')}${Math.round((g.totalUpVotes / Math.max(1, g.totalUpVotes + g.totalDownVotes)) * 100)}%</span>` : ''}
        </div>
      </div>
    </div>`;
}

function modal(html, { onClose } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
  const back = $('.modal-back', root);
  const close = () => { root.innerHTML = ''; onClose?.(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  return { el: $('.modal', root), close };
}
