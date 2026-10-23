// Optimisation : détection du matériel, score du PC et niveaux de réglages prêts à l'emploi.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { powershell, regAdd, regDelete, regQuery } = require('./system');
const { robloxRoot } = require('./paths');

async function detectHardware() {
  const script = `
$ErrorActionPreference='SilentlyContinue'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpus = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic Display|Remote|Virtual|Parsec|Meta' }
$vram = @{}
Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}' | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  if ($p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { $vram[$p.DriverDesc] = [int64]$p.'HardwareInformation.qwMemorySize' }
}
$out = [ordered]@{
  cpu = $cpu.Name.Trim(); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors; mhz = $cpu.MaxClockSpeed
  ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
  gpus = @($gpus | ForEach-Object { [ordered]@{ name = $_.Name; vram = $(if ($vram[$_.Name]) { $vram[$_.Name] } else { [int64]$_.AdapterRAM }); refresh = $_.CurrentRefreshRate; width = $_.CurrentHorizontalResolution; height = $_.CurrentVerticalResolution } })
}
$out | ConvertTo-Json -Depth 4 -Compress`;
  const r = await powershell(script);
  let hw;
  try { hw = JSON.parse(r.stdout.trim()); } catch {
    hw = { cpu: os.cpus()[0]?.model || 'Inconnu', cores: os.cpus().length / 2, threads: os.cpus().length, mhz: os.cpus()[0]?.speed, ram: os.totalmem(), gpus: [] };
  }
  hw.gpus = (Array.isArray(hw.gpus) ? hw.gpus : [hw.gpus]).filter(Boolean);
  // Le GPU principal = celui qui a le plus de VRAM (le dédié sur un portable).
  hw.gpu = [...hw.gpus].sort((a, b) => (b.vram || 0) - (a.vram || 0))[0] || { name: 'Inconnu', vram: 0 };
  hw.score = score(hw);
  hw.recommended = recommend(hw.score);
  return hw;
}

// Estimation grossière de la puissance du GPU à partir de son nom (0 à 100).
function gpuScore(name = '') {
  const n = name.toLowerCase();
  const rules = [
    [/rtx\s*50[89]0|rtx\s*4090|rx\s*9070|rx\s*7900/, 100],
    [/rtx\s*50[67]0|rtx\s*40[78]0|rtx\s*3090|rtx\s*3080|rx\s*7800|rx\s*6950|rx\s*6900|rx\s*6800/, 90],
    [/rtx\s*4060|rtx\s*3070|rtx\s*3060|rtx\s*2080|rx\s*7700|rx\s*7600|rx\s*6700|rx\s*6650|rx\s*6600|arc\s*b5|arc\s*a7/, 78],
    [/rtx\s*3050|rtx\s*2070|rtx\s*2060|gtx\s*1080|gtx\s*1660|rx\s*5700|rx\s*5600|rx\s*6500|arc\s*a5|radeon\s*8[0-9]0m|radeon\s*780m/, 62],
    [/gtx\s*1070|gtx\s*1650|gtx\s*1060|rx\s*5500|rx\s*590|rx\s*580|rx\s*570|radeon\s*7[0-9]0m|arc\s*a3/, 48],
    [/gtx\s*1050|gtx\s*9[5-8]0|rx\s*560|rx\s*550|rx\s*470|iris\s*xe|radeon\s*(graphics|vega\s*(8|10|11))|arc(?!\s*[ab])/, 32],
    [/gtx\s*7|gt\s*\d|mx\s*\d|uhd|hd\s*graphics|vega\s*[3-7]|radeon\s*r[5-7]/, 16],
  ];
  for (const [re, s] of rules) if (re.test(n)) return s;
  return /nvidia|geforce|radeon\s*rx/.test(n) ? 50 : 25;
}

function score(hw) {
  const gpu = gpuScore(hw.gpu?.name);
  const vramGb = (hw.gpu?.vram || 0) / 1024 ** 3;
  const ramGb = (hw.ram || 0) / 1024 ** 3;
  const vram = Math.min(vramGb / 8, 1) * 100;
  const ram = Math.min(ramGb / 16, 1) * 100;
  const cpu = Math.min(((hw.threads || 4) / 12) * 60 + ((hw.mhz || 2500) / 4000) * 40, 100);
  return Math.round(gpu * 0.55 + vram * 0.15 + cpu * 0.18 + ram * 0.12);
}

function recommend(s) {
  if (s >= 80) return 'ultra';
  if (s >= 55) return 'quality';
  if (s >= 35) return 'balanced';
  return 'performance';
}

