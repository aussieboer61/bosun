import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import * as dockerService from '../services/dockerService.js';

const router = Router();
router.use(authMiddleware);

// GET /api/images
router.get('/', async (req, res) => {
  try {
    const images = await dockerService.listImages();
    // Get running containers to map which images are in use
    const containers = await dockerService.listContainers();
    const usedImages = new Set(containers.map(c => c.ImageID));

    const result = images.map(img => ({
      id: img.Id,
      shortId: img.Id.replace('sha256:', '').slice(0, 12),
      tags: img.RepoTags || [],
      size: img.Size,
      created: img.Created,
      inUse: usedImages.has(img.Id),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/images/:id
router.delete('/:id', async (req, res) => {
  try {
    await dockerService.removeImage(req.params.id, { force: req.query.force === 'true' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/images/prune
router.post('/prune', async (req, res) => {
  try {
    const result = await dockerService.pruneImages();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
