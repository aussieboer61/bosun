import fs from 'fs';
import { join } from 'path';
import xml2js from 'xml2js';

const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

function getConfigsDir() {
  return join(DATA_DIR, 'configs');
}

function configPath(name) {
  return join(getConfigsDir(), `${name}.xml`);
}

// Parse XML string synchronously using xml2js callback with async:false
function parseXmlSync(content) {
  let result = null;
  let parseError = null;
  xml2js.parseString(content, { async: false, explicitArray: true }, (err, r) => {
    if (err) parseError = err;
    else result = r;
  });
  if (parseError) throw parseError;
  return result;
}

// Normalize a raw parsed XML object to our config shape
function normalizeConfig(raw) {
  const get = (obj, key, def = '') => {
    if (!obj) return def;
    const val = obj[key];
    if (val === undefined || val === null) return def;
    if (Array.isArray(val)) return val[0] ?? def;
    return val;
  };

  const getArr = (obj, key) => {
    if (!obj) return [];
    const val = obj[key];
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val];
  };

  const root = raw.Container || raw;

  const boolVal = (v) => v === true || v === 'true' || v === '1';

  // Environment variables
  let environment = [];
  const envSection = get(root, 'Environment', null);
  if (envSection) {
    const envObj = Array.isArray(envSection) ? envSection[0] : envSection;
    const vars = getArr(envObj, 'Variable');
    environment = vars.map(v => {
      const vo = Array.isArray(v) ? v[0] : v;
      if (typeof vo === 'string') return { name: vo, value: '', description: '' };
      return {
        name: get(vo, 'Name'),
        value: get(vo, 'Value'),
        description: get(vo, 'Description')
      };
    });
  }

  // Volume mappings — supports bind mounts (HostDir) and named volumes (VolumeName)
  let volumes = [];
  const volSection = get(root, 'Volumes', null);
  if (volSection) {
    const volObj = Array.isArray(volSection) ? volSection[0] : volSection;
    const vols = getArr(volObj, 'Volume');
    volumes = vols.map(v => {
      const vo = Array.isArray(v) ? v[0] : v;
      if (typeof vo === 'string') return { type: 'bind', hostPath: vo, containerPath: '', mode: 'rw', description: '', volumeName: '', external: false };
      const volumeName = get(vo, 'VolumeName') || '';
      const type = volumeName ? 'named' : 'bind';
      return {
        type,
        hostPath: get(vo, 'HostDir') || get(vo, 'hostPath') || '',
        containerPath: get(vo, 'ContainerDir') || get(vo, 'containerPath'),
        mode: get(vo, 'Mode') || get(vo, 'mode') || 'rw',
        description: get(vo, 'Description'),
        volumeName,
        external: boolVal(get(vo, 'External'))
      };
    });
  }

  // Port mappings — supports optional HostIP for IP-scoped bindings
  let ports = [];
  const portSection = get(root, 'Ports', null);
  if (portSection) {
    const portObj = Array.isArray(portSection) ? portSection[0] : portSection;
    const portArr = getArr(portObj, 'Port');
    ports = portArr.map(p => {
      const po = Array.isArray(p) ? p[0] : p;
      if (typeof po === 'string') return { hostPort: po, containerPort: '', hostIP: '', protocol: 'tcp', description: '' };
      return {
        hostPort: get(po, 'HostPort') || get(po, 'hostPort'),
        containerPort: get(po, 'ContainerPort') || get(po, 'containerPort'),
        hostIP: get(po, 'HostIP') || get(po, 'hostIP') || '',
        protocol: get(po, 'Protocol') || get(po, 'protocol') || 'tcp',
        description: get(po, 'Description')
      };
    });
  }

  // Labels
  let labels = [];
  const labelSection = get(root, 'Labels', null);
  if (labelSection) {
    const labelObj = Array.isArray(labelSection) ? labelSection[0] : labelSection;
    const labelArr = getArr(labelObj, 'Label');
    labels = labelArr.map(l => {
      const lo = Array.isArray(l) ? l[0] : l;
      if (typeof lo === 'string') return { name: lo, value: '' };
      return {
        name: get(lo, 'Name'),
        value: get(lo, 'Value')
      };
    });
  }

  // Networks — read <Networks><Network> array, fallback to legacy <Network> single value
  let networks = [];
  const netsSection = get(root, 'Networks', null);
  if (netsSection) {
    const netsObj = Array.isArray(netsSection) ? netsSection[0] : netsSection;
    if (netsObj && typeof netsObj === 'object') {
      const netArr = getArr(netsObj, 'Network');
      networks = netArr.map(n => (Array.isArray(n) ? n[0] : n)).filter(Boolean);
    }
  }
  if (networks.length === 0) {
    const legacyNet = get(root, 'Network');
    networks = legacyNet ? [legacyNet] : ['bridge'];
  }

  // Sysctls — key/value pairs for kernel parameters
  let sysctls = [];
  const sysctlSection = get(root, 'Sysctls', null);
  if (sysctlSection) {
    const sysObj = Array.isArray(sysctlSection) ? sysctlSection[0] : sysctlSection;
    const sysArr = getArr(sysObj, 'Sysctl');
    sysctls = sysArr.map(s => {
      const so = Array.isArray(s) ? s[0] : s;
      if (typeof so === 'string') return { key: so, value: '' };
      return { key: get(so, 'Key'), value: get(so, 'Value') };
    });
  }

  // DependsOn — list of container names this service depends on
  let dependsOn = [];
  const depsSection = get(root, 'DependsOn', null);
  if (depsSection) {
    const depsObj = Array.isArray(depsSection) ? depsSection[0] : depsSection;
    const depsArr = getArr(depsObj, 'Container');
    dependsOn = depsArr.map(d => (Array.isArray(d) ? d[0] : d)).filter(Boolean);
  }

  return {
    name: get(root, 'Name'),
    repository: get(root, 'Repository') || get(root, 'Image'),
    registry: get(root, 'Registry'),
    icon: get(root, 'Icon'),
    webUI: get(root, 'WebUI') || get(root, 'WebUrl'),
    autoStart: boolVal(get(root, 'AutoStart')),
    autoUpdate: boolVal(get(root, 'AutoUpdate')),
    autoUpdateSchedule: get(root, 'AutoUpdateSchedule') || '0 3 * * *',
    networks,
    command: get(root, 'Command') || '',
    privileged: boolVal(get(root, 'Privileged')),
    restartPolicy: get(root, 'RestartPolicy') || 'unless-stopped',
    environment,
    volumes,
    ports,
    labels,
    sysctls,
    dependsOn
  };
}

