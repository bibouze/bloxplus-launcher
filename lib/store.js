// Stockage JSON simple dans le dossier userData de l'application.
const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return deepMerge(structuredClone(this.defaults), raw);
    } catch {
      return structuredClone(this.defaults);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(key) {
    return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data);
  }

  set(key, value) {
    const parts = key.split('.');
    let o = this.data;
    for (const k of parts.slice(0, -1)) o = o[k] ??= {};
    o[parts.at(-1)] = value;
    this.save();
  }
}

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

module.exports = { JsonStore };
