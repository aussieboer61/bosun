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

  // Network
  const networkName = config.network || 'bridge';
  if (networkName !== 'host' && networkName !== 'none') {
    service.networks = [networkName];
  } else {
    service.network_mode = networkName;
  }

  // Environment variables
  if (config.environment && config.environment.length > 0) {
    service.environment = config.environment
      .filter(e => e.name)
      .map(e => `${e.name}=${e.value}`);
  }

  // Volumes
  if (config.volumes && config.volumes.length > 0) {
    service.volumes = config.volumes
      .filter(v => v.hostPath && v.containerPath)
      .map(v => {
        const mode = v.mode && v.mode !== 'rw' ? `:${v.mode}` : '';
        return `${v.hostPath}:${v.containerPath}${mode}`;
      });
  }

  // Ports
  if (config.ports && config.ports.length > 0) {
    service.ports = config.ports
      .filter(p => p.hostPort && p.containerPort)
      .map(p => {
        const proto = p.protocol && p.protocol !== 'tcp' ? `/${p.protocol}` : '';
        return `"${p.hostPort}:${p.containerPort}${proto}"`;
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

  // Build compose object
  const composeObj = {
    services: {
      [config.name]: service
    }
  };

  // Add network definition (if not host/none)
  if (networkName !== 'host' && networkName !== 'none') {
    composeObj.networks = {
      [networkName]: {
        external: true
      }
    };
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
