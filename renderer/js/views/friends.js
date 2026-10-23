// Amis : statut en ligne, jeu en cours, dernière fois vu en ligne (mémorisé par BloxPlus).
Views.friends = {
  timer: null,
  filter: 'all',

  async render(el) {
    const p = App.store.profile;
    if (!p.userId) {
      el.innerHTML = `
        <div class="view-head"><div><h1>Amis</h1><p>Vois qui est en ligne, à quoi ils jouent, et rejoins-les en un clic.</p></div></div>
        <div class="card" style="max-width:560px">
          <div class="card-title"><h2>${icon('users')} Ton pseudo Roblox</h2></div>
          <p class="hint">BloxPlus utilise uniquement ton pseudo public pour retrouver ta liste d'amis. Aucun mot de passe ni cookie n'est demandé.</p>
          <div class="row mt"><input class="input" id="uname" placeholder="Pseudo Roblox" style="flex:1"><button class="btn primary" id="save">Valider</button></div>
        </div>`;
      const save = (e) => busy(el.querySelector('#save'), async () => {
        const u = await Rbx.userByName(el.querySelector('#uname').value.trim());
        if (!u) throw new Error('Pseudo introuvable');
        await App.setStore('profile', { userId: u.id, username: u.name, displayName: u.displayName });
        App.renderProfile();
        toast(`Bienvenue ${u.displayName} !`, 'ok');
        App.go('friends');
      });
      el.querySelector('#save').addEventListener('click', save);
      el.querySelector('#uname').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      return;
    }

    el.innerHTML = `
      <div class="view-head">
        <div><h1>Amis</h1><p>Qui est en ligne, à quoi ils jouent, et quand BloxPlus les a vus en ligne pour la dernière fois.</p></div>
        <div class="actions"><button class="btn" id="refresh">${icon('refresh')} Actualiser</button></div>
      </div>
      <div class="row">
        <div class="search">${icon('search')}<input class="input" id="fq" placeholder="Filtrer mes amis…"></div>
        <span class="chip ${this.filter === 'all' ? 'on' : ''}" data-f="all">Tous</span>
        <span class="chip ${this.filter === 'online' ? 'on' : ''}" data-f="online">En ligne</span>
        <span class="chip ${this.filter === 'ingame' ? 'on' : ''}" data-f="ingame">En jeu</span>
      </div>
      <div class="notice mt">${icon('info')}<div>Roblox ne publie plus la date de dernière connexion. BloxPlus la mémorise lui-même chaque fois qu'il voit un ami en ligne (toutes les 90 s quand le launcher est ouvert). Certains amis masquent leur statut dans leurs paramètres de confidentialité.</div></div>
      <div id="list" class="mt"><div class="people">${'<div class="skeleton" style="height:76px"></div>'.repeat(9)}</div></div>`;

    el.querySelector('#refresh').addEventListener('click', (e) => busy(e.currentTarget, () => this.load(el)));
    el.querySelector('#fq').addEventListener('input', () => this.draw(el));
    el.querySelectorAll('[data-f]').forEach((c) => c.addEventListener('click', () => {
      this.filter = c.dataset.f;
      el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === c));
      this.draw(el);
    }));
    await this.load(el);
    if (App.current !== 'friends') return;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.load(el).catch(() => {}), 60000);
  },

  leave() { clearInterval(this.timer); },

  async load(el) {
    const uid = App.store.profile.userId;
    const fr = await Rbx.get(`https://friends.roblox.com/v1/users/${uid}/friends`, 120e3);
    const ids = (fr.data || []).map((f) => f.id);
    if (!ids.length) {
      el.querySelector('#list').innerHTML = emptyHtml('friends', "Aucun ami trouvé (ou ta liste d'amis est privée).");
      return;
    }
    const [users, pres, thumbs] = await Promise.all([Rbx.users(ids), Rbx.presence(ids), Rbx.userThumbs(ids)]);
    App.store = await bp.store.get();
    const pById = Object.fromEntries(pres.map((p) => [p.userId, p]));
    this.people = users.map((u) => ({ ...u, presence: pById[u.id], thumb: thumbs[u.id], seen: App.store.friendSeen[u.id] }));
    this.people.sort((a, b) => (b.presence?.userPresenceType || 0) - (a.presence?.userPresenceType || 0) || (b.seen || 0) - (a.seen || 0) || a.displayName.localeCompare(b.displayName));
    App.setCount('friends', this.people.filter((p) => p.presence?.userPresenceType > 0).length);
    this.draw(el);
  },

  draw(el) {
    if (!this.people) return;
    const q = el.querySelector('#fq').value.trim().toLowerCase();
    const list = this.people.filter((p) => {
      const t = p.presence?.userPresenceType || 0;
      if (this.filter === 'online' && !t) return false;
      if (this.filter === 'ingame' && t !== 2) return false;
      return !q || p.name.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q);
    });
    const box = el.querySelector('#list');
    if (!list.length) { box.innerHTML = emptyHtml('friends', 'Personne ne correspond.'); return; }
    box.innerHTML = `<div class="people">${list.map((p) => this.personHtml(p)).join('')}</div>`;
    box.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => busy(b, () => launchPlace(b.dataset.place, b.dataset.join))));
    box.querySelectorAll('[data-profile]').forEach((b) => b.addEventListener('click', () => bp.open(`https://www.roblox.com/users/${b.dataset.profile}/profile`)));
  },

  personHtml(p) {
    const pr = p.presence;
    const t = pr?.userPresenceType || 0;
    const canJoin = t === 2 && pr.placeId && pr.gameId;
    const seen = t > 0 ? '' : `<div class="loc muted small">Vu en ligne : ${p.seen ? timeAgo(p.seen) : 'pas encore vu par BloxPlus'}</div>`;
    return `
      <div class="person">
        <div class="av">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<div class="ph"></div>'}<span class="status-dot ${(PRESENCE[t] || PRESENCE[0]).cls}"></span></div>
        <div class="who">
          <b class="ellipsis">${esc(p.displayName)}${p.hasVerifiedBadge ? VERIFIED : ''}</b>
          <div class="u ellipsis">@${esc(p.name)}</div>
          <div class="loc ellipsis">${presenceLine(pr)}</div>
          ${seen}
        </div>
        <div class="acts">
          ${canJoin ? `<button class="btn sm primary" data-join="${esc(pr.gameId)}" data-place="${pr.placeId}">Rejoindre</button>` : ''}
          <button class="btn sm ghost" data-profile="${p.id}" title="Profil">${icon('external')}</button>
        </div>
      </div>`;
  },
};
