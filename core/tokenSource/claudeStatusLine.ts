import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TokenSource } from './TokenSource';
import type { TokenEvent } from '../types';

interface StatusLinePayload {
  session_id?: string;
  transcript_path?: string;
  message_id?: string;
  request_id?: string;
  current_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: { id?: string };
  cost?: { total_cost_usd?: number };
}

export class ClaudeStatusLineSource implements TokenSource {
  readonly id = 'claude-statusline';
  private server: http.Server | null = null;
  private emit: ((e: TokenEvent) => void) | null = null;
  public port = 0;

  constructor(public readonly token: string) {}

  async start(emit: (e: TokenEvent) => void): Promise<void> {
    this.emit = emit;
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(0, '127.0.0.1', () => {
        this.port = (this.server!.address() as AddressInfo).port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>(r => this.server?.close(() => r()));
    this.server = null;
    this.emit = null;
    this.port = 0;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST' || req.url !== '/event') {
      res.statusCode = 404; return res.end();
    }
    if (req.headers['x-pet-token'] !== this.token) {
      res.statusCode = 401; return res.end();
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload: StatusLinePayload;
      try { payload = JSON.parse(body); }
      catch { res.statusCode = 400; return res.end(); }
      const u = payload.current_usage ?? {};
      const ev: TokenEvent = {
        sourceId: this.id,
        sessionId: payload.session_id ?? 'unknown',
        cursor: payload.transcript_path ?? '',
        ts: Date.now(),
        tokens: {
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheCreate: u.cache_creation_input_tokens ?? 0
        },
        model: payload.model?.id,
        costUsd: payload.cost?.total_cost_usd,
        dedupKey: { messageId: payload.message_id, requestId: payload.request_id }
      };
      this.emit?.(ev);
      res.statusCode = 204;
      res.end();
    });
  }
}
