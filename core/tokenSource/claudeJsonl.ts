import fs from 'node:fs';
import path from 'node:path';
import chokidar, { FSWatcher } from 'chokidar';
import type { TokenSource } from './TokenSource';
import type { TokenEvent } from '../types';
import { parseClaudeJsonlLine } from './claudeJsonlParse';

/** Per-file read state (offset into the file in bytes). */
interface FileState {
  offset: number;
}

export class ClaudeJsonlSource implements TokenSource {
  readonly id = 'claude-jsonl';
  private watcher: FSWatcher | null = null;
  private state = new Map<string, FileState>();
  private emit: ((e: TokenEvent) => void) | null = null;

  constructor(private claudeHome: string) {}

  async start(emit: (e: TokenEvent) => void): Promise<void> {
    this.emit = emit;
    const projectsDir = path.join(this.claudeHome, 'projects');
    // chokidar v4+ removed glob support — watch the directory and filter in callbacks.
    this.watcher = chokidar.watch(projectsDir, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 50 }
    });
    this.watcher.on('add', f => {
      if (f.endsWith('.jsonl')) this.readNew(f);
    });
    this.watcher.on('change', f => {
      if (f.endsWith('.jsonl')) this.readNew(f);
    });
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.emit = null;
  }

  private readNew(file: string): void {
    if (!this.emit) return;
    let stat: fs.Stats;
    try { stat = fs.statSync(file); } catch { return; }
    const prev = this.state.get(file)?.offset ?? 0;
    if (stat.size < prev) {
      // truncate / rotate
      this.state.set(file, { offset: 0 });
      return this.readNew(file);
    }
    if (stat.size === prev) return;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(stat.size - prev);
      fs.readSync(fd, buf, 0, buf.length, prev);
      const text = buf.toString('utf8');
      const lines = text.split('\n');
      // last element may be partial line; only advance offset to before it
      const complete = lines.slice(0, -1);
      const trailingPartialBytes = Buffer.byteLength(lines[lines.length - 1], 'utf8');
      const newOffset = stat.size - trailingPartialBytes;
      for (const line of complete) {
        if (!line) continue;
        const ev = parseClaudeJsonlLine(line, file);
        if (ev) this.emit(ev);
      }
      this.state.set(file, { offset: newOffset });
    } finally {
      fs.closeSync(fd);
    }
  }
}
