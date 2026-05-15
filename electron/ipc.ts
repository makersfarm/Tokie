import { ipcMain, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import type { PetState } from '../core/pet/PetState';
import type { PetEvent } from '../core/types';
import type { EventsDb } from '../core/storage/eventsDb';

export interface IpcDeps {
  pet: PetState;
  db: EventsDb;
  menuTemplate: () => MenuItemConstructorOptions[];
  /** Window receiving the popup menu (the pet window). */
  petWindow: BrowserWindow;
  /** All windows that should receive pet:event broadcasts. */
  broadcastWindows: () => BrowserWindow[];
}

export function wireIpc(deps: IpcDeps): () => void {
  const { pet, db, menuTemplate, petWindow, broadcastWindows } = deps;

  ipcMain.handle('pet:getSnapshot', () => pet.snapshot);
  ipcMain.handle('pet:getStats',    () => db.stats(Date.now()));
  ipcMain.handle('pet:openMenu',    () => {
    Menu.buildFromTemplate(menuTemplate()).popup({ window: petWindow });
  });

  const unsub = pet.on((e: PetEvent) => {
    for (const w of broadcastWindows()) {
      if (!w.isDestroyed()) w.webContents.send('pet:event', e);
    }
  });

  return () => {
    ipcMain.removeHandler('pet:getSnapshot');
    ipcMain.removeHandler('pet:getStats');
    ipcMain.removeHandler('pet:openMenu');
    unsub();
  };
}
