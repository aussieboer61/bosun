import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import authMiddleware from '../middleware/authMiddleware.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

router.use(authMiddleware);

// GET /api/marketplace/catalog — serve curated templates
router.get('/catalog', (req, res) => {
  try {
    const catalogPath = join(__dirname, '..', 'data', 'marketplace.json');
    if (!fs.existsSync(catalogPath)) {
      return res.json([]);
    }
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/search?q=term&page=1 — proxy Docker Hub search
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const pageSize = 24;
    if (!q.trim()) return res.json({ results: [], count: 0 });

    const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Docker Hub search failed' });
    }

    const data = await response.json();
    const results = (data.results || []).map(r => ({
      name: r.repo_name,
      description: r.short_description || '',
      stars: r.star_count || 0,
      pulls: r.pull_count || 0,
      official: r.is_official || false,
      automated: r.is_automated || false,
    }));

    res.json({ results, count: data.count || 0, page, pageSize });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Docker Hub search timed out' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
