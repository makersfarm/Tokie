import { BrowserWindow } from 'electron';

export interface StatsWindowOpts {
  preloadPath: string;
  rendererUrl: string | null;
  rendererFile: string | null;
}

export function createStatsWindow(opts: StatsWindowOpts): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 600,
    minWidth: 360,
    minHeight: 400,
    title: 'Tokie — Stats',
    backgroundColor: '#1c1c1f',
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const query = '?view=stats';
  if (opts.rendererUrl) win.loadURL(opts.rendererUrl + query);
  else if (opts.rendererFile) win.loadFile(opts.rendererFile, { search: 'view=stats' });
  return win;
}
