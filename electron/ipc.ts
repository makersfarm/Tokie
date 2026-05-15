import { ipcMain, BrowserWindow } from 'electron';
import type { PetState } from '../core/pet/PetState';
import type { PetEvent } from '../core/types';

export function wireIpc(win: BrowserWindow, pet: PetState): () => void {
  const handleGet = () => pet.snapshot;
  ipcMain.handle('pet:getSnapshot', handleGet);

  const unsub = pet.on((e: PetEvent) => {
    if (!win.isDestroyed()) win.webContents.send('pet:event', e);
  });

  return () => {
    ipcMain.removeHandler('pet:getSnapshot');
    unsub();
  };
}
