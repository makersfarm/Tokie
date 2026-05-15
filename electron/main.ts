import { app } from 'electron';
import path from 'node:path';
import { bootstrap } from './bootstrap';

// Preserve userData path across the v0.0 → v0.1 rename
// ("token-eater-pet" → "tokie"). New installs also adopt this path so the
// stable identity isn't tied to a future rename of the app display name.
app.setPath('userData', path.join(app.getPath('appData'), 'token-eater-pet'));

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
