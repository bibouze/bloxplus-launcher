// Optimisation : analyse du PC, optimisation automatique, 4 niveaux beauté / fluidité, réglages Windows.
const PRESET_ORDER = ['performance', 'balanced', 'quality', 'ultra'];
const PRESET_ICONS = { performance: 'zap', balanced: 'gauge', quality: 'eye', ultra: 'sparkles' };

Views.optimize = {
  async render(el) {
    const [presets, tweaks, game] = await Promise.all([bp.optimizer.presets(), bp.optimizer.tweaks().catch(() => ({})), bp.optimizer.gameSettings()]);
    this.presets = presets;
    const hw = App.store.hardware;

    el.innerHTML = `
      <div class="view-head">
        <div>
          <h1>Optimisation</h1>
          <p>BloxPlus analyse ton PC et choisit les meilleurs réglages. Tu peux aussi comparer les 4 niveaux, de la fluidité maximale à la beauté maximale.</p>
        </div>
        <div class="actions"><button class="btn primary lg" id="auto">${icon('wand')} Optimisation automatique</button></div>
      </div>

      <div class="card">
        <div class="card-title"><h2>${icon('cpu')} Mon PC</h2><button class="btn sm" id="scan">${icon('refresh')} ${hw ? 'Analyser à nouveau' : 'Analyser mon PC'}</button></div>
        <div id="hw"></div>
      </div>

      <div class="section-title">Niveaux d'optimisation</div>
      <div class="grid grid-4" id="presets"></div>

      <div class="card mt">
        <div class="card-title"><h2>${icon('layers')} Comparatif détaillé</h2><p>Ce que chaque niveau change dans Roblox</p></div>
        <div id="compare"></div>
      </div>

      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-title"><h2>${icon('monitor')} Réglages Windows</h2></div>
          <div class="setting"><div class="label"><b>Carte graphique haute performance</b><span>Force Windows à utiliser le GPU dédié pour Roblox (utile sur les portables).</span></div>${toggleHtml('tw-gpu', tweaks.gpu)}</div>
          <div class="setting"><div class="label"><b>Désactiver les optimisations plein écran</b><span>Peut réduire la latence et les saccades sur certains PC.</span></div>${toggleHtml('tw-fso', tweaks.fso)}</div>
        </div>
        <div class="card">
          <div class="card-title"><h2>${icon('broom')} Nettoyage & état actuel</h2></div>
          <p class="hint">Supprime les fichiers temporaires, les téléchargements et les logs de plus de 7 jours de Roblox. Tes réglages et ta connexion ne sont pas touchés.</p>
          <button class="btn mt" id="clean">${icon('broom')} Nettoyer le cache Roblox</button>
          <div class="section-title" style="margin-top:20px">Réglages Roblox actuels</div>
          ${game ? `<dl class="hw-list">
            <dt>Qualité graphique</dt><dd>${game.SavedQualityLevel ? `${game.SavedQualityLevel} / 10` : 'Automatique'}</dd>
            <dt>Niveau de rendu</dt><dd>${game.GraphicsQualityLevel ?? '?'} / 21</dd>
            <dt>Limite d'images/s</dt><dd>${game.FramerateCap ? `${game.FramerateCap} FPS` : 'Par défaut'}</dd>
            <dt>Plein écran</dt><dd>${game.Fullscreen ? 'Oui' : 'Non'}</dd>
          </dl>` : '<span class="muted small">Réglages Roblox introuvables (lance Roblox une première fois).</span>'}
        </div>
      </div>

      <details class="card mt advanced" id="adv">
        <summary><h2>${icon('flag')} Réglages avancés <span class="muted small">FastFlags</span></h2></summary>
        <p class="hint">Pour les joueurs qui veulent aller plus loin : réglages lisibles, liste complète des FastFlags, import et export JSON.</p>
        <div id="adv-body" class="mt"></div>
      </details>`;

    this.drawHardware(el, hw);
    this.drawPresets(el, hw);
    this.drawCompare(el);

    el.querySelector('#scan').addEventListener('click', (e) => busy(e.currentTarget, () => this.scan(el)));
    el.querySelector('#auto').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const h = App.store.hardware || await this.scan(el);
      await this.apply(el, h.recommended);
    }));
    el.querySelector('#tw-gpu').addEventListener('change', (e) => busy(null, async () => { await bp.optimizer.setTweak('gpu', e.target.checked); toast('Préférence GPU mise à jour', 'ok'); }));
    el.querySelector('#tw-fso').addEventListener('change', (e) => busy(null, async () => { await bp.optimizer.setTweak('fso', e.target.checked); toast('Réglage plein écran mis à jour', 'ok'); }));
    // L'éditeur de FastFlags n'est construit qu'à la première ouverture de la section.
    el.querySelector('#adv').addEventListener('toggle', (e) => {
      if (!e.target.open || e.target.dataset.ready) return;
      e.target.dataset.ready = '1';
      FFlagsEditor.mount(el.querySelector('#adv-body')).catch((err) => {
        e.target.dataset.ready = '';
        el.querySelector('#adv-body').innerHTML = `<div class="notice bad">${icon('alert')}<div>Erreur : ${esc(err.message)}</div></div>`;
      });
    });
    el.querySelector('#clean').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const freed = await bp.optimizer.clean();
      toast(`Nettoyage terminé : ${fmtBytes(freed)} libérés`, 'ok');
    }));

    if (!hw) this.scan(el).catch(() => {});
  },

  async scan(el) {
    el.querySelector('#hw').innerHTML = '<div class="skeleton" style="height:150px"></div>';
    const hw = await bp.optimizer.detect();
    App.store = await bp.store.get();
    if (App.current === 'optimize') {
      this.drawHardware(el, hw);
      this.drawPresets(el, hw);
    }
    return hw;
  },

  drawHardware(el, hw) {
    const box = el.querySelector('#hw');
    if (!hw) { box.innerHTML = '<div class="skeleton" style="height:150px"></div>'; return; }
    const labels = { performance: 'PC modeste', balanced: 'PC correct', quality: 'Bon PC de jeu', ultra: 'PC puissant' };
    const circ = 2 * Math.PI * 62;
    box.innerHTML = `
      <div class="row" style="gap:32px;align-items:center">
        <div class="gauge">
          <svg viewBox="0 0 150 150">
            <defs><linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>
            <circle class="track" cx="75" cy="75" r="62"/>
            <circle class="val" cx="75" cy="75" r="62" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - hw.score / 100)}"/>
          </svg>
          <div class="center"><div><b>${hw.score}</b><span>score / 100</span></div></div>
        </div>
        <dl class="hw-list" style="flex:1">
          <dt>${icon('cpu')} Processeur</dt><dd>${esc(hw.cpu)} <span class="muted">· ${hw.cores} cœurs / ${hw.threads} threads</span></dd>
          <dt>${icon('monitor')} Carte graphique</dt><dd>${esc(hw.gpu.name)} ${hw.gpu.vram ? `<span class="muted">· ${fmtBytes(hw.gpu.vram)}</span>` : ''}</dd>
          <dt>${icon('memory')} Mémoire</dt><dd>${fmtBytes(hw.ram)}</dd>
          <dt>${icon('window')} Écran</dt><dd>${hw.gpu.width ? `${hw.gpu.width}×${hw.gpu.height} · ` : ''}${hw.gpu.refresh || '?'} Hz</dd>
        </dl>
        <div style="text-align:center;min-width:190px">
          <div class="muted small">Catégorie</div>
          <div style="font:650 20px var(--font-display);margin:4px 0 10px">${labels[hw.recommended]}</div>
          <span class="badge accent">Recommandé : ${esc(this.presets[hw.recommended].name)}</span>
        </div>
      </div>`;
  },

  drawPresets(el, hw) {
    const current = App.store.preset;
    const dots = (n, cls) => `<span class="dots ${cls}">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
    el.querySelector('#presets').innerHTML = PRESET_ORDER.map((id) => {
      const p = this.presets[id];
      return `
        <div class="card preset-card ${current === id ? 'current' : ''}">
          <div class="tags">
            ${hw?.recommended === id ? '<span class="badge accent">Recommandé</span>' : ''}
            ${current === id ? '<span class="badge ok">Actif</span>' : ''}
          </div>
          <div class="icon-wrap">${icon(PRESET_ICONS[id])}</div>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.desc)}</p>
          <div class="meter"><span>Beauté</span>${dots(p.beauty, 'beauty')}<span>Fluidité</span>${dots(p.fluidity, 'fluid')}</div>
          <button class="btn ${current === id ? 'ok' : ''}" data-apply="${id}">${current === id ? 'Appliqué' : 'Appliquer'}</button>
        </div>`;
    }).join('');
    el.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => busy(b, () => this.apply(el, b.dataset.apply))));
  },

  drawCompare(el) {
    const msaa = (v) => (v === '0' ? 'Désactivé' : `${v}x`);
    const tex = (v) => ['Très basse', 'Basse', 'Moyenne', 'Haute'][Number(v)] || 'Auto';
    const rows = [
      ['Qualité graphique', (p) => `${p.settings.SavedQualityLevel} / 10`],
      ['Niveau de rendu', (p) => `${p.flags.DFIntDebugFRMQualityLevelOverride} / 21`],
      ['Anticrénelage', (p) => msaa(p.flags.FIntDebugForceMSAASamples)],
      ['Textures', (p) => tex(p.flags.DFIntTextureQualityOverride)],
      ["Distance de l'herbe", (p) => (p.flags.FIntFRMMaxGrassDistance === '0' ? 'Pas d\'herbe' : `${p.flags.FIntFRMMaxGrassDistance} studs`)],
      ['Détail des maillages', (p) => (p.flags.DFIntCSGLevelOfDetailSwitchingDistance === '0' ? 'Minimum' : p.flags.DFIntCSGLevelOfDetailSwitchingDistance ? 'Maximum' : 'Par défaut')],
      ['Ciel', (p) => (p.flags.FFlagDebugSkyGray === 'True' ? 'Gris (léger)' : 'Normal')],
      ['Limite FPS', (p, id) => (id === 'performance' ? '240+ FPS' : id === 'ultra' ? 'Fréquence écran (max 144)' : 'Fréquence de l\'écran')],
    ];
    el.querySelector('#compare').innerHTML = `
      <table class="table">
        <thead><tr><th></th>${PRESET_ORDER.map((id) => `<th>${esc(this.presets[id].name)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(([label, fn]) => `<tr><td class="muted">${label}</td>${PRESET_ORDER.map((id) => `<td>${fn(this.presets[id], id)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  },

  async apply(el, id) {
    const r = await bp.optimizer.apply(id);
    App.store = await bp.store.get();
    if (App.current === 'optimize') this.drawPresets(el, App.store.hardware);
    toast(`Niveau « ${this.presets[id].name} » appliqué`, 'ok');
    if (r.running) toast('Roblox est ouvert : la qualité graphique et la limite FPS seront appliquées après sa fermeture (relance l’optimisation).', 'warn');
  },
};
