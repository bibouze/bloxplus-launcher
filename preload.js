// Pont sécurisé entre la page et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('bp', {
  info: invoke('app:info'),
  win: { minimize: invoke('win:minimize'), maximize: invoke('win:maximize'), close: invoke('win:close') },
  open: invoke('shell:open'),
  openPath: invoke('shell:openPath'),
  store: { get: invoke('store:get'), set: invoke('store:set') },
  api: invoke('api:request'),
  roblox: { launch: invoke('roblox:launch'), state: invoke('roblox:state') },
  fflags: { get: invoke('fflags:get'), set: invoke('fflags:set') },
  optimizer: {
    detect: invoke('optimizer:detect'),
    presets: invoke('optimizer:presets'),
    gameSettings: invoke('optimizer:gameSettings'),
    apply: invoke('optimizer:apply'),
    tweaks: invoke('optimizer:tweaks'),
    setTweak: invoke('optimizer:setTweak'),
    clean: invoke('optimizer:clean'),
  },
  mods: { list: invoke('mods:list'), open: invoke('mods:open'), restore: invoke('mods:restore') },
  shaders: { status: invoke('shaders:status'), presets: invoke('shaders:presets'), import: invoke('shaders:import'), set: invoke('shaders:set') },
  protocol: { get: invoke('protocol:get'), set: invoke('protocol:set') },
  playtime: invoke('playtime:get'),
  on: (channel, fn) => {
    if (!['tracker:event', 'win:state', 'overlay:update'].includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
