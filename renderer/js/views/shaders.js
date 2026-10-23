// Shaders : installation guidée de ReShade et choix d'un style graphique.
Views.shaders = {
  async render(el) {
    const [status, presets] = await Promise.all([bp.shaders.status(), bp.shaders.presets()]);
    const cfg = App.store.shaders;
    const roblox = App.info.roblox;
    const ready = status.imported || status.inRoblox;

    el.innerHTML = `
      <div class="view-head">
        <div>
          <h1>Shaders</h1>
          <p>Rends Roblox plus beau avec des filtres graphiques ReShade : couleurs, contraste, netteté, faux HDR, ambiance cinéma… BloxPlus les réapplique tout seul après chaque mise à jour de Roblox.</p>
        </div>
        <div class="actions">
          <div class="card row" style="padding:10px 14px;gap:12px"><b>Shaders</b>${toggleHtml('sh-on', cfg.enabled && ready)}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><h2>${icon('wand')} Installation</h2>${ready ? '<span class="badge ok">ReShade prêt</span>' : '<span class="badge warn">À installer</span>'}</div>
        <div class="steps">
          <div class="step ${ready ? 'done' : ''}">
            <span class="n">1</span>
            <div>
              <b class="t">Installer ReShade</b>
              <p>Télécharge ReShade, choisis <span class="mono">RobloxPlayerBeta.exe</span> dans le dossier ci-dessous, puis <b>DirectX 10/11/12</b>. Coche les packs <b>Standard effects</b> et <b>Legacy standard effects</b>.</p>
              <div class="row wrap">
                <button class="btn sm primary" id="dl">${icon('external')} reshade.me</button>
                ${roblox ? `<button class="btn sm" id="open-dir">${icon('folder')} Dossier de Roblox</button>` : ''}
              </div>
            </div>
          </div>
          <div class="step ${status.imported ? 'done' : ''}">
            <span class="n">2</span>
            <div>
              <b class="t">Importer dans BloxPlus</b>
              <p>BloxPlus garde une copie de ReShade pour la remettre automatiquement quand Roblox se met à jour (nouveau dossier de version).</p>
              <button class="btn sm" id="import" ${status.inRoblox ? '' : 'disabled'}>${icon('copy')} Importer depuis Roblox</button>
            </div>
          </div>
          <div class="step ${cfg.enabled && ready ? 'done' : ''}">
            <span class="n">3</span>
            <div>
              <b class="t">Choisir un style</b>
              <p>Sélectionne un préréglage ci-dessous, active les shaders et lance Roblox. En jeu, la touche <kbd>Origine</kbd> (Home) ouvre le menu ReShade pour affiner.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="section-title">Styles graphiques</div>
      <div class="grid grid-3" id="presets"></div>

      <div class="notice warn mt">${icon('alert')}<div>ReShade est un programme tiers non officiel, utilisé notamment par Bloxshade. Roblox ne l'interdit pas explicitement mais ne le garantit pas non plus : utilise-le à tes risques. Les shaders coûtent des FPS : combine-les avec un niveau d'optimisation adapté.</div></div>`;

    const drawPresets = () => {
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
        drawPresets();
        toast(r.running ? 'Style choisi : il sera appliqué au prochain lancement de Roblox.' : 'Style appliqué', 'ok');
      })));
    };
    drawPresets();

    el.querySelector('#dl').addEventListener('click', () => bp.open('https://reshade.me/'));
    el.querySelector('#open-dir')?.addEventListener('click', () => bp.openPath(roblox.dir));
    el.querySelector('#import').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      await bp.shaders.import();
      toast('ReShade importé dans BloxPlus', 'ok');
      App.go('shaders');
    }));
    el.querySelector('#sh-on').addEventListener('change', (e) => busy(null, async () => {
      if (e.target.checked && !ready) {
        e.target.checked = false;
        throw new Error("Installe d'abord ReShade (étape 1).");
      }
      const r = await bp.shaders.set({ enabled: e.target.checked });
      App.store = await bp.store.get();
      toast(e.target.checked ? 'Shaders activés' : 'Shaders désactivés', 'ok');
      if (r.running) toast('Roblox est ouvert : le changement prendra effet au prochain lancement.', 'warn');
    }));
  },
};
