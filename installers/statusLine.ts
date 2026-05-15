import fs from 'node:fs';
import path from 'node:path';

export interface InstallOpts {
  claudeHome: string;     // typically ~/.claude
  shimPath:   string;     // absolute path to statusline-shim.cjs
  port:       number;
  token:      string;
}

function settingsPath(claudeHome: string): string {
  return path.join(claudeHome, 'settings.json');
}

function readSettings(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function writeSettings(file: string, cfg: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, file);
}

export function installStatusLine(opts: InstallOpts): void {
  const file = settingsPath(opts.claudeHome);
  const cfg = readSettings(file);
  cfg.statusLine = {
    type: 'command',
    command: `node ${JSON.stringify(opts.shimPath)}`,
    env: {
      PET_PORT:  String(opts.port),
      PET_TOKEN: opts.token
    }
  };
  writeSettings(file, cfg);
}

export function uninstallStatusLine(claudeHome: string): void {
  const file = settingsPath(claudeHome);
  if (!fs.existsSync(file)) return;
  const cfg = readSettings(file);
  delete cfg.statusLine;
  writeSettings(file, cfg);
}
