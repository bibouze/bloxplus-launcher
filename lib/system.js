// Petits utilitaires Windows : PowerShell, registre, processus.
const { execFile, spawn } = require('child_process');

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), err });
    });
  });
}

function powershell(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
}

async function regAdd(key, name, value, type = 'REG_SZ') {
  const args = ['add', key, '/f', '/t', type, '/d', value];
  if (name == null) args.splice(2, 0, '/ve'); else args.splice(2, 0, '/v', name);
  return run('reg.exe', args);
}

async function regDelete(key, name) {
  const args = ['delete', key, '/f'];
  if (name != null) args.splice(2, 0, '/v', name);
  return run('reg.exe', args);
}

async function regQuery(key, name) {
  const args = ['query', key];
  if (name == null) args.push('/ve'); else args.push('/v', name);
  const r = await run('reg.exe', args);
  if (!r.ok) return null;
  const line = r.stdout.split(/\r?\n/).find((l) => /REG_\w+/.test(l));
  if (!line) return null;
  return line.replace(/^\s*\S.*?\s+REG_\w+\s+/, '').trim();
}

// Liste des PID d'un exécutable.
async function pidsOf(imageName) {
  const r = await run('tasklist.exe', ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH']);
  return r.stdout.split(/\r?\n/)
    .map((l) => l.split('","'))
    .filter((c) => c.length > 1 && c[0].replace(/"/g, '').toLowerCase() === imageName.toLowerCase())
    .map((c) => Number(c[1].replace(/"/g, '')));
}

function spawnDetached(file, args, opts = {}) {
  const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false, ...opts });
  child.unref();
  return child;
}

module.exports = { run, powershell, regAdd, regDelete, regQuery, pidsOf, spawnDetached };
