// Accueil : bouton Jouer, statistiques de temps de jeu, jeux récents.
Views.home = {
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
          : "Roblox n'est pas installé sur ce PC. Installe-le depuis roblox.com puis reviens ici."}</p>
        <div class="row">
          <button class="btn primary lg play-btn" id="play" ${roblox ? '' : 'disabled'}>${icon('play')} Jouer</button>
          <div class="row" style="gap:8px">
            <input class="input" id="place-id" placeholder="ID du jeu ou lien roblox.com" style="width:260px">
            <button class="btn" id="join-place" ${roblox ? '' : 'disabled'}>Rejoindre</button>
          </div>
        </div>
        <div class="meta">
          <span class="badge">${icon('layers')} ${roblox ? esc(roblox.name) : 'Roblox introuvable'}</span>
          <span class="badge accent">${icon('gauge')} ${presetName}</span>
          <span class="badge">${icon('flag')} ${flagsCount} FastFlags</span>
          <span class="badge ${store.shaders.enabled ? 'ok' : ''}">${icon('palette')} Shaders ${store.shaders.enabled ? 'activés' : 'désactivés'}</span>
          ${store.launch.multiInstance ? `<span class="badge ok">${icon('window')} Multi-instance</span>` : ''}
        </div>
      </section>

      <div id="live"></div>

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

      <div class="grid mt" style="grid-template-columns: 1.1fr 2fr">
        <div class="card">
          <div class="card-title"><h2>${icon('clock')} 7 derniers jours</h2></div>
          <div class="week-chart" id="week"></div>
        </div>
        <div class="card">
          <div class="card-title"><h2>${icon('gamepad')} Joués récemment</h2><button class="btn ghost sm" data-go="games">Explorer les jeux</button></div>
          <div id="recent" class="h-scroll"></div>
        </div>
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
    el.querySelector('[data-go]').addEventListener('click', () => App.go('games'));

    await this.renderRecent(el, pt);
  },

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

  async renderRecent(el, pt) {
    const box = el.querySelector('#recent');
    const recent = Object.entries(pt.byPlace)
      .map(([placeId, v]) => ({ placeId, ...v }))
      .sort((a, b) => b.lastPlayed - a.lastPlayed)
      .slice(0, 12);
    if (!recent.length) {
      box.outerHTML = emptyHtml('gamepad', 'Tes jeux apparaîtront ici dès ta première partie lancée avec BloxPlus.');
      return;
    }
    try {
      for (const r of recent) if (!r.universeId) r.universeId = await Rbx.universeOf(r.placeId);
      const [icons, games] = await Promise.all([Rbx.gameIcons(recent.map((r) => r.universeId)), Rbx.games(recent.map((r) => r.universeId))]);
      const byU = Object.fromEntries(games.map((g) => [g.id, g]));
      box.innerHTML = recent.map((r) => {
        const g = byU[r.universeId] || { name: r.name || `Jeu ${r.placeId}`, playing: 0 };
        return gameCardHtml({ ...g, universeId: r.universeId, rootPlaceId: r.placeId, playerCount: g.playing },
          icons[r.universeId], `<span class="badge">${fmtDuration(r.seconds, true)}</span>`);
      }).join('');
      box.querySelectorAll('.game-card').forEach((c) => c.addEventListener('click', () => Views.games.openGame(Number(c.dataset.universe))));
    } catch (e) {
      box.innerHTML = `<div class="muted small">Impossible de charger les jeux récents : ${esc(e.message)}</div>`;
    }
  },
};
