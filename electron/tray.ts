import { Tray, Menu, MenuItemConstructorOptions, dialog, nativeImage } from 'electron';

export interface TrayCallbacks {
  onResetPet:   () => void;
  onWipeAll:    () => void;
  onShowStats:  () => void;
  onQuit:       () => void;
}

export function buildMenuTemplate(cb: TrayCallbacks): MenuItemConstructorOptions[] {
  return [
    { label: 'Show Stats', click: cb.onShowStats },
    { type: 'separator' },
    {
      label: 'Reset Pet',
      click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Reset pet?',
          detail: 'Pet state (XP, phase, condition) will reset. Event history kept.',
          buttons: ['Cancel', 'Reset'],
          defaultId: 0,
          cancelId: 0
        });
        if (choice === 1) cb.onResetPet();
      }
    },
    {
      label: 'Wipe Everything',
      click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Wipe everything?',
          detail: 'This deletes pet state AND event history.',
          buttons: ['Cancel', 'Wipe'],
          defaultId: 0,
          cancelId: 0
        });
        if (choice === 1) cb.onWipeAll();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: cb.onQuit }
  ];
}

function makeIcon(): Electron.NativeImage {
  // 16x16 colored chick icon — the size macOS expects for a status item.
  // Earlier 22x22 was silently refused by macOS (Electron core maintainer
  // codebytere: "macOS tray won't resize images with incorrect dimensions"
  // — electron/electron#45231). No log, no error, just empty slot.
  const W = 16, H = 16;
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dx = (x - 10.5) / 9;
      const dy = (y - 12) / 9;
      const d  = dx * dx + dy * dy;
      const inBody    = d <= 1;
      const onOutline = d > 0.78 && d <= 1;
      const eye1 = (x - 7) ** 2 + (y - 10) ** 2 <= 2;
      const eye2 = (x - 14) ** 2 + (y - 10) ** 2 <= 2;
      const beak = y >= 13 && y <= 16 && Math.abs(x - 10.5) <= (y - 12);
      let r = 0, g = 0, b = 0, a = 0;
      if (inBody) {
        if (eye1 || eye2)   { r = 30;  g = 30;  b = 30;  a = 255; }
        else if (beak)      { r = 245; g = 160; b = 40;  a = 255; }
        else if (onOutline) { r = 90;  g = 60;  b = 0;   a = 255; }
        else                { r = 255; g = 215; b = 70;  a = 255; }
      }
      // BGRA order for nativeImage.createFromBitmap
      buf[i]     = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = a;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: W, height: H });
}

export function createTray(cb: TrayCallbacks): Tray {
  const tray = new Tray(makeIcon());
  tray.setToolTip('Tokie');
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(cb)));
  return tray;
}
