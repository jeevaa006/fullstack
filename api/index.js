const { connectToDatabase } = require('../lib/database');
const { app } = require('../index');

/*
 * Vercel serverless entry point. The build output (client/dist) is served by
 * Vercel's CDN, so this function only handles /api requests. The Express app is
 * reused unchanged, keeping the existing routes and role checks identical.
 */
module.exports = async function handler(req, res) {
  try {
    await connectToDatabase();
  } catch (error) {
    // Database-backed endpoints answer HTTP 503 through the app's existing guard.
    // The base /api/health endpoint must keep responding even when MongoDB is down.
    console.error(`[carebridge] database unavailable: ${error.code || error.name || 'connection error'}`);
  }

  const originalUrl = req.url || '/';
  if (originalUrl !== '/api' && !originalUrl.startsWith('/api/')) {
    req.url = `/api${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
  }

  return app(req, res);
};
