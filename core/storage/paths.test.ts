import { describe, it, expect } from 'vitest';
import { resolveStoragePaths } from './paths';

describe('resolveStoragePaths', () => {
  it('returns petStateFile and eventsDbFile under given dir', () => {
    const p = resolveStoragePaths('/tmp/pet');
    expect(p.petStateFile).toBe('/tmp/pet/pet-state.json');
    expect(p.eventsDbFile).toBe('/tmp/pet/events.sqlite');
    expect(p.runtimeDir).toBe('/tmp/pet');
  });
});
