import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, WebSocketClient } from 'vite';

// Available only in loopback development mode, never shipped to phones or production.
export function hapticBridge(): Plugin {
  return {
    name: 'touchmap-local-haptics',
    apply: 'serve',
    async configureServer(server) {
      let worker: ChildProcessWithoutNullStreams | undefined;
      let owner: WebSocketClient | undefined;
      let phase = 'compiling';
      let closed = false;
      const status = (client?: WebSocketClient) => {
        if (client) client.send('haptic:status', { phase });
        else server.ws.send('haptic:status', { phase });
      };
      const write = (action: string, id = 0, mode = 'idle') => {
        if (worker?.stdin.writable) worker.stdin.write(JSON.stringify({ action, id, mode }) + '\n');
      };
      server.ws.on('haptic:command', (message, client) => {
        if (!message || !['status', 'state', 'keepalive', 'stop'].includes(message.action)) return;
        if (message.action === 'status') { status(client); return; }
        if (phase !== 'ready') { status(client); return; }
        if (message.action === 'state') {
          if (owner && owner !== client) { client.send('haptic:status', { phase: 'busy' }); return; }
          owner = client;
        }
        if (client !== owner) return;
        write(message.action, Number.isSafeInteger(message.id) ? message.id : 0, ['idle', 'startup', 'building', 'other', 'park', 'lawn', 'park-path'].includes(message.mode) ? message.mode : 'idle');
      });
      server.ws.on('connection', client => {
        client.on('close', () => {
          if (client === owner?.socket) { write('stop'); owner = undefined; }
        });
      });
      if (process.platform !== 'darwin') { phase = 'unsupported'; return; }
      const directory = await mkdtemp(join(tmpdir(), 'touchmap-haptics-'));
      const compiler = spawn('/usr/bin/xcrun', ['swiftc', '-module-cache-path', join(directory, 'cache'),
        join(server.config.root, 'native/Haptics.swift'), '-o', join(directory, 'haptics')]);
      const fail = () => { if (!closed) { phase = 'unavailable'; status(); } };
      compiler.on('error', fail);
      compiler.stderr.on('data', data => server.config.logger.error(String(data)));
      compiler.on('exit', code => {
        if (closed) return;
        if (code !== 0) { fail(); return; }
        worker = spawn(join(directory, 'haptics'));
        worker.on('error', fail);
        worker.stdin.on('error', fail);
        worker.on('exit', fail);
        let buffer = '';
        worker.stdout.on('data', chunk => {
          buffer += String(chunk);
          while (buffer.includes('\n')) {
            const end = buffer.indexOf('\n');
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            try {
              const response = JSON.parse(line);
              if (response.event === 'ready') { phase = 'ready'; status(); }
              else {
                owner?.send('haptic:ack', response);
                if (response.event === 'stopped') owner = undefined;
              }
            } catch { /* Ignore non-protocol output. */ }
          }
        });
      });
      server.httpServer?.once('close', () => {
        closed = true; compiler.kill(); worker?.kill();
        void rm(directory, { recursive: true, force: true });
      });
    },
  };
}
