import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth.js';
import containerRoutes from './routes/containers.js';
import settingsRoutes from './routes/settings.js';
import imageRoutes from './routes/images.js';
import volumeRoutes from './routes/volumes.js';
import networkRoutes from './routes/networks.js';
import marketplaceRoutes from './routes/marketplace.js';
import backupRoutes from './routes/backup.js';
import { followLogs, streamEvents } from './services/dockerService.js';
import { createPtySession } from './services/ptyService.js';
import { runAutoStart, scheduleAutoUpdates } from './services/autoUpdate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'bosun_jwt_secret_change_me_in_prod';
const DATA_DIR = process.env.BOSUN_DATA_DIR || '/home/bosun';
const PORT = 4080;

// Ensure data subdirectories exist
const subdirs = ['configs', 'compose', 'data'];
for (const sub of subdirs) {
  const dir = join(DATA_DIR, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Make io available to routes via app.get('io')
app.set('io', io);

// JWT auth middleware for socket.io
function verifySocketToken(socket, next) {
  const token = socket.handshake.auth?.token;
  const authentikUser = socket.handshake.auth?.authentikUser;
  if (authentikUser) {
    socket.user = { username: authentikUser };
    return next();
  }
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
}

// /logs namespace — stream container logs
const logsNs = io.of('/logs');
logsNs.use(verifySocketToken);
logsNs.on('connection', (socket) => {
  let cleanup = null;
  socket.on('start', async ({ containerId }) => {
    if (!containerId) return;
    try {
      cleanup = await followLogs(
        containerId,
        (data) => socket.emit('data', data),
        () => socket.emit('end')
      );
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
  socket.on('disconnect', () => {
    if (cleanup) cleanup();
  });
});

// /console namespace — exec PTY session
const consoleNs = io.of('/console');
consoleNs.use(verifySocketToken);
consoleNs.on('connection', (socket) => {
  socket.on('start', ({ containerId }) => {
    if (!containerId) return;
    createPtySession(containerId, socket);
  });
});

// /pull namespace — image pull progress (clients subscribe, server emits)
const pullNs = io.of('/pull');
pullNs.use(verifySocketToken);
pullNs.on('connection', (socket) => {
  // Clients just connect and listen for 'event' messages
  // No special setup needed — events are broadcast to the namespace
});

// /events namespace — Docker daemon event stream
const eventsNs = io.of('/events');
eventsNs.use(verifySocketToken);
eventsNs.on('connection', (socket) => {
  const cleanup = streamEvents((event) => {
    socket.emit('event', event);
  });
  socket.on('disconnect', cleanup);
});

// Express middleware
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/volumes', volumeRoutes);
app.use('/api/networks', networkRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/backup', backupRoutes);

// Serve built React frontend
const frontendDist = join(__dirname, 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback: all non-API routes return index.html
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'Bosun API running. Frontend not built.' });
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Startup tasks
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Bosun listening on port ${PORT}`);
  try {
    await runAutoStart();
    console.log('AutoStart scan complete');
  } catch (err) {
    console.error('AutoStart error:', err.message);
  }
  try {
    scheduleAutoUpdates(io);
    console.log('AutoUpdate scheduler started');
  } catch (err) {
    console.error('AutoUpdate scheduler error:', err.message);
  }
});
