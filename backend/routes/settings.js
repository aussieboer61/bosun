import { Router } from 'express';
import fs from 'fs';
import { join } from 'path';
import authMiddleware from '../middleware/authMiddleware.js';
import { scheduleAutoUpdates } from '../services/autoUpdate.js';

const router = Router();
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

router.use(authMiddleware);

function getSettingsFile() {
  return join(DATA_DIR, 'data', 'settings.json');
}

function readSettings() {
  const file = getSettingsFile();
  const defaults = {
    exclusions: [],
    aliases: [],
    autoUpdateEnabled: false,
    defaultSchedule: '0 3 * * *'
  };
  if (!fs.existsSync(file)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return defaults;
  }
}

function writeSettings(settings) {
  const file = getSettingsFile();
  fs.mkdirSync(join(DATA_DIR, 'data'), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
}

// GET /api/settings
router.get('/', (req, res) => {
  try {
    res.json(readSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const current = readSettings();
    const updated = {
      ...current,
      ...req.body,
      // Ensure these are valid types
      exclusions: Array.isArray(req.body.exclusions) ? req.body.exclusions : current.exclusions,
      aliases: Array.isArray(req.body.aliases) ? req.body.aliases : current.aliases,
      autoUpdateEnabled: typeof req.body.autoUpdateEnabled === 'boolean'
        ? req.body.autoUpdateEnabled : current.autoUpdateEnabled,
      defaultSchedule: typeof req.body.defaultSchedule === 'string'
        ? req.body.defaultSchedule : current.defaultSchedule
    };
    writeSettings(updated);
    // Reschedule auto-updates whenever settings change
    const io = req.app.get('io');
    scheduleAutoUpdates(io);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/updates/log — recent update log lines
router.get('/updates/log', (req, res) => {
  try {
    const logFile = join(DATA_DIR, 'data', 'updates.log');
    if (!fs.existsSync(logFile)) return res.json({ lines: [] });
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean).slice(-200).reverse();
    res.json({ lines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/exclusions
router.get('/exclusions', (req, res) => {
  try {
    const settings = readSettings();
    res.json(settings.exclusions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/exclusions — add entry
router.post('/exclusions', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }
    const settings = readSettings();
    if (!settings.exclusions.includes(name)) {
      settings.exclusions.push(name);
      writeSettings(settings);
    }
    res.json(settings.exclusions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/exclusions/:name — remove entry
router.delete('/exclusions/:name', (req, res) => {
  try {
    const settings = readSettings();
    settings.exclusions = settings.exclusions.filter(e => e !== req.params.name);
    writeSettings(settings);
    res.json(settings.exclusions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
