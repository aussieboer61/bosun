import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function listContainers() {
  return docker.listContainers({ all: true });
}

export function getContainer(id) {
  return docker.getContainer(id);
}

export async function inspectContainer(id) {
  const container = docker.getContainer(id);
  return container.inspect();
}

export async function startContainer(id) {
  const container = docker.getContainer(id);
  return container.start();
}

export async function stopContainer(id) {
  const container = docker.getContainer(id);
  return container.stop();
}

export async function restartContainer(id) {
  const container = docker.getContainer(id);
  return container.restart();
}

export async function removeContainer(id, opts = {}) {
  const container = docker.getContainer(id);
  return container.remove({ force: opts.force || false });
}

export async function getHostInfo() {
  return docker.info();
}

export async function pullImage(image, onProgress) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (err, output) => {
          if (err) return reject(err);
          resolve(output);
        },
        (event) => {
          if (onProgress) onProgress(event);
        }
      );
    });
  });
}

export async function getImageDigest(image) {
  try {
    const img = docker.getImage(image);
    const info = await img.inspect();
    return info.RepoDigests?.[0] || null;
  } catch {
    return null;
  }
}

export async function followLogs(id, onData, onEnd) {
  const container = docker.getContainer(id);
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: true,
    tail: 200
  });

  // Dockerode multiplexes stdout/stderr — demux the stream
  container.modem.demuxStream(
    stream,
    {
      write: (chunk) => onData(chunk.toString('utf8'))
    },
    {
      write: (chunk) => onData(chunk.toString('utf8'))
    }
  );

  stream.on('end', () => {
    if (onEnd) onEnd();
  });

  stream.on('error', (err) => {
    if (onData) onData(`[error] ${err.message}\n`);
  });

  // Return cleanup function
  return () => {
    try {
      stream.destroy();
    } catch {}
  };
}

export async function execCommand(id, cmd) {
  const container = docker.getContainer(id);
  const exec = await container.exec({
    Cmd: Array.isArray(cmd) ? cmd : ['/bin/sh', '-c', cmd],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true
  });
  return exec;
}

export async function getStats(id) {
  const container = docker.getContainer(id);
  return container.stats({ stream: false });
}

export { docker };
