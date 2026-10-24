// Accueil : bouton Jouer, jeux récents (Rejoindre), amis en ligne / en jeu (Rejoindre), temps de jeu.
Views.home = {
  timer: null,

  async render(el) {
    const [pt, store] = [await bp.playtime(), App.store];
    const roblox = App.info.roblox;
    const today = new Date().toISOString().slice(0, 10);
    const presetName = { performance: 'Performance max', balanced: 'Équilibré', quality: 'Qualité', ultra: 'Beauté ultra' }[store.preset] || 'Non défini';
    const flagsCount = Object.keys(store.fflags).length;

    el.innerHTML = `
      <section class="hero">
        <h1>${store.profile.displayName ? `Salut ${esc(store.profile.displayName)} !` : 'Prêt à jouer ?'}</h1>
        <p>${roblox
          ? 'Roblox démarre avec tes optimisations, tes FastFlags, tes mods et tes shaders appliqués automatiquement.'
          : 'Roblox sera installé par BloxPlus au premier lancement, puis mis à jour tout seul.'}</p>
        <div class="row">
          <button class="btn primary lg play-btn" id="play">${icon('play')} Jouer</button>
          <div class="row" style="gap:8px">
            <input class="input" id="place-id" placeholder="ID du jeu ou lien roblox.com" style="width:260px">
            <button class="btn" id="join-place">Rejoindre</button>
          </div>
        </div>
        <div class="meta">
          <span class="badge">${icon('layers')} ${roblox ? esc(roblox.name) : 'Roblox pas encore installé'}</span>
          <span class="badge accent">${icon('gauge')} ${presetName}</span>
          <span class="badge">${icon('flag')} ${flagsCount} FastFlags</span>
          <span class="badge ${store.shaders.enabled ? 'ok' : ''}">${icon('palette')} Shaders ${store.shaders.enabled ? 'activés' : 'désactivés'}</span>
          ${store.launch.multiInstance ? `<span class="badge ok">${icon('window')} Multi-instance</span>` : ''}
        </div>
      </section>

      <div id="live"></div>

      <div class="card mt">
        <div class="card-title"><h2>${icon('gamepad')} Joués récemment</h2><button class="btn ghost sm" data-go="games">Explorer les jeux</button></div>
        <div id="recent" class="h-scroll"><div class="skeleton" style="height:210px;width:168px"></div></div>
      </div>

      <div class="card mt">
        <div class="card-title"><h2>${icon('friends')} Amis connectés</h2><button class="btn ghost sm" data-go="friends">Tous mes amis</button></div>
        <div id="friends-live"><div class="skeleton" style="height:76px"></div></div>
      </div>

      <div class="grid grid-4 mt">
        <div class="card stat"><span class="k">${icon('clock')} Temps de jeu total</span><span class="v">${fmtDuration(pt.totalSeconds, true)}</span></div>
        <div class="card stat"><span class="k">${icon('zap')} Aujourd'hui</span><span class="v">${fmtDuration(pt.byDay[today] || 0, true)}</span></div>
        <div class="card stat">
          <span class="k">${icon('trophy')} Niveau</span>
          <span class="v">${pt.level.level} <small>${Math.floor(pt.xp)} XP</small></span>
          <div class="bar"><i style="width:${Math.round(pt.level.progress * 100)}%"></i></div>
          <span class="small muted">${pt.level.xpToNext} XP avant le niveau ${pt.level.level + 1}</span>
        </div>
        <div class="card stat"><span class="k">${icon('gamepad')} Jeux joués</span><span class="v">${Object.keys(pt.byPlace).length}</span></div>
      </div>

      <div class="card mt">
        <div class="card-title"><h2>${icon('clock')} 7 derniers jours</h2></div>
        <div class="week-chart" id="week"></div>
      </div>`;

    this.renderWeek(el, pt);
    this.renderLive(el);

    el.querySelector('#play').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await bp.roblox.launch(null);
      toast(`Roblox se lance (${r.version})`, 'ok');
      (r.warnings || []).forEach((w) => toast(w, 'warn'));
    }));
    el.querySelector('#join-place').addEventListener('click', (e) => {
      const raw = el.querySelector('#place-id').value.trim();
      const id = raw.match(/games\/(\d+)/)?.[1] || raw.match(/^\d+$/)?.[0];
      if (!id) return toast('Colle un ID de jeu (chiffres) ou un lien roblox.com/games/…', 'warn');
      busy(e.currentTarget, () => launchPlace(id));
    });
    el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => App.go(b.dataset.go)));

    // Les deux listes se chargent en parallèle, sans bloquer l'affichage de l'Accueil.
    this.renderRecent(el, pt);
    this.renderFriends(el);
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (App.current === 'home') this.renderFriends(el); }, 90000);
  },

  leave() { clearInterval(this.timer); },

  renderWeek(el, pt) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''), sec: pt.byDay[key] || 0, today: i === 0 });
    }
    const max = Math.max(3600, ...days.map((d) => d.sec));
    el.querySelector('#week').innerHTML = days.map((d) => `
      <div class="col ${d.today ? 'today' : ''}" title="${fmtDuration(d.sec)}">
        <i style="height:${Math.max(3, (d.sec / max) * 100)}%"></i><span>${d.label}</span>
      </div>`).join('');
  },

  renderLive(el) {
    const box = el.querySelector('#live');
    if (!box) return;
    const s = App.state;
    if (!s.running) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="card mt" style="border-color: color-mix(in srgb, var(--ok) 35%, transparent)">
        <div class="row">
          <span class="status-dot online"></span>
          <b>Session en cours</b>
          <span class="muted">${s.current?.name ? esc(s.current.name) : 'Accueil Roblox'}</span>
          ${s.current?.region ? `<span class="badge">${icon('globe')} ${esc(s.current.region)}</span>` : ''}
          ${s.instances > 1 ? `<span class="badge ok">${s.instances} fenêtres</span>` : ''}
          <span class="spacer"></span>
          <span class="mono">${fmtClock(s.sessionSeconds)}</span>
        </div>
      </div>`;
  },

  onTracker() {
    const el = $('#view-inner');
    if (el) this.renderLive(el);
  },

  // Jeux récents : tri par lastPlayed (les anciens logs de Roblox sont importés par Cœur, voir CONTRACTS §2.5).
  async renderRecent(el, pt) {
    const box = el.querySelector('#recent');
    const recent = Object.entries(pt.byPlace)
      .map(([placeId, v]) => ({ placeId, ...v }))
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
      .slice(0, 12);
    if (!recent.length) {
      box.outerHTML = emptyHtml('gamepad', 'Tes jeux apparaîtront ici dès ta première partie.');
      return;
    }
    try {
      await Promise.all(recent.filter((r) => !r.universeId).map(async (r) => {
        try { r.universeId = await Rbx.universeOf(r.placeId); } catch { /* jeu supprimé ou hors ligne */ }
      }));
      const known = recent.map((r) => r.universeId).filter(Boolean);
      const [icons, games] = known.length
        ? await Promise.all([Rbx.gameIcons(known), Rbx.games(known)])
        : [{}, []];
      if (App.current !== 'home') return;
      const byU = Object.fromEntries(games.map((g) => [g.id, g]));
      box.innerHTML = recent.map((r) => {
        const g = byU[r.universeId] || { name: r.name || `Jeu ${r.placeId}`, playing: 0 };
        const when = r.lastPlayed ? timeAgo(r.lastPlayed) : '';
        return `
          <div class="recent-item">
            ${gameCardHtml({ ...g, universeId: r.universeId, rootPlaceId: r.placeId, playerCount: g.playing },
              icons[r.universeId], when ? `<span class="badge">${when}</span>` : '')}
            <button class="btn sm primary" data-join-place="${esc(r.placeId)}">${icon('play')} Rejoindre</button>
          </div>`;
      }).join('');
      box.querySelectorAll('.game-card').forEach((c) => c.addEventListener('click', () => {
        if (c.dataset.universe) Views.games.openGame(Number(c.dataset.universe));
      }));
      box.querySelectorAll('[data-join-place]').forEach((b) => b.addEventListener('click', () => busy(b, () => launchPlace(b.dataset.joinPlace))));
    } catch (e) {
      box.innerHTML = `<div class="muted small">Impossible de charger les jeux récents : ${esc(e.message)}</div>`;
    }
  },

  // Amis en ligne / en jeu : API publiques, pseudo seulement (aucun cookie).
  async renderFriends(el) {
    const box = el.querySelector('#friends-live');
    if (!box) return;
    const uid = App.store.profile.userId;
    if (!uid) {
      box.innerHTML = `<div class="row"><span class="muted">Ajoute ton pseudo Roblox pour voir qui est en ligne et le rejoindre.</span><span class="spacer"></span><button class="btn sm primary" data-go-settings>Ajouter mon pseudo</button></div>`;
      box.querySelector('[data-go-settings]').addEventListener('click', () => App.go('settings'));
      return;
    }
    try {
      const fr = await Rbx.get(`https://friends.roblox.com/v1/users/${uid}/friends`, 120e3);
      const ids = (fr.data || []).map((f) => f.id);
      if (!ids.length) { box.innerHTML = '<span class="muted">Aucun ami trouvé (ou ta liste d\'amis est privée).</span>'; return; }
      const pres = (await Rbx.presence(ids)).filter((p) => p.userPresenceType === 1 || p.userPresenceType === 2);
      App.setCount('friends', pres.length);
      if (App.current !== 'home') return;
      if (!pres.length) { box.innerHTML = '<span class="muted">Aucun ami connecté pour le moment.</span>'; return; }
      pres.sort((a, b) => b.userPresenceType - a.userPresenceType);
      const shown = pres.slice(0, 12);
      const shownIds = shown.map((p) => p.userId);
      const [users, thumbs] = await Promise.all([Rbx.users(shownIds), Rbx.userThumbs(shownIds)]);
      if (App.current !== 'home') return;
      const uById = Object.fromEntries(users.map((u) => [u.id, u]));
      box.innerHTML = `<div class="people friends-strip">${shown.map((p) => {
        const u = uById[p.userId] || { displayName: `Ami ${p.userId}`, name: '' };
        const canJoin = p.userPresenceType === 2 && p.placeId && p.gameId;
        const t = p.userPresenceType;
        return `
          <div class="person">
            <div class="av">${thumbs[p.userId] ? `<img src="${esc(thumbs[p.userId])}" alt="">` : '<div class="ph"></div>'}<span class="status-dot ${PRESENCE[t].cls}"></span></div>
            <div class="who">
              <b class="ellipsis">${esc(u.displayName)}</b>
              <div class="loc ellipsis">${presenceLine(p)}</div>
            </div>
            ${canJoin ? `<div class="acts"><button class="btn sm primary" data-join="${esc(p.gameId)}" data-place="${p.placeId}">Rejoindre</button></div>` : ''}
          </div>`;
      }).join('')}</div>${pres.length > shown.length ? `<div class="muted small mt">+ ${pres.length - shown.length} autres amis connectés</div>` : ''}`;
      box.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => busy(b, () => launchPlace(b.dataset.place, b.dataset.join))));
    } catch (e) {
      box.innerHTML = `<div class="muted small">Impossible de charger tes amis : ${esc(e.message)}</div>`;
    }
  },
};
