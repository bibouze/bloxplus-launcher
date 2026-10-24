// Shaders : un interrupteur et un style. BloxPlus télécharge ReShade et les shaders tout seul (CONTRACTS §2.4).
const SHADER_PHASES = { download: 'Téléchargement de ReShade et des shaders', extract: 'Installation des shaders' };

Views.shaders = {
  prog: null, // dernier événement `shaders:progress` (la vue peut être fermée pendant le téléchargement)

  async render(el) {
    const [status, presets] = await Promise.all([bp.shaders.status(), bp.shaders.presets()]);
    // Ancien format de shaders:status (avant Cœur 1.3) : `imported`/`inRoblox` au lieu de `installed`.
    this.installed = status.installed ?? !!(status.imported || status.inRoblox);
    this.reshadeVersion = status.reshadeVersion || null;
    const enabled = status.enabled ?? App.store.shaders.enabled;
    const downloading = this.prog && ['download', 'extract'].includes(this.prog.phase);

    el.innerHTML = `
      <div class="view-head">
        <div>
          <h1>Shaders</h1>
          <p>Rends Roblox plus beau avec des filtres graphiques : couleurs, contraste, netteté, ambiance cinéma… Active l'interrupteur et choisis un style, BloxPlus s'occupe du reste, y compris après chaque mise à jour de Roblox.</p>
        </div>
        <div class="actions">
          <div class="card row" style="padding:10px 14px;gap:12px"><b>Shaders</b>${toggleHtml('sh-on', enabled)}</div>
        </div>
      </div>

      <div class="card" id="sh-status"></div>

      <div class="section-title">Styles graphiques</div>
      <div class="grid grid-3" id="presets"></div>

      <div class="notice warn mt">${icon('alert')}<div>Les shaders utilisent ReShade, un programme tiers non officiel : Roblox ne l'interdit pas explicitement mais ne le garantit pas non plus. Ils coûtent des FPS : combine-les avec un niveau d'optimisation adapté. En jeu, la touche <kbd>Origine</kbd> (Home) ouvre le menu ReShade pour affiner.</div></div>`;

    this.drawStatus(el, enabled);
    this.drawPresets(el, presets);

    el.querySelector('#sh-on').addEventListener('change', (e) => busy(null, async () => {
      const box = e.target;
      const r = await bp.shaders.set({ enabled: box.checked });
      App.store = await bp.store.get();
      if (r?.result === 'error') {
        box.checked = !box.checked;
        throw new Error(r.message || "Impossible de changer l'état des shaders.");
      }
      if (r?.result === 'downloading' || (box.checked && !this.installed)) {
        toast('Téléchargement de ReShade et des shaders…', 'ok');
      } else if (r?.result === 'pending' || r?.running) {
        toast('Roblox est ouvert : le changement prendra effet au prochain lancement.', 'warn');
      } else {
        toast(box.checked ? 'Shaders activés' : 'Shaders désactivés', 'ok');
      }
      this.drawStatus(el, box.checked);
    }));
  },

  drawStatus(el, enabled) {
    const box = el.querySelector('#sh-status');
    if (!box) return;
    const p = this.prog;
    if (p && ['download', 'extract'].includes(p.phase)) {
      const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
      box.innerHTML = `
        <div class="card-title"><h2>${icon('wand')} ${SHADER_PHASES[p.phase]}</h2><span class="badge warn">${pct} %</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <p class="hint mt">${p.phase === 'download' && p.total ? `${fmtBytes(p.done)} sur ${fmtBytes(p.total)}` : 'Quelques secondes'}. Tu peux quitter cet onglet, le téléchargement continue.</p>`;
      return;
    }
    const state = !this.installed
      ? '<span class="badge">Téléchargé à la première activation</span>'
      : `<span class="badge ok">ReShade prêt${this.reshadeVersion ? ' · ' + esc(this.reshadeVersion) : ''}</span>`;
    box.innerHTML = `
      <div class="card-title"><h2>${icon('wand')} ${enabled ? 'Shaders activés' : 'Shaders désactivés'}</h2>${state}</div>
      <p class="hint">${p?.phase === 'error' ? esc(p.message || 'Le téléchargement a échoué : active à nouveau les shaders pour réessayer.') : 'Aucune installation à faire : lance Roblox depuis BloxPlus et le style choisi est appliqué.'}</p>`;
  },

  drawPresets(el, presets) {
    const current = App.store.shaders.preset;
    el.querySelector('#presets').innerHTML = presets.map((p) => `
      <div class="card shader-card ${p.id === current ? 'current' : ''}" data-preset="${esc(p.id)}">
        <div class="swatch" style="background: linear-gradient(120deg, ${p.colors.map(esc).join(', ') || '#333, #555'})">
          ${p.id === current ? '<span class="badge">Sélectionné</span>' : ''}
        </div>
        <div class="body">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.desc)}</p>
          <div class="row small muted">Coût en FPS <span class="dots fluid">${[1, 2, 3].map((i) => `<i class="${i <= p.cost ? 'on' : ''}" style="${i <= p.cost ? 'background:linear-gradient(90deg,#fbbf24,#f87171)' : ''}"></i>`).join('')}</span></div>
          <div class="row wrap" style="gap:5px">${p.techniques.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}</div>
        </div>
      </div>`).join('');
    el.querySelectorAll('[data-preset]').forEach((c) => c.addEventListener('click', () => busy(null, async () => {
      const r = await bp.shaders.set({ preset: c.dataset.preset });
      App.store = await bp.store.get();
      this.drawPresets(el, presets);
      toast(r?.result === 'pending' || r?.running ? 'Style choisi : il sera appliqué au prochain lancement de Roblox.' : 'Style appliqué', 'ok');
    })));
  },

  // Appelé par app.js à chaque `shaders:progress`, vue ouverte ou non.
  onProgress(ev) {
    this.prog = ev;
    if (ev.phase === 'done') {
      this.installed = true;
      toast('Shaders prêts', 'ok');
    } else if (ev.phase === 'error') {
      toast(ev.message || 'Téléchargement des shaders impossible', 'bad');
    }
    if (App.current === 'shaders') {
      const el = $('#view-inner');
      if (!el) return;
      if (ev.phase === 'done' || ev.phase === 'error') {
        App.go('shaders'); // relit l'état réel (interrupteur remis à sa place en cas d'échec)
      } else {
        this.drawStatus(el, el.querySelector('#sh-on')?.checked);
      }
    }
  },
};
