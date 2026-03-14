import yaml from 'js-yaml';
import fs from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

export function generateCompose(config) {
  const service = {};

  service.image = config.repository;
  service.container_name = config.name;
  service.restart = config.restartPolicy || 'unless-stopped';

  if (config.privileged) {
    service.privileged = true;
  }

  // Command override
  if (config.command && config.command.trim()) {
    service.command = config.command.trim();
  }

  // Networks — supports array (new) or single string (legacy)
  const networks = Array.isArray(config.networks) && config.networks.length > 0
    ? config.networks.filter(Boolean)
    : [config.network || 'bridge'];

  if (networks.length === 1 && (networks[0] === 'host' || networks[0] === 'none')) {
    service.network_mode = networks[0];
  } else {
    service.networks = networks;
  }

  // Environment variables
  if (config.environment && config.environment.length > 0) {
    service.environment = config.environment
      .filter(e => e.name)
      .map(e => `${e.name}=${e.value}`);
  }

  // Volumes — supports bind mounts and named volumes
  const namedVolumes = [];
  if (config.volumes && config.volumes.length > 0) {
    service.volumes = config.volumes
      .filter(v => v.type === 'named' ? (v.volumeName && v.containerPath) : (v.hostPath && v.containerPath))
      .map(v => {
        const mode = v.mode && v.mode !== 'rw' ? `:${v.mode}` : '';
        if (v.type === 'named') {
          namedVolumes.push({ name: v.volumeName, external: v.external || false });
          return `${v.volumeName}:${v.containerPath}${mode}`;
        }
        return `${v.hostPath}:${v.containerPath}${mode}`;
      });
  }

  // Ports — supports optional host IP for IP-scoped bindings
  if (config.ports && config.ports.length > 0) {
    service.ports = config.ports
      .filter(p => p.hostPort && p.containerPort)
      .map(p => {
        const proto = p.protocol && p.protocol !== 'tcp' ? `/${p.protocol}` : '';
        const prefix = p.hostIP ? `${p.hostIP}:` : '';
        return `"${prefix}${p.hostPort}:${p.containerPort}${proto}"`;
      });
  }

  // Labels
  if (config.labels && config.labels.length > 0) {
    service.labels = {};
    for (const label of config.labels) {
      if (label.name) {
        service.labels[label.name] = label.value;
      }
    }
  }

  // Sysctls
  if (config.sysctls && config.sysctls.length > 0) {
    const validSysctls = config.sysctls.filter(s => s.key);
    if (validSysctls.length > 0) {
      service.sysctls = {};
      for (const s of validSysctls) {
        service.sysctls[s.key] = s.value;
      }
    }
  }

  // depends_on
  if (config.dependsOn && config.dependsOn.length > 0) {
    const deps = config.dependsOn.filter(Boolean);
    if (deps.length > 0) {
      service.depends_on = deps;
    }
  }

  // Build compose object
  const composeObj = {
    services: {
      [config.name]: service
    }
  };

  // Add network definitions (external: true for each non-special network)
  const externalNetworks = networks.filter(n => n !== 'host' && n !== 'none');
  if (externalNetworks.length > 0) {
    composeObj.networks = {};
    for (const n of externalNetworks) {
      composeObj.networks[n] = { external: true };
    }
  }

  // Add named volume definitions
  // Non-external volumes get name: pinned to prevent Docker prepending the project directory name
  if (namedVolumes.length > 0) {
    composeObj.volumes = {};
    for (const vol of namedVolumes) {
      composeObj.volumes[vol.name] = vol.external ? { external: true } : { name: vol.name };
    }
  }

  // Use yaml.dump with custom options for clean output
  const raw = yaml.dump(composeObj, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false
  });

  // Fix ports: yaml dumps them with quotes inside the string which looks odd
  // The ports were stored as '"4080:4080"' strings — strip the inner quotes
  const cleaned = raw.replace(/- '"(.*?)"'/g, '- "$1"');

  return cleaned;
}

export async function saveCompose(name, yamlString) {
  const composeDir = join(DATA_DIR, 'compose', name);
  fs.mkdirSync(composeDir, { recursive: true });
  const composeFile = join(composeDir, 'docker-compose.yml');
  fs.writeFileSync(composeFile, yamlString, 'utf8');
}
