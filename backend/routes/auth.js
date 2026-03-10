import { Router } from 'express';
import fs from 'fs';
import { join } from 'path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authMiddleware, { checkFirstRun } from '../middleware/authMiddleware.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bosun_jwt_secret_change_me_in_prod';
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';

function getUsersFile() {
  return join(DATA_DIR, 'data', 'users.json');
}

function readUsers() {
  const file = getUsersFile();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  const file = getUsersFile();
  fs.mkdirSync(join(DATA_DIR, 'data'), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(users, null, 2), 'utf8');
}

function signToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
}

// GET /api/auth/status — public, no auth required
router.get('/status', (req, res) => {
  const firstRun = checkFirstRun();
  // Check if request came through Authentik forward auth
  const authentikUser = req.headers['x-authentik-username'];
  res.json({
    firstRun,
    authenticated: !!authentikUser,
    authentikUser: authentikUser || null
  });
});

// POST /api/auth/setup — first-run account creation
router.post('/setup', async (req, res) => {
  try {
    if (!checkFirstRun()) {
      return res.status(400).json({ error: 'Setup already completed' });
    }
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const users = [{
      username,
      passwordHash,
      createdAt: new Date().toISOString()
    }];
    writeUsers(users);
    const token = signToken(username);
    res.json({ token, username });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const users = readUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(username);
    res.json({ token, username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password — authenticated
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === req.user.username);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(currentPassword, users[userIndex].passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    users[userIndex].passwordHash = await bcrypt.hash(newPassword, 12);
    users[userIndex].updatedAt = new Date().toISOString();
    writeUsers(users);
    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — authenticated
router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

export default router;
