const mongoose = require('mongoose');

/*
 * CareBridge runs as a long-lived process locally and as a Vercel Function in
 * production. Vercel loads this module and calls the exported Express app, so the
 * connection must be established lazily from a request instead of from a listener
 * startup path. The cache lives on globalThis so warm serverless invocations reuse
 * the same connection rather than opening one per request.
 */
const globalCache = globalThis;
if (!globalCache.__carebridgeDatabase) {
  globalCache.__carebridgeDatabase = {
    connection: null,
    promise: null,
    lastFailureAt: 0,
    lastError: null,
    lastLoggedAt: 0,
  };
}
const cached = globalCache.__carebridgeDatabase;

const options = {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
};

// After a failed attempt, later requests reuse the failure for a moment instead of
// starting a new handshake per request. The next attempt after the cooldown retries.
const RETRY_COOLDOWN_MS = 2000;
const ERROR_LOG_INTERVAL_MS = 30000;

function connectionUri() {
  return process.env.MONGODB_URI || process.env.MONGO_DB_URI;
}

// Error messages and stack traces can carry the connection string. Never let a
// credential reach a log line or an HTTP response.
function redactSecrets(value) {
  return String(value == null ? '' : value)
    .replace(/mongodb(\+srv)?:\/\/[^\s"'`]*/gi, 'mongodb$1://[redacted]')
    .replace(/\/\/[^\s/@:]+:[^\s/@]+@/g, '//[redacted]@');
}

function describeDatabaseError(error) {
  if (!error) return 'unknown database error';
  const code = error.code || error.name || 'connection error';
  return `${code}: ${redactSecrets(error.message || 'no message')}`;
}

function logDatabaseFailure(error) {
  const now = Date.now();
  if (now - cached.lastLoggedAt < ERROR_LOG_INTERVAL_MS) return;
  cached.lastLoggedAt = now;
  console.error(`MongoDB connection failed (${describeDatabaseError(error)}). Database-backed requests return HTTP 503 until it reconnects.`);
}

function configurationError() {
  const error = new Error('MONGODB_URI is not configured. Set it in the environment; no connection string is ever read from the repository.');
  error.code = 'DATABASE_CONFIGURATION_ERROR';
  return error;
}

async function connectToDatabase({ force = false } = {}) {
  // A live connection (including one opened by another module, such as the test
  // bootstrap) is reused as-is.
  if (mongoose.connection.readyState === 1) {
    cached.connection = mongoose.connection;
    return cached.connection;
  }

  const uri = connectionUri();
  if (!uri) throw configurationError();

  if (!cached.promise) {
    if (!force && cached.lastError && Date.now() - cached.lastFailureAt < RETRY_COOLDOWN_MS) {
      throw cached.lastError;
    }
    cached.promise = mongoose.connect(uri, options).then(() => {
      cached.lastFailureAt = 0;
      cached.lastError = null;
      cached.connection = mongoose.connection;
      return cached.connection;
    });
  }

  try {
    const connection = await cached.promise;
    cached.connection = connection || mongoose.connection;
    return cached.connection;
  } catch (error) {
    // Drop the rejected promise so the next request retries instead of reusing it.
    cached.promise = null;
    cached.connection = null;
    cached.lastFailureAt = Date.now();
    cached.lastError = error;
    logDatabaseFailure(error);
    throw error;
  }
}

module.exports = { connectToDatabase, describeDatabaseError, redactSecrets };
