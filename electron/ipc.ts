import { ipcMain, BrowserWindow, Menu, MenuItemConstructorOptions, IpcMainEvent } from 'electron';
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
  ipcMain.handle('pet:todayBySession', () => db.todayBySession(Date.now()));
  ipcMain.handle('pet:sessionDetailToday', (_e, sessionId: string) =>
    db.sessionDetailToday(sessionId, Date.now()));
  ipcMain.handle('pet:openMenu',    () => {
    Menu.buildFromTemplate(menuTemplate()).popup({ window: petWindow });
  });
  ipcMain.handle('pet:nudgeCondition', (_e, amount: number) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return;
    pet.nudgeCondition(Math.min(10, Math.max(0, n)));
  });

  const onSetBounds = (_e: IpcMainEvent, b: { x: number; y: number; w: number; h: number }) => {
    petWindow.setBounds({ x: b.x, y: b.y, width: b.w, height: b.h });
  };
  ipcMain.on('window:set-bounds', onSetBounds);

  const unsub = pet.on((e: PetEvent) => {
    for (const w of broadcastWindows()) {
      if (!w.isDestroyed()) w.webContents.send('pet:event', e);
    }
  });

  return () => {
    ipcMain.removeHandler('pet:getSnapshot');
    ipcMain.removeHandler('pet:getStats');
    ipcMain.removeHandler('pet:todayBySession');
    ipcMain.removeHandler('pet:sessionDetailToday');
    ipcMain.removeHandler('pet:openMenu');
    ipcMain.removeHandler('pet:nudgeCondition');
    ipcMain.off('window:set-bounds', onSetBounds);
    unsub();
  };
}
