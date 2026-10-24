// Compile native/gardien/Gardien.cs en gardien.exe avec le csc.exe fourni par Windows (.NET Framework 4).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = path.join(__dirname, '..', 'native', 'gardien');
const source = path.join(dir, 'Gardien.cs');
const output = path.join(dir, 'gardien.exe');

if (!fs.existsSync(source)) {
  console.log('[gardien] Gardien.cs absent : rien à compiler.');
  process.exit(0);
}
if (process.platform !== 'win32') {
  console.log('[gardien] Compilation ignorée hors Windows.');
  process.exit(0);
}

const csc = path.join(process.env.WINDIR || 'C:\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
if (!fs.existsSync(csc)) {
  console.error(`[gardien] csc.exe introuvable (${csc}). Le .NET Framework 4 fourni avec Windows est requis.`);
  process.exit(1);
}

const r = spawnSync(csc, ['/nologo', '/target:winexe', '/optimize+', `/out:${output}`, source], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('[gardien] Échec de la compilation.');
  process.exit(r.status || 1);
}
console.log(`[gardien] ${output} (${fs.statSync(output).size} octets)`);
