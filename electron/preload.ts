import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pet', {
  subscribe: (cb: (e: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('pet:event', listener);
    return () => ipcRenderer.off('pet:event', listener);
  },
  getSnapshot: () => ipcRenderer.invoke('pet:getSnapshot'),
  getStats:    () => ipcRenderer.invoke('pet:getStats'),
  openMenu:    () => ipcRenderer.invoke('pet:openMenu')
});
