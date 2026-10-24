// Paramètres du launcher : profil, lancement, suivi, mods, apparence, intégration roblox.com.
const ACCENTS = ['#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

Views.settings = {
  async render(el) {
    const s = App.store;
    const [protocolOn, modFiles] = await Promise.all([bp.protocol.get().catch(() => false), bp.mods.list().catch(() => [])]);
    // playMode remplace hideDuringPlay (CONTRACTS §2.3 bis) : valeur absente = léger, ancien réglage repris tant que Cœur n'a pas migré.
    const mode = s.launch.playMode ?? (s.launch.hideDuringPlay === false || s.launch.minimizeOnLaunch === false ? 'complet' : 'leger');

    el.innerHTML = `
      <div class="view-head"><div><h1>Paramètres</h1><p>Ton profil, le lancement de Roblox, le suivi du temps de jeu et l'apparence du launcher.</p></div></div>

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

      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-title"><h2>${icon('window')} Lancement</h2></div>
          ${this.setting('multi', 'Multi-instance', 'Ouvre plusieurs fenêtres Roblox en même temps (plusieurs comptes ou serveurs).', s.launch.multiInstance)}
          ${this.setting('mods', 'Appliquer mes mods', 'Copie le contenu de ton dossier de mods dans Roblox à chaque lancement.', s.launch.applyMods)}
          <div class="setting" style="display:block">
            <div class="label"><b>Mode de jeu</b><span>Ce que fait BloxPlus pendant que tu joues.</span></div>
            <div class="row mt" id="play-mode">
              <span class="chip ${mode === 'leger' ? 'on' : ''}" data-mode="leger">Léger (recommandé)</span>
              <span class="chip ${mode === 'complet' ? 'on' : ''}" data-mode="complet">Complet</span>
            </div>
            <p class="hint mt" id="play-mode-hint"></p>
          </div>
          ${this.setting('prio', 'Priorité haute au lancement', 'Donne la priorité au processeur pour Roblox quand il démarre depuis BloxPlus.', s.launch.highPriority)}
        </div>
        <div class="card">
          <div class="card-title"><h2>${icon('bell')} Suivi & notifications</h2></div>
          <div class="notice warn" id="track-hint" hidden>${icon('info')}<div>Inactifs en mode de jeu Léger : l'overlay et les notifications pendant la partie ne fonctionnent qu'en mode Complet.</div></div>
          ${this.setting('overlay', 'Overlay du temps de jeu', 'Petite pastille toujours au-dessus du jeu avec la durée de la session.', s.overlay.enabled)}
          ${this.setting('region', 'Région du serveur', 'Affiche la ville du serveur quand tu rejoins une partie (adresse du serveur envoyée à ipinfo.io).', s.notify.serverRegion)}
          ${this.setting('friends', 'Amis en ligne', 'Notification quand un ami se connecte ou lance un jeu.', s.notify.friends)}
          ${this.setting('admin', 'Admin sur mon serveur', "Notification si un admin de l'onglet Admins est sur ton serveur.", s.notify.adminInServer)}
        </div>
      </div>

      <div class="card mt">
        <div class="card-title">
          <h2>${icon('folder')} Mods</h2>
          <div class="row">
            <button class="btn sm" id="mods-open">${icon('folder')} Ouvrir le dossier des mods</button>
            <button class="btn sm danger" id="mods-restore">Restaurer les fichiers d'origine</button>
          </div>
        </div>
        <p class="hint">Place dans ce dossier les fichiers à remplacer, avec la même arborescence que Roblox (ex. <span class="mono">content\\sounds\\ouch.ogg</span> pour le son de mort, <span class="mono">content\\textures\\Cursors\\KeyboardMouse\\ArrowCursor.png</span> pour le curseur). Les originaux sont sauvegardés.</p>
        <div class="row wrap mt">${modFiles.length ? modFiles.slice(0, 30).map((f) => `<span class="badge mono">${esc(f)}</span>`).join('') : '<span class="muted small">Aucun mod pour le moment.</span>'}</div>
      </div>

      <div class="card mt">
        <div class="card-title"><h2>${icon('globe')} Intégration roblox.com</h2></div>
        <div class="setting">
          <div class="label"><b>Ouvrir les jeux du site avec BloxPlus</b><span>BloxPlus remplace le launcher de Roblox : quand tu cliques sur « Jouer » sur roblox.com, c'est BloxPlus qui lance Roblox, avec tes optimisations, FastFlags, mods et shaders. Désactiver remet le lanceur d'origine.</span></div>
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
          ${bp.roblox.install ? `<button class="btn sm" id="rbx-check">${icon('refresh')} Vérifier Roblox</button>` : ''}
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

    const bind = (id, key, after) => el.querySelector(`#t-${id}`).addEventListener('change', async (e) => {
      await App.setStore(key, e.target.checked);
      after?.(e.target.checked);
    });
    bind('multi', 'launch.multiInstance', (on) => toast(on ? 'Multi-instance activé : lance Roblox depuis BloxPlus pour ouvrir plusieurs fenêtres.' : 'Multi-instance désactivé'));
    bind('mods', 'launch.applyMods');
    const MODE_HINT = {
      leger: "BloxPlus se ferme entièrement pendant la partie (presque aucune mémoire utilisée) et se rouvre tout seul quand tu quittes Roblox. L'overlay du temps de jeu et les notifications en jeu (amis, admin sur ton serveur, région) sont inactifs ; ton temps de jeu est quand même récupéré à ton retour.",
      complet: "BloxPlus reste en veille près de l'horloge pendant la partie (environ 250 Mo de mémoire) : l'overlay et les notifications en jeu fonctionnent. Il revient au premier plan quand tu quittes Roblox.",
    };
    const showMode = (m) => {
      el.querySelector('#play-mode-hint').textContent = MODE_HINT[m];
      el.querySelector('#track-hint').hidden = m !== 'leger';
    };
    showMode(mode);
    el.querySelectorAll('[data-mode]').forEach((c) => c.addEventListener('click', async () => {
      await App.setStore('launch.playMode', c.dataset.mode);
      el.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === c));
      showMode(c.dataset.mode);
    }));
    bind('prio', 'launch.highPriority');
    bind('overlay', 'overlay.enabled');
    bind('region', 'notify.serverRegion');
    bind('friends', 'notify.friends');
    bind('admin', 'notify.adminInServer');

    el.querySelector('#mods-open').addEventListener('click', () => bp.mods.open());
    el.querySelector('#mods-restore').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const n = await bp.mods.restore();
      toast(n ? `${n} fichier(s) restauré(s)` : 'Aucun mod à retirer', 'ok');
    }));
    el.querySelector('#t-proto').addEventListener('change', (e) => busy(null, async () => {
      const on = await bp.protocol.set(e.target.checked);
      e.target.checked = on;
      toast(on ? 'BloxPlus ouvrira désormais les jeux lancés depuis roblox.com' : "Lanceur d'origine de Roblox rétabli", 'ok');
    }));
    el.querySelector('#gh').addEventListener('click', () => bp.open('https://github.com/bibouze/bloxplus-launcher'));
    el.querySelector('#data').addEventListener('click', () => bp.openPath(App.info.userData));
    // Force la vérification / mise à jour de Roblox (canal roblox:install, Cœur 1.2) ; la progression s'affiche dans le bandeau.
    el.querySelector('#rbx-check')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await bp.roblox.install();
      App.info = await bp.info();
      toast(r.updated ? `Roblox mis à jour (${r.version})` : 'Roblox est déjà à jour', 'ok');
    }));
  },

  setting(id, title, desc, checked) {
    return `<div class="setting"><div class="label"><b>${title}</b><span>${desc}</span></div>${toggleHtml('t-' + id, checked)}</div>`;
  },
};
