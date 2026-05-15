import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { resolveStoragePaths } from '../core/storage/paths';
import { loadPetState, makeDebouncedSaver, makeDefaultSnapshot } from '../core/storage/petState';
import { EventsDb } from '../core/storage/eventsDb';
import { PetState } from '../core/pet/PetState';
import { FeedingPipeline } from '../core/feeding/FeedingPipeline';
import { SourceRegistry } from '../core/tokenSource/registry';
import { ClaudeStatusLineSource } from '../core/tokenSource/claudeStatusLine';
import { ClaudeJsonlSource } from '../core/tokenSource/claudeJsonl';
import { installStatusLine, uninstallStatusLine } from '../installers/statusLine';
import { wireIpc } from './ipc';
import { createTray, TrayCallbacks } from './tray';
import { createPetWindow } from './window';

export interface BootResult {
  window: BrowserWindow;
  shutdown: () => Promise<void>;
}

export async function bootstrap(): Promise<BootResult> {
  const userData    = app.getPath('userData');
  const paths       = resolveStoragePaths(userData);
  fs.mkdirSync(paths.runtimeDir, { recursive: true });

  const snap        = loadPetState(paths.petStateFile, () => Date.now());
  const pet         = new PetState(snap, { now: Date.now });
  const db          = new EventsDb(paths.eventsDbFile);
  const pipeline    = new FeedingPipeline(db, pet);

  const token       = crypto.randomBytes(16).toString('hex');
  const claudeHome  = path.join(os.homedir(), '.claude');
  const statusline  = new ClaudeStatusLineSource(token);
  const isFresh     = snap.lifetimeXP === 0 && Object.keys(snap.lastCursors).length === 0;
  const jsonlSrc    = new ClaudeJsonlSource(claudeHome, { skipExistingHistory: isFresh });
  const savedJsonlCursors = snap.lastCursors['claude-jsonl-files'] as any;
  if (savedJsonlCursors && typeof savedJsonlCursors === 'object') {
    jsonlSrc.loadCursors(savedJsonlCursors);
  }
  const registry    = new SourceRegistry([statusline, jsonlSrc]);

  await registry.start(e => pipeline.handle(e));

  installStatusLine({
    claudeHome,
    shimPath: path.resolve(__dirname, '../scripts/statusline-shim.cjs'),
    port: statusline.port,
    token
  });

  const saver = makeDebouncedSaver(paths.petStateFile, 500);
  pet.on(() => saver.schedule(pet.snapshot));

  // periodic decay tick
  const tickInterval = setInterval(() => pet.tick(), 60_000);
  pet.tick(); // catch-up on launch

  // every minute: persist JSONL cursors so we resume correctly on next launch
  const cursorInterval = setInterval(() => {
    const next = { ...pet.snapshot, lastCursors: {
      ...pet.snapshot.lastCursors,
      'claude-jsonl-files': jsonlSrc.exportCursors() as any
    } };
    pet.load(next);
  }, 60_000);

  const win = createPetWindow({
    preloadPath:  path.join(__dirname, 'preload.js'),
    rendererUrl:  process.env.VITE_DEV_SERVER_URL ?? null,
    rendererFile: process.env.VITE_DEV_SERVER_URL ? null
                    : path.join(__dirname, '../dist/index.html'),
    pos: snap.windowPos
  });
  const unwire = wireIpc(win, pet);

  // persist window position
  win.on('moved', () => {
    const pos = win.getPosition();
    const x = pos[0] ?? pet.snapshot.windowPos.x;
    const y = pos[1] ?? pet.snapshot.windowPos.y;
    pet.load({ ...pet.snapshot, windowPos: { x, y } });
  });

  const trayCb: TrayCallbacks = {
    onShowStats: () => win.show(),
    onResetPet:  () => {
      pet.load(makeDefaultSnapshot(Date.now()));
      // Re-snap JSONL offsets to current file sizes so existing history isn't replayed
      for (const [file] of Object.entries(jsonlSrc.exportCursors())) {
        try {
          const size = fs.statSync(file).size;
          jsonlSrc.loadCursors({ [file]: { lineOffset: size } });
        } catch { /* ignore */ }
      }
    },
    onWipeAll:   () => {
      pet.load(makeDefaultSnapshot(Date.now()));
      db.close();
      fs.rmSync(paths.eventsDbFile, { force: true });
    },
    onQuit: () => app.quit()
  };
  const tray = createTray(trayCb);

  return {
    window: win,
    shutdown: async () => {
      clearInterval(tickInterval);
      clearInterval(cursorInterval);
      unwire();
      tray.destroy();
      saver.flush();
      await registry.stop();
      db.close();
      uninstallStatusLine(claudeHome);
    }
  };
}
