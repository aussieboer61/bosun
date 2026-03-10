import jwt from 'jsonwebtoken';
import fs from 'fs';
import { join } from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'bosun_jwt_secret_change_me_in_prod';
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

export function checkFirstRun() {
  const usersFile = join(DATA_DIR, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) return true;
  try {
    const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    return !Array.isArray(data) || data.length === 0;
  } catch {
    return true;
  }
}

export default function authMiddleware(req, res, next) {
  // Trust Authentik forward auth header (set by Caddy/Authentik)
  const authentikUser = req.headers['x-authentik-username'];
  if (authentikUser) {
    req.user = { username: authentikUser };
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
