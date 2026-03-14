import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import * as dockerService from '../services/dockerService.js';

const router = Router();
router.use(authMiddleware);

// GET /api/volumes
router.get('/', async (req, res) => {
  try {
    const [volumes, containers] = await Promise.all([
      dockerService.listVolumes(),
      dockerService.listContainers(),
    ]);

    // Map volume names to containers using them
    const volumeUsers = {};
    for (const c of containers) {
      for (const mount of (c.Mounts || [])) {
        if (mount.Type === 'volume' && mount.Name) {
          if (!volumeUsers[mount.Name]) volumeUsers[mount.Name] = [];
          volumeUsers[mount.Name].push((c.Names?.[0] || '').replace(/^\//, ''));
        }
      }
    }

    const result = volumes.map(v => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      created: v.CreatedAt,
      labels: v.Labels || {},
      usedBy: volumeUsers[v.Name] || [],
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/volumes/:name
router.delete('/:name', async (req, res) => {
  try {
    await dockerService.removeVolume(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/volumes/prune
router.post('/prune', async (req, res) => {
  try {
    const result = await dockerService.pruneVolumes();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
