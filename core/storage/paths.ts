import path from 'node:path';

export interface StoragePaths {
  runtimeDir: string;
  petStateFile: string;
  eventsDbFile: string;
}

export function resolveStoragePaths(userDataDir: string): StoragePaths {
  return {
    runtimeDir: userDataDir,
    petStateFile: path.join(userDataDir, 'pet-state.json'),
    eventsDbFile: path.join(userDataDir, 'events.sqlite')
  };
}
