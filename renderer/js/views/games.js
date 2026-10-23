// Jeux & serveurs : recherche, jeux populaires, favoris, navigateur de serveurs avec ping.
Views.games = {
  async render(el) {
    el.innerHTML = `
      <div class="view-head">
        <div>
          <h1>Jeux & serveurs</h1>
          <p>Cherche un jeu, compare les serveurs par ping et rejoins directement le meilleur.</p>
        </div>
      </div>
      <div class="row">
        <div class="search">${icon('search')}<input class="input" id="q" placeholder="Rechercher un jeu Roblox…"></div>
        <button class="btn primary" id="go">Rechercher</button>
      </div>
      <div id="results"></div>
      <div id="favs"></div>
      <div id="sorts"></div>`;

    const q = el.querySelector('#q');
    const run = () => this.search(el, q.value.trim());
    el.querySelector('#go').addEventListener('click', run);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

    await Promise.all([this.renderFavorites(el), this.renderSorts(el)]);
  },

  bindCards(root) {
    root.querySelectorAll('.game-card').forEach((c) => c.addEventListener('click', () => this.openGame(Number(c.dataset.universe))));
  },

  async search(el, query) {
    const box = el.querySelector('#results');
    if (!query) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="section-title">Résultats</div><div class="games-grid">${'<div class="skeleton" style="height:230px"></div>'.repeat(6)}</div>`;
    try {
      const r = await Rbx.get(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&sessionId=${crypto.randomUUID()}&pageType=all`, 60e3);
      const games = (r.searchResults || []).filter((g) => g.contentGroupType === 'Game').flatMap((g) => g.contents).slice(0, 30);
      if (!games.length) { box.innerHTML = `<div class="section-title">Résultats</div>${emptyHtml('search', 'Aucun jeu trouvé.')}`; return; }
      const icons = await Rbx.gameIcons(games.map((g) => g.universeId));
      box.innerHTML = `<div class="section-title">Résultats pour « ${esc(query)} »</div><div class="games-grid">${games.map((g) => gameCardHtml(g, icons[g.universeId])).join('')}</div>`;
      this.bindCards(box);
    } catch (e) {
      box.innerHTML = `<div class="notice bad mt">${icon('alert')}<div>${esc(e.message)}</div></div>`;
    }
  },

  async renderFavorites(el) {
    const favs = App.store.favorites || [];
    const box = el.querySelector('#favs');
    if (!favs.length) { box.innerHTML = ''; return; }
    try {
      const [games, icons] = await Promise.all([Rbx.games(favs), Rbx.gameIcons(favs)]);
      box.innerHTML = `<div class="section-title">${icon('star')} Favoris</div><div class="games-grid">${games.map((g) => gameCardHtml({ ...g, universeId: g.id, playerCount: g.playing }, icons[g.id])).join('')}</div>`;
      this.bindCards(box);
    } catch { box.innerHTML = ''; }
  },

  async renderSorts(el) {
    const box = el.querySelector('#sorts');
    box.innerHTML = `<div class="section-title">Populaires</div><div class="h-scroll">${'<div class="skeleton" style="height:230px"></div>'.repeat(6)}</div>`;
    try {
      const r = await Rbx.get(`https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${crypto.randomUUID()}&device=computer&country=all`, 300e3);
      const names = { 'top-playing-now': 'Les plus joués en ce moment', 'top-trending': 'Tendances', 'up-and-coming': 'En pleine ascension', 'fun-with-friends': 'À jouer entre amis', 'top-revisited': 'Les joueurs y reviennent' };
      const sorts = (r.sorts || []).filter((s) => s.contentType === 'Games' && s.games?.length).slice(0, 4);
      const icons = await Rbx.gameIcons(sorts.flatMap((s) => s.games.slice(0, 20).map((g) => g.universeId)));
      box.innerHTML = sorts.map((s) => `
        <div class="section-title">${esc(names[s.sortId] || s.sortDisplayName)}</div>
        <div class="h-scroll">${s.games.slice(0, 20).map((g) => gameCardHtml(g, icons[g.universeId])).join('')}</div>`).join('');
      this.bindCards(box);
    } catch (e) {
      box.innerHTML = `<div class="notice warn mt">${icon('alert')}<div>Impossible de charger les jeux populaires : ${esc(e.message)}</div></div>`;
    }
  },

  // ---------- Fiche d'un jeu + serveurs ----------
  async openGame(universeId) {
    const m = modal(`<div class="banner"><button class="btn icon close" data-close>${icon('x')}</button></div><div class="content"><div class="skeleton" style="height:300px"></div></div>`);
    let game;
    try {
      [game] = await Rbx.games([universeId]);
    } catch (e) {
      m.el.querySelector('.content').innerHTML = `<div class="notice bad">${icon('alert')}<div>${esc(e.message)}</div></div>`;
      return;
    }
    const banner = await Rbx.gameBanner(universeId).catch(() => null);
    if (banner) m.el.querySelector('.banner').style.backgroundImage = `url("${banner}")`;
    const isFav = () => (App.store.favorites || []).includes(universeId);
    const content = m.el.querySelector('.content');
    content.innerHTML = `
      <h2>${esc(game.name)}</h2>
      <div class="row wrap small muted" style="margin-bottom:10px">
        <span>par <b style="color:var(--text)">${esc(game.creator?.name || '?')}</b>${game.creator?.hasVerifiedBadge ? VERIFIED : ''}</span>
        <span>· ${fmtNum(game.playing)} joueurs</span>
        <span>· ${fmtNum(game.visits)} visites</span>
        <span>· ${game.maxPlayers} max / serveur</span>
      </div>
      <div class="desc">${esc(game.description || '')}</div>
      <div class="row mt">
        <button class="btn primary" id="g-play">${icon('play')} Jouer</button>
        <button class="btn ok" id="g-best">${icon('zap')} Meilleur serveur</button>
        <button class="btn" id="g-small">${icon('users')} Petit serveur</button>
        <button class="btn" id="g-fav">${icon('star')} <span>${isFav() ? 'Retirer des favoris' : 'Ajouter aux favoris'}</span></button>
        <span class="spacer"></span>
        <button class="btn ghost sm" id="g-web">${icon('external')} Page Roblox</button>
      </div>
      <div class="card mt">
        <div class="card-title">
          <h2>${icon('globe')} Serveurs publics</h2>
          <div class="row">
            <span class="chip on" data-sort="ping">Ping le plus bas</span>
            <span class="chip" data-sort="full">Plus remplis</span>
            <span class="chip" data-sort="empty">Moins remplis</span>
            <button class="btn ghost sm" id="g-refresh">${icon('refresh')}</button>
          </div>
        </div>
        <p class="hint" style="margin:-6px 0 10px">Le ping est celui que Roblox communique pour chaque serveur : plus il est bas, plus le serveur est proche de toi. La ville exacte du serveur s'affiche une fois connecté (option « Région du serveur » dans BetterBLOX).</p>
        <div id="servers"></div>
        <div class="row mt"><button class="btn sm" id="g-more" hidden>Charger plus de serveurs</button></div>
      </div>`;

    const placeId = game.rootPlaceId;
    let servers = [];
    let cursor = '';
    let sort = 'ping';

    const draw = () => {
      const list = [...servers].sort((a, b) =>
        sort === 'ping' ? (a.ping ?? 9999) - (b.ping ?? 9999)
          : sort === 'full' ? b.playing - a.playing : a.playing - b.playing);
      const box = content.querySelector('#servers');
      if (!list.length) { box.innerHTML = emptyHtml('globe', 'Aucun serveur public trouvé.'); return; }
      box.innerHTML = `<table class="table"><thead><tr><th>Joueurs</th><th>Ping</th><th>FPS serveur</th><th>ID</th><th></th></tr></thead><tbody>
        ${list.map((s) => {
          const pc = s.ping == null ? '' : s.ping < 80 ? 'good' : s.ping < 160 ? 'mid' : 'bad';
          return `<tr>
            <td><div class="players-bar"><div class="bar"><i style="width:${(s.playing / s.maxPlayers) * 100}%"></i></div><span class="small">${s.playing}/${s.maxPlayers}</span></div></td>
            <td><span class="ping ${pc}">${s.ping ?? '?'} ms</span></td>
            <td class="muted">${s.fps ? Math.round(s.fps) : '?'}</td>
            <td class="mono muted">${esc(s.id.slice(0, 8))}</td>
            <td style="text-align:right"><button class="btn sm" data-join="${esc(s.id)}" ${s.playing >= s.maxPlayers ? 'disabled' : ''}>Rejoindre</button></td>
          </tr>`;
        }).join('')}</tbody></table>`;
      box.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => busy(b, () => launchPlace(placeId, b.dataset.join))));
    };

    const load = async (reset) => {
      if (reset) { servers = []; cursor = ''; content.querySelector('#servers').innerHTML = '<div class="skeleton" style="height:180px"></div>'; }
      try {
        const r = await Rbx.get(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&sortOrder=Desc&excludeFullGames=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 0);
        servers.push(...(r.data || []));
        cursor = r.nextPageCursor;
        content.querySelector('#g-more').hidden = !cursor;
        draw();
      } catch (e) {
        content.querySelector('#servers').innerHTML = `<div class="notice bad">${icon('alert')}<div>${esc(e.message)}</div></div>`;
      }
    };

    content.querySelectorAll('[data-sort]').forEach((c) => c.addEventListener('click', () => {
      sort = c.dataset.sort;
      content.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('on', x === c));
      draw();
    }));
    content.querySelector('#g-refresh').addEventListener('click', () => load(true));
    content.querySelector('#g-more').addEventListener('click', (e) => busy(e.currentTarget, () => load(false)));
    content.querySelector('#g-play').addEventListener('click', (e) => busy(e.currentTarget, () => launchPlace(placeId)));
    content.querySelector('#g-best').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const best = servers.filter((s) => s.playing < s.maxPlayers && s.ping != null).sort((a, b) => a.ping - b.ping)[0];
      if (!best) throw new Error('Aucun serveur disponible');
      await launchPlace(placeId, best.id);
      toast(`Serveur choisi : ${best.ping} ms, ${best.playing}/${best.maxPlayers} joueurs`);
    }));
    content.querySelector('#g-small').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const small = servers.filter((s) => s.playing < s.maxPlayers && s.playing > 0).sort((a, b) => a.playing - b.playing || (a.ping ?? 999) - (b.ping ?? 999))[0];
      if (!small) throw new Error('Aucun petit serveur disponible');
      await launchPlace(placeId, small.id);
    }));
    content.querySelector('#g-fav').addEventListener('click', async (e) => {
      const favs = new Set(App.store.favorites || []);
      if (favs.has(universeId)) favs.delete(universeId); else favs.add(universeId);
      await App.setStore('favorites', [...favs]);
      e.currentTarget.querySelector('span').textContent = isFav() ? 'Retirer des favoris' : 'Ajouter aux favoris';
      if (App.current === 'games') this.renderFavorites($('#view-inner'));
    });
    content.querySelector('#g-web').addEventListener('click', () => bp.open(`https://www.roblox.com/games/${placeId}`));

    load(true);
  },
};
