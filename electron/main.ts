import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { createPetWindow } from './window';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  const devUrl = process.env.VITE_DEV_SERVER_URL ?? null;
  const indexHtml = path.join(__dirname, '../dist/index.html');
  mainWindow = createPetWindow({
    preloadPath: path.join(__dirname, 'preload.js'),
    rendererUrl: devUrl,
    rendererFile: devUrl ? null : indexHtml,
    pos: { x: 1500, y: 80 }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
