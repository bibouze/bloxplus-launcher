// Shaders via ReShade (même principe que Bloxshade).
// 1. L'utilisateur installe ReShade sur RobloxPlayerBeta.exe (DirectX 10/11/12) avec les effets standard.
// 2. BloxPlus importe l'installation dans son propre dossier, pour la réappliquer
//    automatiquement après chaque mise à jour de Roblox (nouveau dossier de version).
// 3. Au lancement, BloxPlus copie ReShade + le préréglage choisi, ou retire ReShade si les shaders sont coupés.
const fs = require('fs');
const path = require('path');

const RESHADE_FILES = ['dxgi.dll', 'ReShade.ini', 'ReShadePreset.ini'];
const SHADER_DIR = 'reshade-shaders';

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function status(versionDir, storeDir) {
  return {
    inRoblox: !!versionDir && fs.existsSync(path.join(versionDir, 'dxgi.dll')) && fs.existsSync(path.join(versionDir, 'ReShade.ini')),
    imported: fs.existsSync(path.join(storeDir, 'dxgi.dll')),
    hasShaders: fs.existsSync(path.join(storeDir, SHADER_DIR)) || (!!versionDir && fs.existsSync(path.join(versionDir, SHADER_DIR))),
  };
}

// Copie ReShade depuis le dossier de version de Roblox vers le dossier de BloxPlus.
function importFromRoblox(versionDir, storeDir) {
  if (!fs.existsSync(path.join(versionDir, 'dxgi.dll'))) {
    throw new Error("ReShade n'est pas installé dans le dossier de Roblox. Installez-le d'abord sur RobloxPlayerBeta.exe.");
  }
  fs.mkdirSync(storeDir, { recursive: true });
  for (const f of RESHADE_FILES) {
    const src = path.join(versionDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(storeDir, f));
  }
  const shaders = path.join(versionDir, SHADER_DIR);
  if (fs.existsSync(shaders)) copyDir(shaders, path.join(storeDir, SHADER_DIR));
  return status(versionDir, storeDir);
}

// Règle une clé dans une section d'un fichier .ini (crée la section si besoin).
function setIni(text, section, key, value) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  let sectionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].match(/^\s*\[(.+)\]\s*$/);
    if (s) {
      if (inSection) break;
      inSection = s[1] === section;
      if (inSection) sectionIdx = i;
      continue;
    }
    if (inSection && lines[i].split('=')[0].trim() === key) {
      lines[i] = `${key}=${value}`;
      return lines.join('\r\n');
    }
  }
  if (sectionIdx === -1) {
    lines.push('', `[${section}]`, `${key}=${value}`);
  } else {
    lines.splice(sectionIdx + 1, 0, `${key}=${value}`);
  }
  return lines.join('\r\n');
}

function apply(versionDir, storeDir, presetsDir, { enabled, preset }) {
  const dll = path.join(versionDir, 'dxgi.dll');
  if (!enabled) {
    if (fs.existsSync(dll)) fs.renameSync(dll, dll + '.off');
    return 'off';
  }
  if (fs.existsSync(dll + '.off') && !fs.existsSync(dll)) fs.renameSync(dll + '.off', dll);
  if (!fs.existsSync(dll)) {
    if (!fs.existsSync(path.join(storeDir, 'dxgi.dll'))) return 'missing';
    for (const f of RESHADE_FILES) {
      const src = path.join(storeDir, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(versionDir, f));
    }
    const shaders = path.join(storeDir, SHADER_DIR);
    if (fs.existsSync(shaders) && !fs.existsSync(path.join(versionDir, SHADER_DIR))) copyDir(shaders, path.join(versionDir, SHADER_DIR));
  }
  if (preset) {
    const src = path.join(presetsDir, `${preset}.ini`);
    if (fs.existsSync(src)) {
      const target = `BloxPlus-${preset}.ini`;
      fs.copyFileSync(src, path.join(versionDir, target));
      const iniFile = path.join(versionDir, 'ReShade.ini');
      let ini = fs.existsSync(iniFile) ? fs.readFileSync(iniFile, 'utf8') : '';
      ini = setIni(ini, 'GENERAL', 'PresetPath', `.\\${target}`);
      fs.writeFileSync(iniFile, ini);
    }
  }
  return 'on';
}

function listPresets(presetsDir) {
  const out = [];
  for (const f of fs.readdirSync(presetsDir)) {
    if (!f.endsWith('.ini')) continue;
    const text = fs.readFileSync(path.join(presetsDir, f), 'utf8');
    const meta = Object.fromEntries([...text.matchAll(/^;\s*(\w+):\s*(.+)$/gm)].map((m) => [m[1], m[2].trim()]));
    const techniques = (text.match(/^Techniques=(.*)$/m)?.[1] || '').split(',').filter(Boolean).map((t) => t.split('@')[0]);
    out.push({ id: f.replace(/\.ini$/, ''), name: meta.Name || f, desc: meta.Description || '', cost: Number(meta.Cost || 1), colors: (meta.Colors || '').split(' ').filter(Boolean), techniques });
  }
  return out.sort((a, b) => a.cost - b.cost);
}

module.exports = { status, importFromRoblox, apply, listPresets };
