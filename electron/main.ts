import { app } from 'electron';
import { bootstrap } from './bootstrap';

let shutdownFn: (() => Promise<void>) | null = null;

app.whenReady().then(async () => {
  const { shutdown } = await bootstrap();
  shutdownFn = shutdown;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  if (shutdownFn) {
    const fn = shutdownFn;
    shutdownFn = null;
    e.preventDefault();
    await fn();
    app.quit();
  }
});
