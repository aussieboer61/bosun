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

  // Check whether the container was started with a TTY — TTY containers produce
  // a raw stream; non-TTY containers are multiplexed (stdout + stderr headers).
  const info = await container.inspect();
  const hasTty = info.Config?.Tty === true;

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: true,
    tail: 200
  });

  if (hasTty) {
    // Raw stream — data comes through as-is, no mux headers
    stream.on('data', (chunk) => onData(chunk.toString('utf8')));
  } else {
    // Multiplexed stream — demux into stdout/stderr
    docker.modem.demuxStream(
      stream,
      { write: (chunk) => onData(chunk.toString('utf8')) },
      { write: (chunk) => onData(chunk.toString('utf8')) }
    );
  }

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

export async function listImages() {
  return docker.listImages({ all: false });
}

export async function removeImage(id, opts = {}) {
  const image = docker.getImage(id);
  return image.remove({ force: opts.force || false });
}

export async function pruneImages() {
  return docker.pruneImages();
}

export async function listVolumes() {
  const result = await docker.listVolumes();
  return result.Volumes || [];
}

export async function removeVolume(name) {
  const volume = docker.getVolume(name);
  return volume.remove();
}

export async function pruneVolumes() {
  return docker.pruneVolumes();
}

export async function listNetworks() {
  return docker.listNetworks();
}

export async function createNetwork(name, driver = 'bridge', opts = {}) {
  return docker.createNetwork({ Name: name, Driver: driver, ...opts });
}

export async function removeNetwork(id) {
  const network = docker.getNetwork(id);
  return network.remove();
}

// Stream Docker events; returns a cleanup function
export function streamEvents(onEvent) {
  let stream = null;
  docker.getEvents({}, (err, s) => {
    if (err) return;
    stream = s;
    s.on('data', (chunk) => {
      try {
        onEvent(JSON.parse(chunk.toString('utf8')));
      } catch {}
    });
  });
  return () => {
    if (stream) try { stream.destroy(); } catch {}
  };
}

export { docker };
