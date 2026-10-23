// Mods : le contenu du dossier des mods est recopié dans le dossier de version de Roblox au lancement
// (même arborescence, ex. content/textures/Cursors/KeyboardMouse/ArrowCursor.png).
// Les fichiers d'origine remplacés sont sauvegardés pour pouvoir être restaurés.
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = '.bloxplus-backup';
const MANIFEST = '.bloxplus-mods.json';

function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

function restore(versionDir) {
  const manifestFile = path.join(versionDir, MANIFEST);
  let manifest = [];
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { return 0; }
  for (const { rel, hadOriginal } of manifest) {
    const target = path.join(versionDir, rel);
    const backup = path.join(versionDir, BACKUP_DIR, rel);
    try {
      if (hadOriginal) fs.copyFileSync(backup, target);
      else fs.rmSync(target, { force: true });
    } catch { /* fichier déjà absent */ }
  }
  fs.rmSync(path.join(versionDir, BACKUP_DIR), { recursive: true, force: true });
  fs.rmSync(manifestFile, { force: true });
  return manifest.length;
}

function apply(versionDir, modsDir) {
  restore(versionDir);
  const files = walk(modsDir);
  const manifest = [];
  for (const rel of files) {
    if (rel.toLowerCase() === 'lisez-moi.txt') continue;
    const target = path.join(versionDir, rel);
    const backup = path.join(versionDir, BACKUP_DIR, rel);
    const hadOriginal = fs.existsSync(target);
    if (hadOriginal) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(target, backup);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(modsDir, rel), target);
    manifest.push({ rel, hadOriginal });
  }
  fs.writeFileSync(path.join(versionDir, MANIFEST), JSON.stringify(manifest));
  return manifest.length;
}

function ensureModsDir(modsDir) {
  fs.mkdirSync(modsDir, { recursive: true });
  const readme = path.join(modsDir, 'LISEZ-MOI.txt');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, [
      'Placez ici les fichiers à remplacer dans Roblox, avec la même arborescence que le dossier de version.',
      'Exemples :',
      '  content\\sounds\\ouch.ogg                                   -> son de mort',
      '  content\\textures\\Cursors\\KeyboardMouse\\ArrowCursor.png    -> curseur',
      '  content\\fonts\\...                                         -> polices',
      'Les fichiers sont appliqués à chaque lancement depuis BloxPlus et les originaux sont sauvegardés.',
    ].join('\r\n'));
  }
  return walk(modsDir).filter((f) => f.toLowerCase() !== 'lisez-moi.txt');
}

module.exports = { apply, restore, ensureModsDir };
