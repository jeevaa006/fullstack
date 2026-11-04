require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const routes = require('./routes/api');
const { connectToDatabase } = require('./lib/database');

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
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  } : false,
}));
app.use((req, res, next) => cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(normalizeOrigin(origin)) || isSameHost(origin, req.get('host') || '')) return callback(null, true);
  return callback(new Error('This origin is not allowed by CORS.'));
}, credentials: true })(req, res, next));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/health/db' || req.path === '/v1/auth/logout' || req.path.startsWith('/v1/health-information/') || req.path.startsWith('/v1/news/') || req.path.startsWith('/v1/research') || req.path.startsWith('/v1/hospitals/nearby')) return next();
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

async function start() {
  if (process.env.NODE_ENV !== 'test') {
    await connectToDatabase().catch((error) => {
      console.error(`MongoDB unavailable (${error.code || error.name || 'connection error'}); database-backed requests will return HTTP 503.`);
    });
  }
  const port = Number(process.env.PORT) || 5000;
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected.'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected.'));
  mongoose.connection.on('error', (error) => console.error(`MongoDB connection error (${error.name || 'connection error'}).`));
  const server = app.listen(port, '0.0.0.0', () => console.log(`CareBridge server listening on port ${port}.`));
  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return server;
}

if (require.main === module) start();
module.exports = { app };
