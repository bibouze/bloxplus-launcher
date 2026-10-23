// Admins : liste des membres du staff Roblox (ou des admins d'un groupe au choix),
// leur statut, et une alerte si l'un d'eux se trouve sur ton serveur.
const ROBLOX_GROUP = 1200769;

Views.admins = {
  timer: null,
  group: ROBLOX_GROUP,
  selectedRoles: null,
  people: null,

  async render(el) {
    el.innerHTML = `
      <div class="view-head">
        <div>
          <h1>Admins</h1>
          <p>Le staff officiel de Roblox, ou les admins de n'importe quel groupe (celui d'un jeu par exemple). BloxPlus peut t'alerter si l'un d'eux rejoint ton serveur.</p>
        </div>
        <div class="actions"><button class="btn" id="refresh">${icon('refresh')} Actualiser</button></div>
      </div>

      <div class="grid grid-4">
        <div class="card stat"><span class="k">${icon('shield')} Admins suivis</span><span class="v" id="s-total">–</span></div>
        <div class="card stat"><span class="k"><span class="status-dot online"></span> En ligne</span><span class="v" id="s-online">–</span></div>
        <div class="card stat"><span class="k"><span class="status-dot ingame"></span> En jeu</span><span class="v" id="s-ingame">–</span></div>
        <div class="card stat"><span class="k">${icon('bell')} Alerte serveur</span>
          <div class="row" style="margin-top:4px">${toggleHtml('t-alert', App.store.notify.adminInServer)}<span class="small muted">Prévenir si un admin est sur mon serveur</span></div>
        </div>
      </div>

      <div id="in-server"></div>

      <div class="card mt">
        <div class="card-title">
          <h2>${icon('users')} Groupe</h2>
          <div class="row">
            <select class="select" id="g-preset">
              <option value="${ROBLOX_GROUP}">Roblox — staff officiel</option>
              <option value="custom">Autre groupe (ID)…</option>
            </select>
            <input class="input" id="g-id" placeholder="ID du groupe" style="width:150px" hidden>
            <button class="btn sm" id="g-load" hidden>Charger</button>
          </div>
        </div>
        <div id="roles" class="row wrap"></div>
      </div>

      <div class="row mt">
        <div class="search">${icon('search')}<input class="input" id="aq" placeholder="Rechercher un admin…"></div>
        <span class="chip on" data-f="all">Tous</span>
        <span class="chip" data-f="online">En ligne</span>
      </div>
      <div id="list" class="mt"><div class="people">${'<div class="skeleton" style="height:76px"></div>'.repeat(12)}</div></div>
      <p class="hint mt">Le statut affiché dépend des paramètres de confidentialité de chaque compte : un admin peut apparaître hors ligne alors qu'il est connecté.</p>`;

    this.filter = 'all';
    el.querySelector('#t-alert').addEventListener('change', async (e) => {
      await App.setStore('notify.adminInServer', e.target.checked);
      toast(e.target.checked ? 'Alerte activée' : 'Alerte désactivée');
    });
    const preset = el.querySelector('#g-preset');
    if (this.group !== ROBLOX_GROUP) { preset.value = 'custom'; el.querySelector('#g-id').value = this.group; }
    const syncCustom = () => {
      const custom = preset.value === 'custom';
      el.querySelector('#g-id').hidden = !custom;
      el.querySelector('#g-load').hidden = !custom;
    };
    syncCustom();
    preset.addEventListener('change', () => {
      syncCustom();
      if (preset.value !== 'custom') { this.group = ROBLOX_GROUP; this.selectedRoles = null; this.loadGroup(el); }
    });
    el.querySelector('#g-load').addEventListener('click', (e) => {
      const id = Number(el.querySelector('#g-id').value.trim().match(/\d+/)?.[0]);
      if (!id) return toast('Entre un ID de groupe valide', 'warn');
      this.group = id;
      this.selectedRoles = null;
      busy(e.currentTarget, () => this.loadGroup(el));
    });
    el.querySelector('#refresh').addEventListener('click', (e) => busy(e.currentTarget, () => this.loadPresence(el)));
    el.querySelector('#aq').addEventListener('input', () => this.draw(el));
    el.querySelectorAll('[data-f]').forEach((c) => c.addEventListener('click', () => {
      this.filter = c.dataset.f;
      el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === c));
      this.draw(el);
    }));

    await this.loadGroup(el);
    if (App.current !== 'admins') return;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.loadPresence(el).catch(() => {}), 60000);
  },

  leave() { clearInterval(this.timer); },

  onTracker() {
    const el = $('#view-inner');
    if (el && this.people) this.drawInServer(el);
  },

  async loadGroup(el) {
    const r = await Rbx.get(`https://groups.roblox.com/v1/groups/${this.group}/roles`, 600e3);
    const roles = (r.roles || []).filter((x) => x.rank > 0 && !x.isBase && x.memberCount > 0).sort((a, b) => b.rank - a.rank);
    if (!this.selectedRoles) {
      // Par défaut : les rôles les plus hauts, jusqu'à ~300 personnes (pour Roblox : rang 100 et plus).
      let total = 0;
      this.selectedRoles = new Set();
      for (const role of roles) {
        if (this.group === ROBLOX_GROUP && role.rank < 100) break;
        if (total && total + role.memberCount > 300) break;
        this.selectedRoles.add(role.id);
        total += role.memberCount;
      }
    }
    const box = el.querySelector('#roles');
    box.innerHTML = roles.map((role) => `
      <span class="chip ${this.selectedRoles.has(role.id) ? 'on' : ''}" data-role="${role.id}">
        ${esc(role.name)} <span class="muted">· rang ${role.rank} · ${role.memberCount}</span>
      </span>`).join('') || '<span class="muted">Aucun rôle visible dans ce groupe.</span>';
    box.querySelectorAll('[data-role]').forEach((c) => c.addEventListener('click', () => {
      const id = Number(c.dataset.role);
      const role = roles.find((x) => x.id === id);
      if (!this.selectedRoles.has(id) && role.memberCount > 1000) {
        toast(`« ${role.name} » compte ${role.memberCount} membres : seuls les 1000 premiers seront chargés.`, 'warn');
      }
      if (this.selectedRoles.has(id)) this.selectedRoles.delete(id); else this.selectedRoles.add(id);
      c.classList.toggle('on');
      this.loadMembers(el, roles);
    }));
    await this.loadMembers(el, roles);
  },

  async loadMembers(el, roles) {
    el.querySelector('#list').innerHTML = `<div class="people">${'<div class="skeleton" style="height:76px"></div>'.repeat(9)}</div>`;
    const members = [];
    for (const role of roles.filter((x) => this.selectedRoles.has(x.id))) {
      let cursor = '';
      let pages = 0;
      do {
        const r = await Rbx.get(`https://groups.roblox.com/v1/groups/${this.group}/roles/${role.id}/users?limit=100&sortOrder=Desc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 600e3);
        for (const u of r.data || []) members.push({ id: u.userId, name: u.username, displayName: u.displayName, hasVerifiedBadge: u.hasVerifiedBadge, role: role.name, rank: role.rank });
        cursor = r.nextPageCursor;
      } while (cursor && ++pages < 10);
    }
    this.people = members;
    // Liste transmise au processus principal pour l'alerte « admin sur mon serveur ».
    await App.setStore('adminWatch', { ids: members.slice(0, 500).map((m) => m.id) });
    el.querySelector('#s-total').textContent = members.length;
    await this.loadPresence(el);
  },

  async loadPresence(el) {
    if (!this.people?.length) { this.draw(el); return; }
    const ids = this.people.map((p) => p.id);
    const [pres, thumbs] = await Promise.all([Rbx.presence(ids), Rbx.userThumbs(ids)]);
    const byId = Object.fromEntries(pres.map((p) => [p.userId, p]));
    for (const p of this.people) { p.presence = byId[p.id]; p.thumb = thumbs[p.id]; }
    this.people.sort((a, b) => (b.presence?.userPresenceType || 0) - (a.presence?.userPresenceType || 0) || b.rank - a.rank || a.name.localeCompare(b.name));
    const online = this.people.filter((p) => p.presence?.userPresenceType > 0).length;
    el.querySelector('#s-online').textContent = online;
    el.querySelector('#s-ingame').textContent = this.people.filter((p) => p.presence?.userPresenceType === 2).length;
    App.setCount('admins', online);
    this.draw(el);
    this.drawInServer(el);
  },

  drawInServer(el) {
    const box = el.querySelector('#in-server');
    const cur = App.state.current;
    if (!box) return;
    if (!cur) { box.innerHTML = ''; return; }
    const here = (this.people || []).filter((p) => p.presence?.gameId && p.presence.gameId === cur.jobId);
    box.innerHTML = here.length
      ? `<div class="notice bad mt">${icon('alert')}<div><b>${here.length} admin(s) sur ton serveur :</b> ${here.map((p) => `${esc(p.displayName)} (@${esc(p.name)})`).join(', ')}</div></div>`
      : `<div class="notice mt">${icon('shield')}<div>Aucun admin visible sur ton serveur actuel${cur.name ? ` (${esc(cur.name)})` : ''}.</div></div>`;
  },

  draw(el) {
    const box = el.querySelector('#list');
    if (!this.people) return;
    const q = el.querySelector('#aq').value.trim().toLowerCase();
    const list = this.people.filter((p) => (this.filter !== 'online' || p.presence?.userPresenceType > 0) && (!q || p.name.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)));
    if (!list.length) { box.innerHTML = emptyHtml('shield', 'Aucun admin ne correspond.'); return; }
    box.innerHTML = `<div class="people">${list.map((p) => {
      const pr = p.presence;
      const t = pr?.userPresenceType || 0;
      const canJoin = t === 2 && pr.placeId && pr.gameId;
      return `
        <div class="person">
          <div class="av">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : '<div class="ph"></div>'}<span class="status-dot ${(PRESENCE[t] || PRESENCE[0]).cls}"></span></div>
          <div class="who">
            <b class="ellipsis">${esc(p.displayName)}${p.hasVerifiedBadge ? VERIFIED : ''}</b>
            <div class="u ellipsis">@${esc(p.name)}</div>
            <div class="loc row" style="gap:6px"><span class="badge accent">${esc(p.role)}</span>${t ? presenceLine(pr) : ''}</div>
          </div>
          <div class="acts">
            ${canJoin ? `<button class="btn sm primary" data-join="${esc(pr.gameId)}" data-place="${pr.placeId}">Rejoindre</button>` : ''}
            <button class="btn sm ghost" data-profile="${p.id}" title="Profil">${icon('external')}</button>
          </div>
        </div>`;
    }).join('')}</div>`;
    box.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => busy(b, () => launchPlace(b.dataset.place, b.dataset.join))));
    box.querySelectorAll('[data-profile]').forEach((b) => b.addEventListener('click', () => bp.open(`https://www.roblox.com/users/${b.dataset.profile}/profile`)));
  },
};
