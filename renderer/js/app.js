// Démarrage, navigation et état global.
const NAV = [
  { section: 'Jouer' },
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'games', label: 'Jeux & serveurs', icon: 'games' },
  { id: 'friends', label: 'Amis', icon: 'friends' },
  { id: 'admins', label: 'Admins', icon: 'shield' },
  { section: 'Améliorer' },
  { id: 'better', label: 'BetterBLOX', icon: 'sparkles' },
  { id: 'optimize', label: 'Optimisation', icon: 'gauge' },
  { id: 'shaders', label: 'Shaders', icon: 'palette' },
  { section: 'Launcher' },
  { id: 'settings', label: 'Paramètres', icon: 'settings' },
];

const App = {
  current: null,
  store: null,
  info: null,
  state: { running: false, instances: 0, sessionSeconds: 0, current: null },
  sessionTimer: null,

  async init() {
    [this.store, this.info, this.state] = await Promise.all([bp.store.get(), bp.info(), bp.roblox.state()]);
    this.applyAccent(this.store.accent);
    this.renderNav();
    this.renderProfile();
    this.renderSessionPill();

    $$('[data-win]').forEach((b) => b.addEventListener('click', () => bp.win[b.dataset.win]()));
    $('#profile-mini').addEventListener('click', () => this.go('settings'));
    bp.on('tracker:event', (ev) => {
      if (ev.state) this.state = ev.state;
      this.renderSessionPill();
      if (ev.type === 'admins') toast('Un admin a été détecté dans ton serveur !', 'warn');
      Views[this.current]?.onTracker?.(ev);
    });
    // Le compteur de session avance localement entre deux événements.
    this.sessionTimer = setInterval(() => {
      if (this.state.running) { this.state.sessionSeconds++; this.renderSessionPill(); }
    }, 1000);
    setInterval(async () => { this.state = await bp.roblox.state(); this.renderSessionPill(); }, 15000);

    this.go('home');
  },

  async setStore(key, value) {
    this.store = await bp.store.set(key, value);
    return this.store;
  },

  applyAccent(color) {
    document.documentElement.style.setProperty('--accent', color || '#7c5cff');
  },

  renderNav() {
    $('#nav').innerHTML = NAV.map((n) => n.section
      ? `<div class="nav-section">${n.section}</div>`
      : `<button class="nav-item" data-view="${n.id}">${icon(n.icon)}<span>${n.label}</span><span class="count" data-count="${n.id}" hidden></span></button>`).join('');
    $$('.nav-item').forEach((b) => b.addEventListener('click', () => this.go(b.dataset.view)));
  },

  setCount(id, n) {
    const el = $(`[data-count="${id}"]`);
    if (!el) return;
    el.hidden = !n;
    el.textContent = n;
  },

  async renderProfile() {
    const p = this.store.profile;
    const el = $('#profile-mini');
    if (!p.userId) {
      el.innerHTML = `<div class="ph"></div><div><div class="name">Invité</div><div class="sub">Ajouter mon pseudo Roblox</div></div>`;
      return;
    }
    el.innerHTML = `<div class="ph"></div><div class="ellipsis"><div class="name ellipsis">${esc(p.displayName || p.username)}</div><div class="sub">@${esc(p.username)}</div></div>`;
    try {
      const t = await Rbx.userThumbs([p.userId]);
      if (t[p.userId]) el.querySelector('.ph').outerHTML = `<img src="${esc(t[p.userId])}" alt="">`;
    } catch { /* hors ligne */ }
  },

  renderSessionPill() {
    const el = $('#session-pill');
    const s = this.state;
    el.hidden = !s.running;
    if (!s.running) return;
    const where = s.current?.name ? `<b>${esc(s.current.name)}</b>` : '<b>Roblox ouvert</b>';
    const inst = s.instances > 1 ? ` · ${s.instances} fenêtres` : '';
    el.innerHTML = `<span class="live"></span>${where}<span>${fmtClock(s.sessionSeconds)}${inst}${s.current?.region ? ' · ' + esc(s.current.region) : ''}</span>`;
  },

  async go(id) {
    if (!Views[id]) return;
    if (this.current && Views[this.current].leave) Views[this.current].leave();
    this.current = id;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
    const view = $('#view');
    view.scrollTop = 0;
    view.innerHTML = '<div class="fade-in" id="view-inner"></div>';
    try {
      await Views[id].render($('#view-inner'));
    } catch (e) {
      $('#view-inner').innerHTML = `<div class="notice bad">${icon('alert')}<div>Erreur : ${esc(e.message)}</div></div>`;
      window.__errors.push(`${id}: ${e.message}`);
    }
  },
};

App.init();
