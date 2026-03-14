import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import * as dockerService from '../services/dockerService.js';

const router = Router();
router.use(authMiddleware);

// GET /api/networks
router.get('/', async (req, res) => {
  try {
    const networks = await dockerService.listNetworks();
    const result = networks
      .filter(n => !['none', 'host'].includes(n.Name)) // skip system networks
      .map(n => ({
        id: n.Id,
        shortId: n.Id.slice(0, 12),
        name: n.Name,
        driver: n.Driver,
        scope: n.Scope,
        internal: n.Internal,
        ipam: n.IPAM,
        containers: Object.entries(n.Containers || {}).map(([id, info]) => ({
          id: id.slice(0, 12),
          name: info.Name,
          ipv4: info.IPv4Address,
        })),
        created: n.Created,
        labels: n.Labels || {},
      }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/networks
router.post('/', async (req, res) => {
  try {
    const { name, driver = 'bridge', internal = false, subnet } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const opts = { Internal: internal };
    if (subnet) {
      opts.IPAM = { Driver: 'default', Config: [{ Subnet: subnet }] };
    }
    const network = await dockerService.createNetwork(name, driver, opts);
    res.json({ success: true, id: network.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/networks/:id
router.delete('/:id', async (req, res) => {
  try {
    await dockerService.removeNetwork(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
