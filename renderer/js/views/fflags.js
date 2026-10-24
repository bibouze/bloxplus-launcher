// Éditeur de FastFlags (réglages lisibles + table libre, import/export JSON). Monté dans Optimisation › Réglages avancés.
const FFlagsEditor = {
  async mount(el) {
    const ff = await bp.fflags.get();
    this.flags = { ...ff.flags };
    this.allow = new Set(ff.allowlist);
    this.presetFlags = ff.presetFlags;

    el.innerHTML = `
      <div class="row wrap" style="justify-content:flex-end">
        <button class="btn sm" id="ff-import">${icon('plus')} Importer du JSON</button>
        <button class="btn sm" id="ff-export">${icon('copy')} Copier en JSON</button>
        <button class="btn sm primary" id="ff-save">Enregistrer</button>
      </div>
      <div class="notice warn mt">${icon('alert')}<div>Depuis septembre 2025, Roblox n'accepte plus qu'une <b>liste autorisée</b> de FastFlags. Les flags marqués <span class="badge ok">autorisé</span> fonctionnent ; les autres sont enregistrés mais seront probablement ignorés par Roblox.</div></div>
      <div class="grid grid-2 mt" id="ff-friendly"></div>
      <div class="section-title">Tous les flags</div>
      <table class="table" id="ff-table"></table>
      <div class="row mt">
        <input class="input mono" id="ff-key" placeholder="NomDuFlag" style="flex:2">
        <input class="input mono" id="ff-val" placeholder="Valeur" style="flex:1">
        <button class="btn" id="ff-add">${icon('plus')} Ajouter</button>
      </div>`;

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