// Convert config object to XML string
function configToXml(config) {
  const builder = new xml2js.Builder({
    rootName: 'Container',
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' }
  });

  const nets = Array.isArray(config.networks) && config.networks.length > 0
    ? config.networks
    : [config.network || 'bridge'];

  const obj = {
    Name: config.name,
    Repository: config.repository || '',
    Registry: config.registry || '',
    Icon: config.icon || '',
    WebUI: config.webUI || '',
    AutoStart: config.autoStart ? 'true' : 'false',
    AutoUpdate: config.autoUpdate ? 'true' : 'false',
    AutoUpdateSchedule: config.autoUpdateSchedule || '0 3 * * *',
    Networks: { Network: nets },
    Command: config.command || '',
    Privileged: config.privileged ? 'true' : 'false',
    RestartPolicy: config.restartPolicy || 'unless-stopped',
    Environment: {
      Variable: (config.environment || []).map(e => ({
        Name: e.name,
        Value: e.value,
        Description: e.description || ''
      }))
    },
    Volumes: {
      Volume: (config.volumes || []).map(v => {
        if (v.type === 'named') {
          return {
            VolumeName: v.volumeName,
            ContainerDir: v.containerPath,
            Mode: v.mode || 'rw',
            External: v.external ? 'true' : 'false',
            Description: v.description || ''
          };
        }
        return {
          HostDir: v.hostPath,
          ContainerDir: v.containerPath,
          Mode: v.mode || 'rw',
          Description: v.description || ''
        };
      })
    },
    Ports: {
      Port: (config.ports || []).map(p => ({
        HostPort: p.hostPort,
        ContainerPort: p.containerPort,
        HostIP: p.hostIP || '',
        Protocol: p.protocol || 'tcp',
        Description: p.description || ''
      }))
    },
    Labels: {
      Label: (config.labels || []).map(l => ({
        Name: l.name,
        Value: l.value
      }))
    },
    Sysctls: {
      Sysctl: (config.sysctls || []).map(s => ({
        Key: s.key,
        Value: s.value
      }))
    },
    DependsOn: {
      Container: (config.dependsOn || []).filter(Boolean)
    }
  };

  return builder.buildObject(obj);
}

