import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('desktop', {
  getSettings:()=>ipcRenderer.invoke('settings:get'),saveSettings:(value:unknown)=>ipcRenderer.invoke('settings:save',value),clearSettings:()=>ipcRenderer.invoke('settings:clear'),
  host:()=>ipcRenderer.invoke('relay:start'),translate:(text:string)=>ipcRenderer.invoke('translate',text),send:(payload:unknown)=>ipcRenderer.invoke('queue:send',payload),
  microphone:()=>ipcRenderer.invoke('microphone'),saveBackup:(text:string)=>ipcRenderer.invoke('backup:save',text)
});
