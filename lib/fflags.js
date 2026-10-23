// FastFlags : lecture / écriture de ClientSettings/ClientAppSettings.json.
const fs = require('fs');
const path = require('path');

// Flags que Roblox accepte encore en local (liste autorisée publiée en septembre 2025).
// Les autres flags sont écrits quand même mais Roblox risque de les ignorer.
const ALLOWLIST = [
  'DFIntCSGLevelOfDetailSwitchingDistance',
  'DFIntCSGLevelOfDetailSwitchingDistanceL12',
  'DFIntCSGLevelOfDetailSwitchingDistanceL23',
  'DFIntCSGLevelOfDetailSwitchingDistanceL34',
  'FFlagHandleAltEnterFullscreenManually',
  'DFFlagTextureQualityOverrideEnabled',
  'DFIntTextureQualityOverride',
  'FIntDebugForceMSAASamples',
  'DFFlagDisableDPIScale',
  'FFlagDebugGraphicsPreferD3D11',
  'FFlagDebugSkyGray',
  'DFFlagDebugPauseVoxelizer',
  'DFIntDebugFRMQualityLevelOverride',
  'FIntFRMMaxGrassDistance',
  'FIntFRMMinGrassDistance',
  'FFlagDebugGraphicsPreferVulkan',
  'FFlagDebugGraphicsPreferOpenGL',
  'FIntGrassMovementReducedMotionFactor',
];

// Réglages lisibles proposés dans l'éditeur (en plus de l'édition libre).
const PRESET_FLAGS = [
  { key: 'FIntDebugForceMSAASamples', label: 'Anticrénelage (MSAA)', type: 'select', options: [['', 'Auto'], ['0', 'Désactivé'], ['1', '1x'], ['2', '2x'], ['4', '4x'], ['8', '8x']] },
  { key: 'DFIntTextureQualityOverride', label: 'Qualité des textures', type: 'select', requires: { DFFlagTextureQualityOverrideEnabled: 'True' }, options: [['', 'Auto'], ['0', 'Très basse'], ['1', 'Basse'], ['2', 'Moyenne'], ['3', 'Haute']] },
  { key: 'DFIntDebugFRMQualityLevelOverride', label: 'Niveau de rendu forcé (1-21)', type: 'number', min: 1, max: 21 },
  { key: 'FIntFRMMaxGrassDistance', label: "Distance max de l'herbe", type: 'number', min: 0, max: 500 },
  { key: 'FIntFRMMinGrassDistance', label: "Distance min de l'herbe", type: 'number', min: 0, max: 500 },
  { key: 'DFIntCSGLevelOfDetailSwitchingDistance', label: 'Distance de détail des maillages', type: 'number', min: 0, max: 500 },
  { key: 'renderer', label: 'Moteur graphique', type: 'renderer' },
  { key: 'DFFlagDisableDPIScale', label: "Désactiver la mise à l'échelle DPI", type: 'bool' },
  { key: 'FFlagHandleAltEnterFullscreenManually', label: 'Alt+Entrée en plein écran exclusif', type: 'bool', invert: true },
  { key: 'FFlagDebugSkyGray', label: 'Ciel gris (gain de performance)', type: 'bool' },
  { key: 'DFFlagDebugPauseVoxelizer', label: "Mettre en pause le voxeliseur d'éclairage", type: 'bool' },
  { key: 'FIntGrassMovementReducedMotionFactor', label: "Mouvement de l'herbe (0 = figé)", type: 'number', min: 0, max: 100 },
];

function settingsFile(versionDir) {
  return path.join(versionDir, 'ClientSettings', 'ClientAppSettings.json');
}

function readFromVersion(versionDir) {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(versionDir), 'utf8'));
  } catch {
    return {};
  }
}

function writeToVersion(versionDir, flags) {
  const file = settingsFile(versionDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const clean = {};
  for (const [k, v] of Object.entries(flags)) {
    if (v === '' || v == null) continue;
    clean[k] = String(v);
  }
  fs.writeFileSync(file, JSON.stringify(clean, null, 2));
  return file;
}

module.exports = { ALLOWLIST, PRESET_FLAGS, readFromVersion, writeToVersion };
