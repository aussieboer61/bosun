import { getImageDigest } from './dockerService.js';

// Parse image string into { registry, org, name, tag }
function parseImage(image) {
  let registry = '';
  let ref = image;

  // Check for explicit registry (contains dot or colon before first slash)
  const firstSlash = image.indexOf('/');
  if (firstSlash !== -1) {
    const potentialRegistry = image.slice(0, firstSlash);
    if (potentialRegistry.includes('.') || potentialRegistry.includes(':') || potentialRegistry === 'localhost') {
      registry = potentialRegistry;
      ref = image.slice(firstSlash + 1);
    }
  }

  // Split tag
  let name = ref;
  let tag = 'latest';
  const atIdx = ref.lastIndexOf('@');
  if (atIdx !== -1) {
    name = ref.slice(0, atIdx);
    tag = ref.slice(atIdx + 1);
  } else {
    const colonIdx = ref.lastIndexOf(':');
    if (colonIdx !== -1 && !ref.slice(colonIdx + 1).includes('/')) {
      name = ref.slice(0, colonIdx);
      tag = ref.slice(colonIdx + 1);
    }
  }

  // Split org/name for Docker Hub
  let org = 'library';
  let imgName = name;
  const slashIdx = name.indexOf('/');
  if (slashIdx !== -1) {
    org = name.slice(0, slashIdx);
    imgName = name.slice(slashIdx + 1);
  }

  return { registry, org, name: imgName, tag, fullName: name };
}

async function fetchDockerHubDigest(org, name, tag) {
  // First get a token
  const tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${org}/${name}:pull`;
  const tokenRes = await fetch(tokenUrl, { signal: AbortSignal.timeout(10000) });
  if (!tokenRes.ok) throw new Error(`Token fetch failed: ${tokenRes.status}`);
  const { token } = await tokenRes.json();

  // Fetch manifest to get digest
  const manifestUrl = `https://registry-1.docker.io/v2/${org}/${name}/manifests/${tag}`;
  const manifestRes = await fetch(manifestUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: [
        'application/vnd.docker.distribution.manifest.v2+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.oci.image.manifest.v1+json',
        'application/vnd.oci.image.index.v1+json'
      ].join(',')
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!manifestRes.ok) throw new Error(`Manifest fetch failed: ${manifestRes.status}`);
  const digest = manifestRes.headers.get('docker-content-digest');
  return digest;
}

async function fetchGenericRegistryDigest(registry, org, name, tag) {
  const base = registry.startsWith('http') ? registry : `https://${registry}`;
  const path = org !== 'library' ? `${org}/${name}` : name;
  const url = `${base}/v2/${path}/manifests/${tag}`;

  const res = await fetch(url, {
    headers: {
      Accept: [
        'application/vnd.docker.distribution.manifest.v2+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.oci.image.manifest.v1+json'
      ].join(',')
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
  return res.headers.get('docker-content-digest');
}

export async function checkForUpdate(repository) {
  try {
    const { registry, org, name, tag } = parseImage(repository);
    const localDigest = await getImageDigest(repository);

    let remoteDigest = null;

    if (!registry || registry === 'docker.io' || registry === 'index.docker.io') {
      // Docker Hub
      remoteDigest = await fetchDockerHubDigest(org, name, tag);
    } else {
      // Generic registry
      remoteDigest = await fetchGenericRegistryDigest(registry, org, name, tag);
    }

    if (!remoteDigest) {
      return { hasUpdate: false, localDigest, remoteDigest: null, error: 'Could not fetch remote digest' };
    }

    // Local digest from RepoDigests includes the name prefix, e.g. "nginx@sha256:..."
    const localHash = localDigest ? localDigest.split('@')[1] : null;
    const hasUpdate = localHash ? localHash !== remoteDigest : false;

    return { hasUpdate, localDigest: localHash, remoteDigest };
  } catch (err) {
    console.error('Update check error:', err.message);
    return { hasUpdate: false, localDigest: null, remoteDigest: null, error: err.message };
  }
}
