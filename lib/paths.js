// Emplacements de Roblox sur Windows.
const fs = require('fs');
const path = require('path');

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
const robloxRoot = path.join(localAppData, 'Roblox');

const versionRoots = [
  path.join(robloxRoot, 'Versions'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Roblox', 'Versions'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Roblox', 'Versions'),
];

// Dossier de version le plus récent qui contient RobloxPlayerBeta.exe.
function findPlayerVersionDir() {
  const candidates = [];
  for (const root of versionRoots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      const exe = path.join(dir, 'RobloxPlayerBeta.exe');
      try {
        const st = fs.statSync(exe);
        candidates.push({ dir, exe, mtime: st.mtimeMs, name: e.name });
      } catch { /* pas un dossier player */ }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0] || null;
}

module.exports = {
  robloxRoot,
  logsDir: path.join(robloxRoot, 'logs'),
  globalSettingsFile: path.join(robloxRoot, 'GlobalBasicSettings_13.xml'),
  findPlayerVersionDir,
};
