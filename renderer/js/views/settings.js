// Paramètres du launcher.
const ACCENTS = ['#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

Views.settings = {
  async render(el) {
    const s = App.store;
    const protocolOn = await bp.protocol.get().catch(() => false);

    el.innerHTML = `
      <div class="view-head"><div><h1>Paramètres</h1><p>Ton profil, l'intégration avec roblox.com et l'apparence du launcher.</p></div></div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><h2>${icon('users')} Profil Roblox</h2></div>
          <p class="hint">Ton pseudo public sert à afficher ta liste d'amis. Aucun mot de passe ni cookie n'est demandé ou enregistré.</p>
          <div class="row mt">
            <input class="input" id="uname" value="${esc(s.profile.username || '')}" placeholder="Pseudo Roblox" style="flex:1">
            <button class="btn primary" id="save-u">Enregistrer</button>
            ${s.profile.userId ? '<button class="btn ghost" id="clear-u">Retirer</button>' : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-title"><h2>${icon('palette')} Apparence</h2></div>
          <p class="hint">Couleur principale du launcher.</p>
          <div class="accent-swatches mt">${ACCENTS.map((c) => `<button data-accent="${c}" class="${c === s.accent ? 'on' : ''}" style="background:${c}" title="${c}"></button>`).join('')}</div>
        </div>
      </div>

      <div class="card mt">
        <div class="card-title"><h2>${icon('globe')} Intégration roblox.com</h2></div>
        <div class="setting">
          <div class="label"><b>Ouvrir les jeux du site avec BloxPlus</b><span>Quand tu cliques sur « Jouer » sur roblox.com, c'est BloxPlus qui lance Roblox, avec tes optimisations, FastFlags, mods et shaders. Désactiver remet le lanceur d'origine.</span></div>
          ${toggleHtml('t-proto', protocolOn)}
        </div>
      </div>

      <div class="card mt">
        <div class="card-title"><h2>${icon('info')} À propos</h2></div>
        <dl class="hw-list">
          <dt>Version</dt><dd>BloxPlus Launcher ${esc(App.info.version)}</dd>
          <dt>Roblox</dt><dd>${App.info.roblox ? esc(App.info.roblox.name) : 'Non installé'}</dd>
          <dt>Données</dt><dd class="mono">${esc(App.info.userData)}</dd>
        </dl>
        <div class="row mt">
          <button class="btn sm" id="gh">${icon('external')} Code source sur GitHub</button>
          <button class="btn sm" id="data">${icon('folder')} Ouvrir le dossier des données</button>
        </div>
        <p class="hint mt">BloxPlus n'est pas affilié à Roblox Corporation ni à BetterBLOX.</p>
      </div>`;

    const saveU = () => busy(el.querySelector('#save-u'), async () => {
      const name = el.querySelector('#uname').value.trim();
      if (!name) throw new Error('Entre un pseudo');
      const u = await Rbx.userByName(name);
      if (!u) throw new Error('Pseudo introuvable');
      await App.setStore('profile', { userId: u.id, username: u.name, displayName: u.displayName });
      App.renderProfile();
      toast(`Profil enregistré : ${u.displayName}`, 'ok');
      App.go('settings');
    });
    el.querySelector('#save-u').addEventListener('click', saveU);
    el.querySelector('#uname').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveU(); });
    el.querySelector('#clear-u')?.addEventListener('click', async () => {
      await App.setStore('profile', { userId: null, username: null, displayName: null });
      App.renderProfile();
      App.go('settings');
    });
    el.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', async () => {
      await App.setStore('accent', b.dataset.accent);
      App.applyAccent(b.dataset.accent);
      el.querySelectorAll('[data-accent]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelector('#t-proto').addEventListener('change', (e) => busy(null, async () => {
      const on = await bp.protocol.set(e.target.checked);
      e.target.checked = on;
      toast(on ? 'BloxPlus ouvrira désormais les jeux lancés depuis roblox.com' : "Lanceur d'origine de Roblox rétabli", 'ok');
    }));
    el.querySelector('#gh').addEventListener('click', () => bp.open('https://github.com/bibouze/bloxplus-launcher'));
    el.querySelector('#data').addEventListener('click', () => bp.openPath(App.info.userData));
  },
};
