// Réglages du joueur Roblox (GlobalBasicSettings_13.xml) : qualité graphique, limite d'images/s...
// Roblox réécrit ce fichier à la fermeture : on ne le modifie que lorsque Roblox est fermé.
const fs = require('fs');
const { globalSettingsFile } = require('./paths');

const FIELDS = {
  FramerateCap: 'int',
  GraphicsQualityLevel: 'int',
  SavedQualityLevel: 'token',
  MaxQualityEnabled: 'bool',
  Fullscreen: 'bool',
  ReducedMotion: 'bool',
};

function read() {
  let xml;
  try { xml = fs.readFileSync(globalSettingsFile, 'utf8'); } catch { return null; }
  const out = {};
  for (const [name, type] of Object.entries(FIELDS)) {
    const m = xml.match(new RegExp(`<${type} name="${name}">([^<]*)</${type}>`));
    if (!m) continue;
    out[name] = type === 'bool' ? m[1] === 'true' : Number(m[1]);
  }
  return out;
}

function write(values) {
  let xml;
  try { xml = fs.readFileSync(globalSettingsFile, 'utf8'); } catch { return false; }
  for (const [name, value] of Object.entries(values)) {
    const type = FIELDS[name];
    if (!type || value == null) continue;
    const text = type === 'bool' ? String(!!value) : String(Math.round(value));
    const re = new RegExp(`(<${type} name="${name}">)[^<]*(</${type}>)`);
    if (re.test(xml)) {
      xml = xml.replace(re, `$1${text}$2`);
    } else {
      xml = xml.replace('<Properties>', `<Properties>\n\t\t\t<${type} name="${name}">${text}</${type}>`);
    }
  }
  fs.copyFileSync(globalSettingsFile, globalSettingsFile + '.bloxplus.bak');
  fs.writeFileSync(globalSettingsFile, xml);
  return true;
}

module.exports = { read, write };
