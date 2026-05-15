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

export interface ClaudeJsonlOpts {
  /** If true, on first sighting of a file, jump offset to the current file size
   *  (i.e. don't replay existing history — only count appended lines). */
  skipExistingHistory?: boolean;
}

export class ClaudeJsonlSource implements TokenSource {
  readonly id = 'claude-jsonl';
  private watcher: FSWatcher | null = null;
  private state = new Map<string, FileState>();
  private emit: ((e: TokenEvent) => void) | null = null;
  private skipExistingHistory: boolean;

  constructor(private claudeHome: string, opts: ClaudeJsonlOpts = {}) {
    this.skipExistingHistory = opts.skipExistingHistory ?? false;
  }

  /** Apply persisted offsets from a prior run. */
  loadCursors(cursors: Record<string, { lineOffset?: number }>): void {
    for (const [file, c] of Object.entries(cursors)) {
      if (typeof c.lineOffset === 'number') this.state.set(file, { offset: c.lineOffset });
    }
  }

  /** Returns current offsets to be persisted. */
  exportCursors(): Record<string, { file: string; lineOffset: number }> {
    const out: Record<string, { file: string; lineOffset: number }> = {};
    for (const [file, s] of this.state) out[file] = { file, lineOffset: s.offset };
    return out;
  }

  async start(emit: (e: TokenEvent) => void): Promise<void> {
    this.emit = emit;
    const projectsDir = path.join(this.claudeHome, 'projects');
    // chokidar v4+ removed glob support — watch the directory and filter in callbacks.
    this.watcher = chokidar.watch(projectsDir, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 50 }
    });
    this.watcher.on('add', f => this.onFile(f, /*firstSighting*/ true));
    this.watcher.on('change', f => this.onFile(f, /*firstSighting*/ false));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.emit = null;
  }

  private onFile(file: string, firstSighting: boolean): void {
    if (!file.endsWith('.jsonl')) return;
    if (firstSighting && this.skipExistingHistory && !this.state.has(file)) {
      // Mark this file as seen at its current size — future appends only.
      let stat: fs.Stats;
      try { stat = fs.statSync(file); } catch { return; }
      this.state.set(file, { offset: stat.size });
      return;
    }
    this.readNew(file);
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

    const CHUNK = 1 << 20; // 1MB
    const fd = fs.openSync(file, 'r');
    try {
      let offset = prev;
      let leftover = '';
      while (offset < stat.size) {
        const remaining = stat.size - offset;
        const buf = Buffer.alloc(Math.min(CHUNK, remaining));
        fs.readSync(fd, buf, 0, buf.length, offset);
        const chunk = leftover + buf.toString('utf8');
        const lines = chunk.split('\n');
        leftover = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          const ev = parseClaudeJsonlLine(line, file);
          if (ev) this.emit(ev);
        }
        offset += buf.length;
      }
      const trailingBytes = Buffer.byteLength(leftover, 'utf8');
      this.state.set(file, { offset: stat.size - trailingBytes });
    } finally {
      fs.closeSync(fd);
    }
  }
}
