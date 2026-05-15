#!/usr/bin/env node
// Token-eater-pet statusLine shim.
// Claude Code invokes this on every assistant turn and pipes a JSON payload via stdin.
// We forward it to the local pet daemon (best-effort, 1s timeout, never block Claude).

const http = require('node:http');

const PORT  = process.env.PET_PORT  || '';
const TOKEN = process.env.PET_TOKEN || '';

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { stdin += c; });
process.stdin.on('end', () => {
  // Always print SOMETHING short to stdout so statusLine is not broken
  process.stdout.write('🐾');
  if (!PORT || !TOKEN || !stdin) return process.exit(0);

  const req = http.request({
    method: 'POST',
    host: '127.0.0.1',
    port: Number(PORT),
    path: '/event',
    headers: {
      'content-type': 'application/json',
      'x-pet-token':  TOKEN,
      'content-length': Buffer.byteLength(stdin)
    },
    timeout: 1000
  }, res => { res.resume(); });
  req.on('error', () => {});       // pet not running — fine
  req.on('timeout', () => req.destroy());
  req.write(stdin);
  req.end();
});
