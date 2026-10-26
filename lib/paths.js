// Emplacements de Roblox sur Windows.
const fs = require('fs');
const path = require('path');

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
const robloxRoot = path.join(localAppData, 'Roblox');

// Versions installées par BloxPlus lui-même (lib/installer.js) ; le launcher officiel garde son dossier.
const bloxplusVersions = path.join(localAppData, 'BloxPlus', 'Versions');

const versionRoots = [
  bloxplusVersions,
  path.join(robloxRoot, 'Versions'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Roblox', 'Versions'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Roblox', 'Versions'),
];

// Dossier de version qui contient RobloxPlayerBeta.exe : celui nommé `prefer` (la version courante de Roblox)
// s'il existe, sinon le plus récent. `managedByBloxPlus` = installé par BloxPlus.
function findPlayerVersionDir(prefer) {
  const candidates = [];
  for (const root of versionRoots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.endsWith('.partial')) continue; // .partial = installation inachevée
      const dir = path.join(root, e.name);
      const exe = path.join(dir, 'RobloxPlayerBeta.exe');
      try {
        const st = fs.statSync(exe);
        candidates.push({ dir, exe, mtime: st.mtimeMs, name: e.name, managedByBloxPlus: root === bloxplusVersions });
      } catch { /* pas un dossier player */ }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return (prefer && candidates.find((c) => c.name === prefer)) || candidates[0] || null;
}

module.exports = {
  robloxRoot,
  bloxplusVersions,
  versionRoots,
  logsDir: path.join(robloxRoot, 'logs'),
  globalSettingsFile: path.join(robloxRoot, 'GlobalBasicSettings_13.xml'),
  findPlayerVersionDir,
};
