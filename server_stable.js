require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const routes = require('./routes/api');

const app = express();
const normalizeOrigin = (origin) => {
  try { return new URL(origin.trim()).origin; } catch { return origin.trim(); }
};
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map(normalizeOrigin);
const isSameHost = (origin, host) => {
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
};
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }));
app.use((req, res, next) => cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(normalizeOrigin(origin)) || isSameHost(origin, req.get('host') || '')) return callback(null, true);
  return callback(new Error('This origin is not allowed by CORS.'));
}, credentials: true })(req, res, next));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

let mongoUri = process.env.MONGODB_URI || process.env.MONGO_DB_URI;

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/health/db' || req.path === '/v1/auth/logout' || req.path.startsWith('/v1/health-information/')) return next();
  if (req.path.startsWith('/v1') && mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'The database is currently unavailable. Please try again later.' });
  next();
});
app.use('/api', routes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (error) => {
    if (error) next();
  });
});
app.use((err, _req, res, _next) => {
  if (err.message === 'This origin is not allowed by CORS.') return res.status(403).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function connectWithRetry() {
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await mongoose.connect(mongoUri, { 
        serverSelectionTimeoutMS: 15000, 
        connectTimeoutMS: 15000,
        socketTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000
      });
      console.log('✅ MongoDB connected.');
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, error.message);
      if (i < maxRetries - 1) {
        console.log(`Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  console.error('❌ Could not connect to MongoDB after multiple attempts.');
}

function startServer() {
  const port = Number(process.env.PORT) || 5000;
  const server = app.listen(port, '0.0.0.0', () => console.log(`✅ CareBridge server listening on port ${port}.`));
  
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected - attempting auto-reconnect...');
    connectWithRetry();
  });
  mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected.'));
  mongoose.connection.on('error', (error) => console.error('❌ MongoDB error:', error.message));
  
  return server;
}

async function start() {
  await connectWithRetry();
  startServer();
}

if (require.main === module) start();
module.exports = { app, start };
