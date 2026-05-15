import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installStatusLine, uninstallStatusLine } from './statusLine';

describe('installStatusLine', () => {
  let claudeHome: string, settings: string;

  beforeEach(() => {
    claudeHome = mkdtempSync(path.join(tmpdir(), 'claude-'));
    settings = path.join(claudeHome, 'settings.json');
  });

  it('creates settings.json when missing', () => {
    installStatusLine({
      claudeHome,
      shimPath: '/abs/shim.cjs',
      port: 12345,
      token: 't1'
    });
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.statusLine.type).toBe('command');
    expect(cfg.statusLine.command).toContain('shim.cjs');
    expect(cfg.statusLine.env.PET_PORT).toBe('12345');
    expect(cfg.statusLine.env.PET_TOKEN).toBe('t1');
  });

  it('merges into existing settings.json without clobbering other keys', () => {
    writeFileSync(settings, JSON.stringify({ theme: 'dark', model: 'opus' }));
    installStatusLine({ claudeHome, shimPath: '/x.cjs', port: 1, token: 't' });
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.theme).toBe('dark');
    expect(cfg.model).toBe('opus');
    expect(cfg.statusLine).toBeDefined();
  });

  it('uninstall removes only the statusLine key', () => {
    writeFileSync(settings, JSON.stringify({ theme: 'dark', statusLine: { type: 'command' } }));
    uninstallStatusLine(claudeHome);
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.statusLine).toBeUndefined();
    expect(cfg.theme).toBe('dark');
  });

  it('uninstall is a no-op when settings missing', () => {
    expect(() => uninstallStatusLine(claudeHome)).not.toThrow();
    expect(existsSync(settings)).toBe(false);
  });
});
