import cron from 'node-cron';
import fs from 'fs';
import { join } from 'path';
import { listConfigs } from './xmlService.js';
import { listContainers, startContainer } from './dockerService.js';
import { pullImage, stopContainer, removeContainer } from './dockerService.js';
import { generateCompose, saveCompose } from './composeGenerator.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

// Keep track of scheduled jobs so we don't double-schedule
const scheduledJobs = new Map();

function appendLog(message) {
  const logFile = join(DATA_DIR, 'data', 'autostart.log');
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(join(DATA_DIR, 'data'), { recursive: true });
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {}
  console.log(message);
}

async function performUpdate(config, io) {
  const name = config.name;
  appendLog(`AutoUpdate: starting update for ${name}`);

  const pullNs = io ? io.of('/pull') : null;
  const emit = (data) => {
    if (pullNs) pullNs.emit('event', { name, ...data });
  };

  try {
    // Regenerate compose
    const yaml = generateCompose(config);
    await saveCompose(name, yaml);

    emit({ type: 'step', message: `AutoUpdate: Pulling ${config.repository}` });

    await pullImage(config.repository, (event) => {
      emit({
        type: 'layer',
        id: event.id,
        status: event.status,
        progress: event.progressDetail
      });
    });

    appendLog(`AutoUpdate: Image pulled for ${name}`);
    emit({ type: 'step', message: 'Stopping existing container...' });

    // Find and stop existing container
    const containers = await listContainers();
    const existing = containers.find(c => {
      const cName = (c.Names?.[0] || '').replace(/^\//, '');
      return cName === name;
    });

    if (existing) {
      if (existing.State === 'running') {
        await stopContainer(existing.Id);
      }
      await removeContainer(existing.Id, { force: true });
    }

    emit({ type: 'step', message: 'Starting container...' });

    const composeDir = join(DATA_DIR, 'compose', name);
    const { stdout, stderr } = await execAsync('docker compose up -d', { cwd: composeDir });
    if (stdout) appendLog(`AutoUpdate [${name}]: ${stdout.trim()}`);
    if (stderr) appendLog(`AutoUpdate [${name}]: ${stderr.trim()}`);

    appendLog(`AutoUpdate: ${name} updated successfully`);
    emit({ type: 'complete', message: `${name} updated successfully` });
  } catch (err) {
    appendLog(`AutoUpdate ERROR for ${name}: ${err.message}`);
    emit({ type: 'error', message: err.message });
  }
}

export function scheduleAutoUpdates(io) {
  // Cancel any existing schedules
  for (const [name, job] of scheduledJobs) {
    job.stop();
  }
  scheduledJobs.clear();

  let configs = [];
  try {
    configs = listConfigs();
  } catch (err) {
    appendLog(`AutoUpdate: Failed to load configs: ${err.message}`);
    return;
  }

  for (const config of configs) {
    if (!config.autoUpdate) continue;

    const schedule = config.autoUpdateSchedule || '0 3 * * *';

    if (!cron.validate(schedule)) {
      appendLog(`AutoUpdate: Invalid cron schedule for ${config.name}: ${schedule}`);
      continue;
    }

    appendLog(`AutoUpdate: Scheduling ${config.name} with cron: ${schedule}`);

    const job = cron.schedule(schedule, async () => {
      appendLog(`AutoUpdate: Triggered for ${config.name}`);
      // Re-read config in case it changed
      try {
        const { listConfigs: lc } = await import('./xmlService.js');
        const allConfigs = lc();
        const freshConfig = allConfigs.find(c => c.name === config.name);
        if (freshConfig && freshConfig.autoUpdate) {
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

    // Find container by name (might be stopped)
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