// Niveaux d'optimisation : réglages Roblox (XML) + FastFlags autorisés.
const PRESETS = {
  performance: {
    name: 'Performance max',
    desc: 'FPS au maximum, graphismes minimum. Pour les petits PC et la compétition.',
    beauty: 1, fluidity: 4,
    settings: { SavedQualityLevel: 1, GraphicsQualityLevel: 1, MaxQualityEnabled: false },
    flags: {
      FIntDebugForceMSAASamples: '0',
      DFFlagTextureQualityOverrideEnabled: 'True',
      DFIntTextureQualityOverride: '0',
      DFIntDebugFRMQualityLevelOverride: '1',
      FIntFRMMaxGrassDistance: '0',
      FIntFRMMinGrassDistance: '0',
      FIntGrassMovementReducedMotionFactor: '0',
      DFIntCSGLevelOfDetailSwitchingDistance: '0',
      DFIntCSGLevelOfDetailSwitchingDistanceL12: '0',
      DFIntCSGLevelOfDetailSwitchingDistanceL23: '0',
      DFIntCSGLevelOfDetailSwitchingDistanceL34: '0',
      FFlagDebugSkyGray: 'True',
      DFFlagDisableDPIScale: 'True',
    },
  },
  balanced: {
    name: 'Équilibré',
    desc: 'Bon compromis entre fluidité et rendu. Idéal pour la plupart des PC.',
    beauty: 2, fluidity: 3,
    settings: { SavedQualityLevel: 5, GraphicsQualityLevel: 10, MaxQualityEnabled: false },
    flags: {
      FIntDebugForceMSAASamples: '1',
      DFFlagTextureQualityOverrideEnabled: 'True',
      DFIntTextureQualityOverride: '2',
      DFIntDebugFRMQualityLevelOverride: '10',
      FIntFRMMaxGrassDistance: '100',
      FIntFRMMinGrassDistance: '50',
      DFFlagDisableDPIScale: 'True',
    },
  },
  quality: {
    name: 'Qualité',
    desc: 'Rendu soigné avec anticrénelage. Pour les PC de jeu milieu de gamme.',
    beauty: 3, fluidity: 2,
    settings: { SavedQualityLevel: 8, GraphicsQualityLevel: 16, MaxQualityEnabled: false },
    flags: {
      FIntDebugForceMSAASamples: '4',
      DFFlagTextureQualityOverrideEnabled: 'True',
      DFIntTextureQualityOverride: '3',
      DFIntDebugFRMQualityLevelOverride: '16',
      FIntFRMMaxGrassDistance: '250',
      FIntFRMMinGrassDistance: '120',
    },
  },
  ultra: {
    name: 'Beauté ultra',
    desc: 'Tout au maximum : textures, ombres, herbe, MSAA 8x. Pour les PC puissants.',
    beauty: 4, fluidity: 1,
    settings: { SavedQualityLevel: 10, GraphicsQualityLevel: 21, MaxQualityEnabled: true },
    flags: {
      FIntDebugForceMSAASamples: '8',
      DFFlagTextureQualityOverrideEnabled: 'True',
      DFIntTextureQualityOverride: '3',
      DFIntDebugFRMQualityLevelOverride: '21',
      FIntFRMMaxGrassDistance: '500',
      FIntFRMMinGrassDistance: '250',
      DFIntCSGLevelOfDetailSwitchingDistance: '500',
      DFIntCSGLevelOfDetailSwitchingDistanceL12: '500',
      DFIntCSGLevelOfDetailSwitchingDistanceL23: '500',
      DFIntCSGLevelOfDetailSwitchingDistanceL34: '500',
    },
  },
};

// Flags gérés par les niveaux (retirés avant d'appliquer un autre niveau).
const PRESET_KEYS = [...new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p.flags)))];

function framerateFor(presetId, hw) {
  const refresh = hw?.gpu?.refresh || 60;
  if (presetId === 'performance') return Math.max(240, refresh);
  if (presetId === 'ultra') return Math.max(60, Math.min(refresh, 144));
  return Math.max(60, refresh);
}

// ---- Réglages Windows (facultatifs) ----
const GPU_PREF_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
const LAYERS_KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';

async function setHighPerformanceGpu(exe, on) {
  return on ? regAdd(GPU_PREF_KEY, exe, 'GpuPreference=2;') : regDelete(GPU_PREF_KEY, exe);
}

async function setFullscreenOptimizationsDisabled(exe, on) {
  return on ? regAdd(LAYERS_KEY, exe, '~ DISABLEDXMAXIMIZEDWINDOWEDMODE') : regDelete(LAYERS_KEY, exe);
}

async function windowsTweakState(exe) {
  return {
    gpu: (await regQuery(GPU_PREF_KEY, exe)) === 'GpuPreference=2;',
    fso: !!(await regQuery(LAYERS_KEY, exe)),
  };
}

// Nettoie les fichiers temporaires et les vieux logs de Roblox (jamais la base locale rbx-storage).
function cleanCache() {
  let freed = 0;
  const rm = (p) => {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const f of fs.readdirSync(p)) rm(path.join(p, f));
        fs.rmdirSync(p);
      } else {
        fs.rmSync(p);
        freed += st.size;
      }
    } catch { /* en cours d'utilisation */ }
  };
  const tmp = path.join(os.tmpdir(), 'Roblox');
  if (fs.existsSync(tmp)) rm(tmp);
  const logs = path.join(robloxRoot, 'logs');
  const weekAgo = Date.now() - 7 * 86400000;
  try {
    for (const f of fs.readdirSync(logs)) {
      const p = path.join(logs, f);
      try { if (fs.statSync(p).mtimeMs < weekAgo) rm(p); } catch { /* ignoré */ }
    }
  } catch { /* pas de logs */ }
  const downloads = path.join(robloxRoot, 'Downloads');
  if (fs.existsSync(downloads)) for (const f of fs.readdirSync(downloads)) rm(path.join(downloads, f));
  return freed;
}

module.exports = {
  detectHardware, PRESETS, PRESET_KEYS, framerateFor, gpuScore,
  setHighPerformanceGpu, setFullscreenOptimizationsDisabled, windowsTweakState, cleanCache,
};
