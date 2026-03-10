import { docker } from './dockerService.js';

export function createPtySession(containerId, socket) {
  let execStream = null;
  let execInstance = null;

  async function startExec() {
    const container = docker.getContainer(containerId);

    // Try /bin/sh first, fall back to /bin/bash
    const shells = ['/bin/sh', '/bin/bash'];
    let started = false;

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

        execStream = await execInstance.start({
          hijack: true,
          stdin: true,
          Tty: true
        });

        // Forward container output to socket
        execStream.on('data', (chunk) => {
          socket.emit('output', chunk.toString('binary'));
        });

        execStream.on('error', (err) => {
          socket.emit('output', `\r\n[Error: ${err.message}]\r\n`);
        });

        execStream.on('end', () => {
          socket.emit('output', '\r\n[Session ended]\r\n');
          socket.emit('exit');
        });

        started = true;
        socket.emit('output', `Connected to ${containerId} (${shell})\r\n`);
        break;
      } catch (err) {
        if (shell === shells[shells.length - 1]) {
          socket.emit('output', `\r\n[Failed to start shell: ${err.message}]\r\n`);
          socket.emit('exit');
        }
      }
    }

    return started;
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
      } catch (err) {
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

  // Start the exec session
  startExec().catch(err => {
    console.error('PTY session error:', err.message);
    socket.emit('output', `\r\n[Fatal error: ${err.message}]\r\n`);
  });
}
