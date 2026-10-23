// BetterBLOX : les fonctions de BetterStrap / BetterLauncher réunies ici.
Views.better = {
  async render(el) {
    const [ff, modFiles] = await Promise.all([bp.fflags.get(), bp.mods.list()]);
    const s = App.store;
    this.flags = { ...ff.flags };
    this.allow = new Set(ff.allowlist);
    this.presetFlags = ff.presetFlags;

    el.innerHTML = `
      <div class="view-head">
        <div>
          <h1>BetterBLOX</h1>
          <p>Toutes les options de BetterStrap et BetterLauncher, intégrées au launcher : FastFlags, multi-instance, mods, région du serveur, suivi du temps de jeu et notifications.</p>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><h2>${icon('window')} Lancement</h2></div>
          ${this.setting('multi', 'Multi-instance', 'Ouvre plusieurs fenêtres Roblox en même temps (plusieurs comptes ou serveurs).', s.launch.multiInstance)}
          ${this.setting('mods', 'Appliquer mes mods', 'Copie le contenu de ton dossier de mods dans Roblox à chaque lancement.', s.launch.applyMods)}
          ${this.setting('minimize', 'Réduire BloxPlus au lancement', 'Le launcher se range dans la barre des tâches quand le jeu démarre.', s.launch.minimizeOnLaunch)}
        </div>
        <div class="card">
          <div class="card-title"><h2>${icon('bell')} Suivi & notifications</h2></div>
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
        <div class="card-title">
          <h2>${icon('flag')} Éditeur de FastFlags</h2>
          <div class="row">
            <button class="btn sm" id="ff-import">${icon('plus')} Importer du JSON</button>
            <button class="btn sm" id="ff-export">${icon('copy')} Copier en JSON</button>
            <button class="btn sm primary" id="ff-save">Enregistrer</button>
          </div>
        </div>
        <div class="notice warn">${icon('alert')}<div>Depuis septembre 2025, Roblox n'accepte plus qu'une <b>liste autorisée</b> de FastFlags. Les flags marqués <span class="badge ok">autorisé</span> fonctionnent ; les autres sont enregistrés mais seront probablement ignorés par Roblox.</div></div>
        <div class="grid grid-2 mt" id="ff-friendly"></div>
        <div class="section-title">Tous les flags</div>
        <table class="table" id="ff-table"></table>
        <div class="row mt">
          <input class="input mono" id="ff-key" placeholder="NomDuFlag" style="flex:2">
          <input class="input mono" id="ff-val" placeholder="Valeur" style="flex:1">
          <button class="btn" id="ff-add">${icon('plus')} Ajouter</button>
        </div>
      </div>`;

    const bind = (id, key, after) => el.querySelector(`#t-${id}`).addEventListener('change', async (e) => {
      await App.setStore(key, e.target.checked);
      after?.(e.target.checked);
    });
    bind('multi', 'launch.multiInstance', (on) => toast(on ? 'Multi-instance activé : lance Roblox depuis BloxPlus pour ouvrir plusieurs fenêtres.' : 'Multi-instance désactivé'));
    bind('mods', 'launch.applyMods');
    bind('minimize', 'launch.minimizeOnLaunch');
    bind('overlay', 'overlay.enabled');
    bind('region', 'notify.serverRegion');
    bind('friends', 'notify.friends');
    bind('admin', 'notify.adminInServer');

    el.querySelector('#mods-open').addEventListener('click', () => bp.mods.open());
    el.querySelector('#mods-restore').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const n = await bp.mods.restore();
      toast(n ? `${n} fichier(s) restauré(s)` : 'Aucun mod à retirer', 'ok');
    }));

    el.querySelector('#ff-save').addEventListener('click', (e) => busy(e.currentTarget, () => this.save()));
    el.querySelector('#ff-export').addEventListener('click', async () => {
      await navigator.clipboard.writeText(JSON.stringify(this.flags, null, 2));
      toast('FastFlags copiés dans le presse-papiers', 'ok');
    });
    el.querySelector('#ff-import').addEventListener('click', () => this.importDialog(el));
    el.querySelector('#ff-add').addEventListener('click', () => {
      const k = el.querySelector('#ff-key').value.trim();
      const v = el.querySelector('#ff-val').value.trim();
      if (!/^[A-Za-z0-9_]+$/.test(k)) return toast('Nom de flag invalide', 'warn');
      this.flags[k] = v;
      el.querySelector('#ff-key').value = '';
      el.querySelector('#ff-val').value = '';
      this.drawFlags(el);
    });

    this.drawFlags(el);
  },

  setting(id, title, desc, checked) {
    return `<div class="setting"><div class="label"><b>${title}</b><span>${desc}</span></div>${toggleHtml('t-' + id, checked)}</div>`;
  },

  drawFlags(el) {
    // Réglages lisibles
    const f = this.flags;
    el.querySelector('#ff-friendly').innerHTML = this.presetFlags.map((p) => {
      if (p.type === 'renderer') {
        const val = f.FFlagDebugGraphicsPreferVulkan === 'True' ? 'vulkan' : f.FFlagDebugGraphicsPreferOpenGL === 'True' ? 'opengl' : f.FFlagDebugGraphicsPreferD3D11 === 'True' ? 'd3d11' : '';
        return this.row(p.label, `<select class="select" data-renderer>
          ${[['', 'Automatique'], ['d3d11', 'DirectX 11'], ['vulkan', 'Vulkan'], ['opengl', 'OpenGL']].map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}
        </select>`);
      }
      if (p.type === 'select') {
        return this.row(p.label, `<select class="select" data-flag="${p.key}">${p.options.map(([v, l]) => `<option value="${v}" ${String(f[p.key] ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
      }
      if (p.type === 'bool') {
        const on = p.invert ? f[p.key] === 'False' : f[p.key] === 'True';
        return this.row(p.label, `<label class="toggle"><input type="checkbox" data-bool="${p.key}" data-invert="${p.invert ? 1 : 0}" ${on ? 'checked' : ''}><span></span></label>`);
      }
      return this.row(p.label, `<input class="input" type="number" min="${p.min}" max="${p.max}" data-flag="${p.key}" value="${esc(f[p.key] ?? '')}" placeholder="Auto" style="width:110px">`);
    }).join('');

    const friendly = el.querySelector('#ff-friendly');
    friendly.querySelectorAll('[data-flag]').forEach((i) => i.addEventListener('change', () => {
      const k = i.dataset.flag;
      if (i.value === '') delete f[k]; else f[k] = i.value;
      if (k === 'DFIntTextureQualityOverride') { if (i.value === '') delete f.DFFlagTextureQualityOverrideEnabled; else f.DFFlagTextureQualityOverrideEnabled = 'True'; }
      this.drawTable(el);
    }));
    friendly.querySelectorAll('[data-bool]').forEach((i) => i.addEventListener('change', () => {
      const k = i.dataset.bool;
      const invert = i.dataset.invert === '1';
      if (i.checked) f[k] = invert ? 'False' : 'True'; else delete f[k];
      this.drawTable(el);
    }));
    friendly.querySelector('[data-renderer]').addEventListener('change', (e) => {
      delete f.FFlagDebugGraphicsPreferVulkan; delete f.FFlagDebugGraphicsPreferOpenGL; delete f.FFlagDebugGraphicsPreferD3D11;
      const map = { d3d11: 'FFlagDebugGraphicsPreferD3D11', vulkan: 'FFlagDebugGraphicsPreferVulkan', opengl: 'FFlagDebugGraphicsPreferOpenGL' };
      if (map[e.target.value]) f[map[e.target.value]] = 'True';
      this.drawTable(el);
    });
    this.drawTable(el);
  },

  row(label, control) {
    return `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${label}</span>${control}</div>`;
  },

  drawTable(el) {
    const entries = Object.entries(this.flags).sort(([a], [b]) => a.localeCompare(b));
    const table = el.querySelector('#ff-table');
    if (!entries.length) { table.innerHTML = `<tr><td>${emptyHtml('flag', 'Aucun FastFlag défini.')}</td></tr>`; return; }
    table.innerHTML = `<thead><tr><th>Flag</th><th style="width:200px">Valeur</th><th style="width:110px">Statut</th><th style="width:50px"></th></tr></thead><tbody>
      ${entries.map(([k, v]) => `<tr class="flag-row">
        <td>${esc(k)}</td>
        <td><input class="input mono" data-edit="${esc(k)}" value="${esc(v)}"></td>
        <td>${this.allow.has(k) ? '<span class="badge ok">autorisé</span>' : '<span class="badge warn">peut être ignoré</span>'}</td>
        <td><button class="btn icon ghost" data-del="${esc(k)}" title="Supprimer">${icon('trash')}</button></td>
      </tr>`).join('')}</tbody>`;
    table.querySelectorAll('[data-edit]').forEach((i) => i.addEventListener('change', () => { this.flags[i.dataset.edit] = i.value; }));
    table.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { delete this.flags[b.dataset.del]; this.drawFlags(el); }));
  },

  async save() {
    const r = await bp.fflags.set(this.flags);
    App.store = await bp.store.get();
    toast(r.written ? 'FastFlags enregistrés et appliqués à Roblox' : 'FastFlags enregistrés (appliqués au prochain lancement)', 'ok');
  },

  importDialog(el) {
    const m = modal(`
      <div style="padding:24px">
        <h2 style="margin:0 0 6px">Importer des FastFlags</h2>
        <p class="hint">Colle un JSON de FastFlags (par exemple exporté depuis Bloxstrap ou BetterStrap). Les flags existants avec le même nom seront remplacés.</p>
        <textarea class="input mt" id="ff-json" placeholder='{ "FIntDebugForceMSAASamples": "4" }'></textarea>
        <div class="row mt"><span class="spacer"></span><button class="btn ghost" data-close>Annuler</button><button class="btn primary" id="ff-do">Importer</button></div>
      </div>`);
    m.el.querySelector('#ff-do').addEventListener('click', () => {
      try {
        const obj = JSON.parse(m.el.querySelector('#ff-json').value);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error();
        for (const [k, v] of Object.entries(obj)) this.flags[k] = String(v);
        m.close();
        this.drawFlags(el);
        toast(`${Object.keys(obj).length} flag(s) importé(s). Pense à enregistrer.`, 'ok');
      } catch {
        toast('JSON invalide', 'bad');
      }
    });
  },
};
