import { Router } from 'express';
import { join } from 'path';
import fs from 'fs';
import authMiddleware from '../middleware/authMiddleware.js';
import * as xmlService from '../services/xmlService.js';

const router = Router();
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

router.use(authMiddleware);

// GET /api/backup — export all configs as JSON
router.get('/', (req, res) => {
  try {
    const configs = xmlService.listConfigs();
    const full = configs.map(cfg => {
      try {
        return xmlService.readConfig(cfg.name);
      } catch {
        return cfg;
      }
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      configs: full,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="bosun-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore — restore configs from backup JSON
router.post('/restore', async (req, res) => {
  try {
    const { configs, overwrite = false } = req.body;
    if (!Array.isArray(configs)) {
      return res.status(400).json({ error: 'configs array required' });
    }

    const { generateCompose, saveCompose } = await import('../services/composeGenerator.js');
    const results = { imported: [], skipped: [], errors: [] };

    for (const config of configs) {
      if (!config || !config.name) {
        results.errors.push({ name: '(unknown)', error: 'Missing name' });
        continue;
      }
      try {
        const exists = xmlService.configExists(config.name);
        if (exists && !overwrite) {
          results.skipped.push(config.name);
          continue;
        }
        xmlService.writeConfig(config);
        const yaml = generateCompose(config);
        await saveCompose(config.name, yaml);
        results.imported.push(config.name);
      } catch (err) {
        results.errors.push({ name: config.name, error: err.message });
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
