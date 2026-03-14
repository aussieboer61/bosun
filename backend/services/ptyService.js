import { docker } from './dockerService.js';

export function createPtySession(containerId, socket) {
  let execStream = null;
  let execInstance = null;

  async function startExec() {
    const container = docker.getContainer(containerId);

    // Try /bin/sh first, fall back to /bin/bash
    const shells = ['/bin/sh', '/bin/bash'];

    for (const shell of shells) {
      try {
        execInstance = await container.exec({
          Cmd: [shell],
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Env: ['TERM=xterm-256color']
        });

        // Hijacked TTY exec streams MUST use the callback form — the awaited
        // form resolves to an HTTP IncomingMessage, not the raw duplex socket.
        await new Promise((resolve, reject) => {
          execInstance.start({ hijack: true, stdin: true }, (err, stream) => {
            if (err) return reject(err);

            execStream = stream;

            // Forward raw container output to the browser terminal
            stream.on('data', (chunk) => {
              socket.emit('output', chunk);
            });

            stream.on('error', (err) => {
              socket.emit('output', `\r\n[Error: ${err.message}]\r\n`);
            });

            stream.on('end', () => {
              socket.emit('output', '\r\n[Session ended]\r\n');
              socket.emit('exit');
            });

            socket.emit('output', `Connected to ${containerId} (${shell})\r\n`);
            resolve();
          });
        });

        break;
      } catch (err) {
        if (shell === shells[shells.length - 1]) {
          socket.emit('output', `\r\n[Failed to start shell: ${err.message}]\r\n`);
          socket.emit('exit');
        }
      }
    }
  }

  // Handle input from terminal
  socket.on('input', (data) => {
    if (execStream && !execStream.destroyed) {
      try {
        execStream.write(data);
      } catch (err) {
        console.error('PTY write error:', err.message);
      }
    }
  });

  // Handle terminal resize
  socket.on('resize', async ({ cols, rows }) => {
    if (execInstance) {
      try {
        await execInstance.resize({ w: cols, h: rows });
      } catch {
        // Resize errors are non-fatal
      }
    }
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    if (execStream && !execStream.destroyed) {
      try {
        execStream.destroy();
      } catch {}
    }
    execStream = null;
    execInstance = null;
  });

  startExec().catch(err => {
    console.error('PTY session error:', err.message);
    socket.emit('output', `\r\n[Fatal error: ${err.message}]\r\n`);
  });
}
