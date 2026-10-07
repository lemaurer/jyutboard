import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  updates: {
    get: () => ipcRenderer.invoke("updates:get"),
    check: () => ipcRenderer.invoke("updates:check"),
    enabled: (enabled: boolean) =>
      ipcRenderer.invoke("updates:enabled", enabled),
    install: () => ipcRenderer.invoke("updates:install"),
  },
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  vocabulary: () => ipcRenderer.invoke("board:vocabulary"),
  recognize: (image: string) => ipcRenderer.invoke("board:recognize", image),
  transcribe: (audio: string) => ipcRenderer.invoke("board:transcribe", audio),
  pair: (value: unknown) => ipcRenderer.invoke("board:pair", value),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (value: unknown) => ipcRenderer.invoke("settings:save", value),
  clearSettings: () => ipcRenderer.invoke("settings:clear"),
  host: () => ipcRenderer.invoke("relay:start"),
  hostRemote: () => ipcRenderer.invoke("remote:start"),
  stopRemote: () => ipcRenderer.invoke("remote:stop"),
  analyze: (text: string, language: string) =>
    ipcRenderer.invoke("board:analyze", text, language),
  translate: (text: string) => ipcRenderer.invoke("translate", text),
  send: (payload: unknown) => ipcRenderer.invoke("queue:send", payload),
  microphone: () => ipcRenderer.invoke("microphone"),
  saveBackup: (text: string) => ipcRenderer.invoke("backup:save", text),
});
