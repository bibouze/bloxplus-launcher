// Shaders via ReShade, installés par BloxPlus lui-même (CONTRACTS §2.4).
// 1. Au premier allumage, BloxPlus télécharge ReShade (reshade.me, officiel) et les effets utilisés par les 5 styles
//    (ReShade.fxh : crosire/reshade-shaders ; SMAA, LumaSharpen, Vibrance… : SweetFX de CeeJay), puis les range dans
//    <userData>/reshade. La DLL est extraite de l'installateur de ReShade avec tar.exe, sans jamais l'exécuter.
// 2. À chaque lancement, BloxPlus copie ReShade + le préréglage choisi dans le dossier de version de Roblox
//    (donc aussi après une mise à jour de Roblox), ou retire ReShade si les shaders sont coupés.
const fs = require('fs');
const path = require('path');
const installer = require('./installer');

const RESHADE_FILES = ['dxgi.dll', 'ReShade.ini', 'ReShadePreset.ini'];
const SHADER_DIR = 'reshade-shaders';
const INFO_FILE = 'reshade.json';

const HOSTS = [/^reshade\.me$/, /^github\.com$/, /^codeload\.github\.com$/];
const URLS = {
  home: 'https://reshade.me/',
  setup: (v) => `https://reshade.me/downloads/ReShade_Setup_${v}.exe`,
  slim: 'https://github.com/crosire/reshade-shaders/archive/slim.zip',
  sweetfx: 'https://github.com/CeeJayDK/SweetFX/archive/master.zip',
};
const FALLBACK_VERSION = '6.8.0'; // utilisée si la page d'accueil de reshade.me n'indique pas la version
const MIN_DLL_BYTES = 500000;
// Effets exigés par les préréglages (presets/reshade/*.ini).
const REQUIRED_EFFECTS = ['SMAA', 'FakeHDR', 'LiftGammaGain', 'Tonemap', 'LumaSharpen', 'Curves', 'Technicolor2', 'Vibrance', 'Vignette'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const readInfo = (storeDir) => {
  try { return JSON.parse(fs.readFileSync(path.join(storeDir, INFO_FILE), 'utf8')); } catch { return null; }
};

const hasEffects = (root) => REQUIRED_EFFECTS.every((n) => fs.existsSync(path.join(root, SHADER_DIR, 'Shaders', 'SweetFX', `${n}.fx`)))
  && fs.existsSync(path.join(root, SHADER_DIR, 'Shaders', 'ReShade.fxh'));

// → { installed, enabled, preset, reshadeVersion }
function status(storeDir, cfg = {}) {
  return {
    installed: fs.existsSync(path.join(storeDir, 'dxgi.dll')) && hasEffects(storeDir),
    enabled: !!cfg.enabled,
    preset: cfg.preset || '1-naturel',
    reshadeVersion: readInfo(storeDir)?.reshadeVersion || null,
  };
}

// ReShade.ini de départ : dossiers d'effets de BloxPlus et pas de tutoriel au premier lancement.
function defaultIni() {
  return [
    '[GENERAL]',
    String.raw`EffectSearchPaths=.\reshade-shaders\Shaders\**`,
    String.raw`TextureSearchPaths=.\reshade-shaders\Textures\**`,
    String.raw`PresetPath=.\ReShadePreset.ini`,
    '',
    '[OVERLAY]',
    'TutorialProgress=4',
    '',
  ].join('\r\n');
}

/**
 * Télécharge ReShade et les shaders dans `storeDir`. Remplace une installation incomplète.
 * opts : { onProgress({phase, done, total, message?}), urls, hosts, allowLocalHttp } (urls/hosts/allowLocalHttp : essais)
 */
async function install(storeDir, opts = {}) {
  const urls = { ...URLS, ...opts.urls };
  const net = { hosts: opts.hosts || HOSTS, allowLocalHttp: opts.allowLocalHttp, timeoutMs: 60000 };
  const progress = (phase, done, total, message) => opts.onProgress?.({ phase, done, total, ...(message ? { message } : {}) });
  const tmp = `${storeDir}.partial`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, 'dl'), { recursive: true });
  try {
    // Version de ReShade annoncée sur la page d'accueil de reshade.me.
    let version = FALLBACK_VERSION;
    try {
      const m = (await installer.getText(urls.home, net)).match(/downloads\/ReShade_Setup_(\d+(?:\.\d+)+)\.exe/);
      if (m) version = m[1];
    } catch { /* on garde la version connue */ }

    // 3 téléchargements, suivis en pourcentage (300 = tout).
    const files = [['setup.exe', urls.setup(version)], ['slim.zip', urls.slim], ['sweetfx.zip', urls.sweetfx]];
    progress('download', 0, 300);
    let lastEmit = 0;
    for (let i = 0; i < files.length; i++) {
      const [name, url] = files[i];
      let got = 0;
      await installer.downloadTo(url, path.join(tmp, 'dl', name), (n, len) => {
        got += n;
        if (len && Date.now() - lastEmit > 150) { lastEmit = Date.now(); progress('download', i * 100 + Math.min(99, Math.round((got / len) * 100)), 300); }
      }, net);
      progress('download', (i + 1) * 100, 300);
    }

    progress('extract', 0, 3);
    const dllDir = path.join(tmp, 'dll');
    await installer.extract(path.join(tmp, 'dl', 'setup.exe'), dllDir, ['ReShade64.dll']);
    const dll = path.join(dllDir, 'ReShade64.dll');
    const head = fs.existsSync(dll) ? fs.readFileSync(dll).subarray(0, 2).toString('latin1') : '';
    if (head !== 'MZ' || fs.statSync(dll).size < MIN_DLL_BYTES) throw new Error("ReShade64.dll est introuvable dans l'installateur téléchargé.");
    progress('extract', 1, 3);

    const out = path.join(tmp, 'out');
    for (const [name, sub] of [['slim.zip', 'slim'], ['sweetfx.zip', 'sweetfx']]) {
      const dir = path.join(tmp, sub);
      await installer.extract(path.join(tmp, 'dl', name), dir);
      const top = fs.readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory()); // <depot>-<branche>/
      if (!top) throw new Error(`Archive ${name} vide.`);
      for (const part of ['Shaders', 'Textures']) {
        const src = path.join(dir, top.name, part);
        if (fs.existsSync(src)) copyDir(src, path.join(out, SHADER_DIR, part));
      }
      progress('extract', sub === 'slim' ? 2 : 3, 3);
    }
    fs.copyFileSync(dll, path.join(out, 'dxgi.dll'));
    fs.writeFileSync(path.join(out, 'ReShade.ini'), defaultIni());
    fs.writeFileSync(path.join(out, INFO_FILE), JSON.stringify({ reshadeVersion: version, installedAt: Date.now() }));
    if (!hasEffects(out)) throw new Error('Le paquet de shaders téléchargé est incomplet.');

    // Mise en place : les anciens fichiers de BloxPlus sont remplacés, rien d'autre n'est touché.
    fs.mkdirSync(storeDir, { recursive: true });
    for (const item of ['dxgi.dll', 'ReShade.ini', INFO_FILE, SHADER_DIR]) {
      fs.rmSync(path.join(storeDir, item), { recursive: true, force: true });
      fs.renameSync(path.join(out, item), path.join(storeDir, item));
    }
    progress('done', 3, 3);
    return status(storeDir, {});
  } catch (e) {
    progress('error', 0, 0, installer.friendly(e));
    throw Object.assign(new Error(installer.friendly(e)), { code: e.code });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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

module.exports = { status, install, apply, listPresets, defaultIni, REQUIRED_EFFECTS };
