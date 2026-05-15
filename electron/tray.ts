import { Tray, Menu, dialog, nativeImage } from 'electron';

export interface TrayCallbacks {
  onResetPet:   () => void;
  onWipeAll:    () => void;
  onShowStats:  () => void;
  onQuit:       () => void;
}

export function createTray(cb: TrayCallbacks): Tray {
  const icon = nativeImage.createFromNamedImage('NSImageNameMobileMe', [0, 0, 16, 16]);
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Token Eater Pet');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Stats',  click: cb.onShowStats },
    { type: 'separator' },
    { label: 'Reset Pet',   click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Reset pet?',
          detail: 'Pet state (XP, phase, condition) will reset. Event history kept.',
          buttons: ['Cancel', 'Reset'],
          defaultId: 0, cancelId: 0
        });
        if (choice === 1) cb.onResetPet();
      }
    },
    { label: 'Wipe Everything', click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Wipe everything?',
          detail: 'This deletes pet state AND event history.',
          buttons: ['Cancel', 'Wipe'],
          defaultId: 0, cancelId: 0
        });
        if (choice === 1) cb.onWipeAll();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: cb.onQuit }
  ]);
  tray.setContextMenu(menu);
  return tray;
}
