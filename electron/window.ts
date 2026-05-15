import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

export interface WindowOpts {
  preloadPath: string;
  rendererUrl: string | null;   // dev: http://localhost:PORT
  rendererFile: string | null;  // prod: built index.html
  pos: { x: number; y: number };
}

export function createPetWindow(opts: WindowOpts): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const safeX = Math.min(Math.max(0, opts.pos.x), display.workAreaSize.width  - 200);
  const safeY = Math.min(Math.max(0, opts.pos.y), display.workAreaSize.height - 200);

  const win = new BrowserWindow({
    width: 220,
    height: 220,
    x: safeX,
    y: safeY,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (opts.rendererUrl) win.loadURL(opts.rendererUrl);
  else if (opts.rendererFile) win.loadFile(opts.rendererFile);
  return win;
}
