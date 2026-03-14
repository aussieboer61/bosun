import cron from 'node-cron';
import fs from 'fs';
import { join } from 'path';
import { listConfigs } from './xmlService.js';
import { listContainers, startContainer, pullImage, stopContainer, removeContainer, pruneImages } from './dockerService.js';
import { generateCompose, saveCompose } from './composeGenerator.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

// Keep track of scheduled jobs so we don't double-schedule
const scheduledJobs = new Map();

function readSettings() {
  const file = join(DATA_DIR, 'data', 'settings.json');
  const defaults = { autoUpdateEnabled: false, defaultSchedule: '0 3 * * *' };
  if (!fs.existsSync(file)) return defaults;
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch { return defaults; }
}

function appendLog(message) {
  const logFile = join(DATA_DIR, 'data', 'updates.log');
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(join(DATA_DIR, 'data'), { recursive: true });
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {}
  console.log(message);
}

async function performUpdate(config, io) {
  const name = config.name;
  appendLog(`Update started: ${name}`);

  const pullNs = io ? io.of('/pull') : null;
  const emit = (data) => {
    if (pullNs) pullNs.emit('event', { name, ...data });
  };

  try {
    // Regenerate compose
    const yaml = generateCompose(config);
    await saveCompose(name, yaml);

    emit({ type: 'step', message: `Pulling ${config.repository}` });

    await pullImage(config.repository, (event) => {
      emit({ type: 'layer', id: event.id, status: event.status, progress: event.progressDetail });
    });

    appendLog(`Image pulled: ${name}`);
    emit({ type: 'step', message: 'Stopping existing container...' });

    const containers = await listContainers();
    const existing = containers.find(c => (c.Names?.[0] || '').replace(/^\//, '') === name);

    if (existing) {
      if (existing.State === 'running') await stopContainer(existing.Id);
      await removeContainer(existing.Id, { force: true });
    }

    emit({ type: 'step', message: 'Starting container...' });

    const composeDir = join(DATA_DIR, 'compose', name);
    const { stdout, stderr } = await execAsync('docker compose up -d', { cwd: composeDir });
    if (stdout) appendLog(`${name}: ${stdout.trim()}`);
    if (stderr) appendLog(`${name}: ${stderr.trim()}`);

    // Cleanup old images (equivalent to WATCHTOWER_CLEANUP=true)
    try {
      await pruneImages();
    } catch (err) {
      appendLog(`Image cleanup warning: ${err.message}`);
    }

    appendLog(`Update complete: ${name}`);
    emit({ type: 'complete', message: `${name} updated successfully` });
  } catch (err) {
    appendLog(`Update ERROR for ${name}: ${err.message}`);
    emit({ type: 'error', message: err.message });
  }
}

export function scheduleAutoUpdates(io) {
  // Cancel any existing schedules
  for (const job of scheduledJobs.values()) job.stop();
  scheduledJobs.clear();

  const settings = readSettings();
  const defaultSchedule = settings.defaultSchedule || '0 3 * * *';

  let configs = [];
  try {
    configs = listConfigs();
  } catch (err) {
    appendLog(`AutoUpdate: Failed to load configs: ${err.message}`);
    return;
  }

  for (const config of configs) {
    // Global enabled → schedule all containers on default (or per-container) schedule
    // Global disabled → only schedule containers with explicit autoUpdate: true
    const shouldSchedule = settings.autoUpdateEnabled || config.autoUpdate;
    if (!shouldSchedule) continue;

    const schedule = config.autoUpdateSchedule || defaultSchedule;

    if (!cron.validate(schedule)) {
      appendLog(`AutoUpdate: Invalid schedule for ${config.name}: ${schedule}`);
      continue;
    }

    const job = cron.schedule(schedule, async () => {
      appendLog(`AutoUpdate: Triggered for ${config.name}`);
      try {
        const { listConfigs: lc } = await import('./xmlService.js');
        const freshSettings = readSettings();
        const freshConfig = lc().find(c => c.name === config.name);
        if (freshConfig && (freshSettings.autoUpdateEnabled || freshConfig.autoUpdate)) {
          await performUpdate(freshConfig, io);
        }
      } catch (err) {
        appendLog(`AutoUpdate: Error re-reading config for ${config.name}: ${err.message}`);
        await performUpdate(config, io);
      }
    });

    scheduledJobs.set(config.name, job);
  }

  appendLog(`AutoUpdate: Scheduled ${scheduledJobs.size} container(s)`);
}

// Manually trigger update for a single container by name
export async function runUpdateNow(configName, io) {
  const configs = listConfigs();
  const config = configs.find(c => c.name === configName);
  if (!config) throw new Error(`Config not found: ${configName}`);
  await performUpdate(config, io);
}

// Run updates for all managed containers immediately
export async function runAllUpdates(io) {
  const configs = listConfigs();
  appendLog(`RunAll: Starting updates for ${configs.length} container(s)`);
  for (const config of configs) {
    await performUpdate(config, io);
  }
  appendLog('RunAll: All updates complete');
}

export async function runAutoStart() {
  appendLog('AutoStart: Scanning configs...');

  let configs = [];
  try {
    configs = listConfigs();
  } catch (err) {
    appendLog(`AutoStart: Failed to load configs: ${err.message}`);
    return;
  }

  const autoStartConfigs = configs.filter(c => c.autoStart);
  if (autoStartConfigs.length === 0) {
    appendLog('AutoStart: No containers configured for autostart');
    return;
  }

  let runningContainers = [];
  try {
    runningContainers = await listContainers();
  } catch (err) {
    appendLog(`AutoStart: Failed to list containers: ${err.message}`);
    return;
  }

  const runningNames = new Set(
    runningContainers
      .filter(c => c.State === 'running')
      .map(c => (c.Names?.[0] || '').replace(/^\//, ''))
  );

  for (const config of autoStartConfigs) {
    if (runningNames.has(config.name)) {
      appendLog(`AutoStart: ${config.name} is already running`);
      continue;
    }

    const existing = runningContainers.find(c => {
      const cName = (c.Names?.[0] || '').replace(/^\//, '');
      return cName === config.name;
    });

    if (existing) {
      appendLog(`AutoStart: Starting stopped container ${config.name}`);
      try {
        await startContainer(existing.Id);
        appendLog(`AutoStart: Started ${config.name}`);
      } catch (err) {
        appendLog(`AutoStart: Failed to start ${config.name}: ${err.message}`);
      }
    } else {
      appendLog(`AutoStart: Container ${config.name} not found — skipping (deploy it first)`);
    }
  }

  appendLog('AutoStart: Scan complete');
}
