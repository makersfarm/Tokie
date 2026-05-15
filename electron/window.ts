import { BrowserWindow, screen } from 'electron';

export interface WindowOpts {
  preloadPath: string;
  rendererUrl: string | null;   // dev: http://localhost:PORT
  rendererFile: string | null;  // prod: built index.html
  pos: { x: number; y: number };
  size: { w: number; h: number };
}

// MIN dropped to 60 so user can shrink the pet down to a tiny dot when they
// want it out of the way. Renderer hides badge/progress/readout below 100.
const MIN = 60;
const MAX = 600;

export function createPetWindow(opts: WindowOpts): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const w = Math.min(MAX, Math.max(MIN, opts.size.w));
  const h = Math.min(MAX, Math.max(MIN, opts.size.h));
  const safeX = Math.min(Math.max(0, opts.pos.x), display.workAreaSize.width  - w);
  const safeY = Math.min(Math.max(0, opts.pos.y), display.workAreaSize.height - h);

  const win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: MIN,
    minHeight: MIN,
    maxWidth: MAX,
    maxHeight: MAX,
    x: safeX,
    y: safeY,
    transparent: true,
    frame: false,
    resizable: true,
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
