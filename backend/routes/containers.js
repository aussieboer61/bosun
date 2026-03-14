import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import fs from 'fs';
import authMiddleware from '../middleware/authMiddleware.js';
import * as dockerService from '../services/dockerService.js';
import * as xmlService from '../services/xmlService.js';
import { generateCompose, saveCompose } from '../services/composeGenerator.js';
import { checkForUpdate } from '../services/updateChecker.js';
import { runUpdateNow, runAllUpdates } from '../services/autoUpdate.js';

const execAsync = promisify(exec);
const router = Router();
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

// Default exclusions — always applied even if settings.json doesn't exist
const DEFAULT_EXCLUSIONS = [
  'bosun', 'caddy', 'authentik', 'authentik-worker',
  'authentik-postgresql', 'authentik-redis', 'authentik-server', 'authentik-ldap'
];

// Apply auth to all container routes
router.use(authMiddleware);

function loadSettings() {
  const file = join(DATA_DIR, 'data', 'settings.json');
  if (!fs.existsSync(file)) return { exclusions: [], aliases: [], autoUpdateEnabled: false, defaultSchedule: '0 3 * * *' };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { exclusions: [], aliases: [], autoUpdateEnabled: false, defaultSchedule: '0 3 * * *' };
  }
}

function isExcluded(containerName, exclusions) {
  const allExclusions = [...DEFAULT_EXCLUSIONS, ...(exclusions || [])];
  const name = containerName.replace(/^\//, '').toLowerCase();
  return allExclusions.some(ex => name.includes(ex.toLowerCase()));
}

// In-memory update cache: { [id]: { hasUpdate, localDigest, remoteDigest, checkedAt } }
const updateCache = {};

function parseHealth(status) {
  if (!status) return null;
  if (status.includes('(healthy)')) return 'healthy';
  if (status.includes('(unhealthy)')) return 'unhealthy';
  if (status.includes('(health: starting)')) return 'starting';
  return null;
}

// GET /api/containers — list all containers merged with XML configs
router.get('/', async (req, res) => {
  try {
    const settings = loadSettings();
    const [dockerContainers, hostInfo] = await Promise.all([
      dockerService.listContainers(),
      dockerService.getHostInfo()
    ]);

    let configs = [];
    try {
      configs = xmlService.listConfigs();
    } catch (err) {
      console.error('Error loading configs:', err.message);
    }

    // Build config map by name
    const configMap = {};
    for (const cfg of configs) {
      configMap[cfg.name] = cfg;
    }

    // Filter and merge
    const containers = dockerContainers
      .filter(c => {
        const name = (c.Names?.[0] || '').replace(/^\//, '');
        return !isExcluded(name, settings.exclusions);
      })
      .map(c => {
        const name = (c.Names?.[0] || '').replace(/^\//, '');
        const cfg = configMap[name] || null;
        const cached = updateCache[c.Id] || null;
        return {
          id: c.Id,
          name,
          image: c.Image,
          status: c.Status,
          state: c.State,
          created: c.Created,
          ports: c.Ports,
          labels: c.Labels || {},
          health: parseHealth(c.Status),
          config: cfg,
          updateInfo: cached
        };
      });

    // Running count
    const running = dockerContainers.filter(c => c.State === 'running').length;

    res.json({
      containers,
      hostInfo: {
        dockerVersion: hostInfo.ServerVersion,
        totalContainers: dockerContainers.length,
        runningContainers: running,
        os: hostInfo.OperatingSystem,
        cpuCount: hostInfo.NCPU,
        memTotal: hostInfo.MemTotal
      }
    });
  } catch (err) {
    console.error('List containers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/containers/configs — list all XML configs
router.get('/configs', (req, res) => {
  try {
    const configs = xmlService.listConfigs();
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/containers/configs/:name — get single XML config
router.get('/configs/:name', async (req, res) => {
  try {
    const config = await xmlService.readConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Config not found' });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/configs/:name — save XML config
router.post('/configs/:name', async (req, res) => {
  try {
    const config = { ...req.body, name: req.params.name };
    xmlService.writeConfig(config);
    // Regenerate compose file
    const yaml = generateCompose(config);
    await saveCompose(config.name, yaml);
    res.json({ success: true, config });
  } catch (err) {
    console.error('Save config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/containers/configs/:name — delete XML config
router.delete('/configs/:name', (req, res) => {
  try {
    xmlService.deleteConfig(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/import/:id — generate XML config from running container
router.post('/import/:id', async (req, res) => {
  try {
    const inspect = await dockerService.inspectContainer(req.params.id);
    const config = xmlService.inspectToConfig(inspect);
    res.json(config);
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/containers/:name/compose — return generated compose YAML
router.get('/:name/compose', async (req, res) => {
  try {
    const config = await xmlService.readConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Config not found' });
    const yaml = generateCompose(config);
    res.type('text/plain').send(yaml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/containers/:id/update-check — check for image update
router.get('/:id/update-check', async (req, res) => {
  try {
    const inspect = await dockerService.inspectContainer(req.params.id);
    const image = inspect.Config?.Image || inspect.Image;
    const result = await checkForUpdate(image);
    updateCache[req.params.id] = { ...result, checkedAt: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Update check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/containers/:id/inspect — full docker inspect
router.get('/:id/inspect', async (req, res) => {
  try {
    const data = await dockerService.inspectContainer(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/:id/start
router.post('/:id/start', async (req, res) => {
  try {
    await dockerService.startContainer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    await dockerService.stopContainer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/:id/restart
router.post('/:id/restart', async (req, res) => {
  try {
    await dockerService.restartContainer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/containers/:id — remove container
router.delete('/:id', async (req, res) => {
  try {
    await dockerService.removeContainer(req.params.id, { force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/containers/:id/stats — single snapshot of CPU/mem/net stats
router.get('/:id/stats', async (req, res) => {
  try {
    const raw = await dockerService.getStats(req.params.id);

    // CPU %
    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
    const systemDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
    const numCpus = raw.cpu_stats.online_cpus || raw.cpu_stats.cpu_usage.percpu_usage?.length || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    // Memory
    const memUsed = raw.memory_stats.usage - (raw.memory_stats.stats?.cache || 0);
    const memLimit = raw.memory_stats.limit;

    // Network I/O (sum all interfaces)
    let netRx = 0, netTx = 0;
    for (const iface of Object.values(raw.networks || {})) {
      netRx += iface.rx_bytes || 0;
      netTx += iface.tx_bytes || 0;
    }

    res.json({
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      memUsed,
      memLimit,
      memPercent: memLimit > 0 ? Math.round((memUsed / memLimit) * 1000) / 10 : 0,
      netRx,
      netTx,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/check-updates — bulk update check, populates cache for all running containers
router.post('/check-updates', async (req, res) => {
  try {
    const allContainers = await dockerService.listContainers();
    const running = allContainers.filter(c => c.State === 'running');
    res.json({ started: true, count: running.length });

    // Run checks async after responding
    for (const c of running) {
      const image = c.Image;
      if (!image) continue;
      checkForUpdate(image)
        .then(result => { updateCache[c.Id] = { ...result, checkedAt: Date.now() }; })
        .catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/:name/update-now — manually trigger update for one container
router.post('/:name/update-now', (req, res) => {
  const name = req.params.name;
  const io = req.app.get('io');
  res.json({ success: true, message: 'Update started' });
  runUpdateNow(name, io).catch(err => console.error(`Update error for ${name}:`, err.message));
});

// POST /api/containers/update-all — manually trigger updates for all containers
router.post('/update-all', (req, res) => {
  const io = req.app.get('io');
  res.json({ success: true, message: 'Updates started for all containers' });
  runAllUpdates(io).catch(err => console.error('Update all error:', err.message));
});

// POST /api/containers/bulk — bulk action on multiple containers
router.post('/bulk', async (req, res) => {
  const { action, ids } = req.body;
  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'action and ids[] required' });
  }
  const allowed = ['start', 'stop', 'restart'];
  if (!allowed.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${allowed.join(', ')}` });
  }

  const results = await Promise.allSettled(
    ids.map(id => dockerService[`${action}Container`](id))
  );

  const errors = results
    .map((r, i) => r.status === 'rejected' ? { id: ids[i], error: r.reason?.message } : null)
    .filter(Boolean);

  res.json({ success: errors.length === 0, errors });
});

// POST /api/containers/:name/deploy — pull + deploy
router.post('/:name/deploy', async (req, res) => {
  const name = req.params.name;
  // Respond immediately — actual work happens async via socket
  res.json({ success: true, message: 'Deploy started' });

  // Get io from app locals (set by index.js)
  const io = req.app.get('io');
  const pullNs = io ? io.of('/pull') : null;

  const emit = (data) => {
    if (pullNs) pullNs.emit('event', { name, ...data });
    else console.log(`[deploy ${name}]`, JSON.stringify(data));
  };

  async function runDeploy() {
    const config = await xmlService.readConfig(name);
    if (!config) {
      emit({ type: 'error', message: `No config found for "${name}"` });
      return;
    }

    // Ensure compose file is current
    const yaml = generateCompose(config);
    await saveCompose(name, yaml);

    emit({ type: 'step', message: `Pulling image: ${config.repository}` });

    // Pull the image — onProgress receives parsed event objects from dockerode
    await dockerService.pullImage(config.repository, (event) => {
      emit({
        type: 'layer',
        id: event.id || null,
        status: event.status || '',
        progress: event.progressDetail || null
      });
    });

    emit({ type: 'step', message: 'Image pulled. Stopping existing container...' });

    // Stop existing container if running
    try {
      const allContainers = await dockerService.listContainers();
      const existing = allContainers.find(c => {
        const cName = (c.Names?.[0] || '').replace(/^\//, '');
        return cName === name;
      });
      if (existing && existing.State === 'running') {
        await dockerService.stopContainer(existing.Id);
      }
      if (existing) {
        await dockerService.removeContainer(existing.Id, { force: true });
      }
    } catch (err) {
      emit({ type: 'log', message: `Warning: ${err.message}` });
    }

    emit({ type: 'step', message: 'Starting container via docker compose...' });

    // Run docker compose up -d
    const composeDir = join(DATA_DIR, 'compose', name);
    const { stdout, stderr } = await execAsync('docker compose up -d', { cwd: composeDir });
    if (stdout) emit({ type: 'log', message: stdout.trim() });
    if (stderr) emit({ type: 'log', message: stderr.trim() });

    emit({ type: 'complete', message: `Container "${name}" deployed successfully` });
  }

  runDeploy().catch(err => {
    console.error('Deploy error:', err);
    emit({ type: 'error', message: err.message });
  });
});

export default router;
