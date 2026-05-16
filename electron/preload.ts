import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pet', {
  subscribe: (cb: (e: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('pet:event', listener);
    return () => ipcRenderer.off('pet:event', listener);
  },
  getSnapshot:        () => ipcRenderer.invoke('pet:getSnapshot'),
  getStats:           () => ipcRenderer.invoke('pet:getStats'),
  todayBySession:     () => ipcRenderer.invoke('pet:todayBySession'),
  sessionDetailToday: (sessionId: string) => ipcRenderer.invoke('pet:sessionDetailToday', sessionId),
  openMenu:           () => ipcRenderer.invoke('pet:openMenu'),
  nudgeCondition:     (amount: number) => ipcRenderer.invoke('pet:nudgeCondition', amount)
});