// Async version for single config reads
export async function readConfig(name) {
  const file = configPath(name);
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  const parsed = await xml2js.parseStringPromise(content, { explicitArray: true });
  return normalizeConfig(parsed);
}

export function writeConfig(config) {
  const dir = getConfigsDir();
  fs.mkdirSync(dir, { recursive: true });
  const xml = configToXml(config);
  fs.writeFileSync(configPath(config.name), xml, 'utf8');
}

// Synchronous list for startup/cron use
export function listConfigs() {
  const dir = getConfigsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));
  const configs = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(join(dir, file), 'utf8');
      const parsed = parseXmlSync(content);
      if (parsed) {
        configs.push(normalizeConfig(parsed));
      }
    } catch (err) {
      console.error(`Error parsing ${file}:`, err.message);
    }
  }
  return configs;
}

export function configExists(name) {
  return fs.existsSync(configPath(name));
}

export function deleteConfig(name) {
  const file = configPath(name);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

export function inspectToConfig(inspectData) {
  const name = (inspectData.Name || '').replace(/^\//, '');
  const image = inspectData.Config?.Image || '';
  const cfg = inspectData.Config || {};
  const hostConfig = inspectData.HostConfig || {};
  const networkSettings = inspectData.NetworkSettings || {};

  const environment = (cfg.Env || []).map(envStr => {
    const idx = envStr.indexOf('=');
    if (idx === -1) return { name: envStr, value: '', description: '' };
    return {
      name: envStr.slice(0, idx),
      value: envStr.slice(idx + 1),
      description: ''
    };
  });

  // Bind mounts from Binds; named volumes from Mounts
  const volumes = [];
  const bindSet = new Set(hostConfig.Binds || []);
  for (const bind of (hostConfig.Binds || [])) {
    const parts = bind.split(':');
    volumes.push({
      type: 'bind',
      hostPath: parts[0] || '',
      containerPath: parts[1] || '',
      mode: parts[2] || 'rw',
      description: '',
      volumeName: '',
      external: false
    });
  }
  for (const mount of (inspectData.Mounts || [])) {
    if (mount.Type === 'volume') {
      volumes.push({
        type: 'named',
        hostPath: '',
        containerPath: mount.Destination || '',
        mode: mount.RW ? 'rw' : 'ro',
        description: '',
        volumeName: mount.Name || '',
        external: false
      });
    }
  }

  const ports = [];
  const portBindings = hostConfig.PortBindings || {};
  for (const [containerSpec, bindings] of Object.entries(portBindings)) {
    const [containerPort, protocol] = containerSpec.split('/');
    if (bindings && bindings.length > 0) {
      for (const binding of bindings) {
        ports.push({
          hostPort: binding.HostPort || '',
          containerPort,
          hostIP: binding.HostIp || '',
          protocol: protocol || 'tcp',
          description: ''
        });
      }
    }
  }

  const labels = Object.entries(cfg.Labels || {}).map(([k, v]) => ({
    name: k,
    value: v
  }));

  const networks = Object.keys(networkSettings.Networks || {});
  const resolvedNetworks = networks.length > 0 ? networks : ['bridge'];

  const cmdArr = cfg.Cmd || [];
  const command = cmdArr.join(' ');

  const restartMap = {
    always: 'always',
    'unless-stopped': 'unless-stopped',
    'on-failure': 'on-failure',
    no: 'no'
  };
  const restartPolicy = restartMap[hostConfig.RestartPolicy?.Name] || 'unless-stopped';

  // Sysctls from HostConfig
  const sysctls = Object.entries(hostConfig.Sysctls || {}).map(([k, v]) => ({ key: k, value: v }));

  return {
    name,
    repository: image,
    registry: '',
    icon: '',
    webUI: '',
    autoStart: false,
    autoUpdate: false,
    autoUpdateSchedule: '0 3 * * *',
    networks: resolvedNetworks,
    command,
    privileged: hostConfig.Privileged || false,
    restartPolicy,
    environment,
    volumes,
    ports,
    labels,
    sysctls,
    dependsOn: []
  };
}
