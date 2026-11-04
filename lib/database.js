const mongoose = require('mongoose');

/*
 * A single cached connection is shared between serverless invocations in the same
 * container. Without this, every Vercel request would open a new MongoDB connection.
 */
const globalCache = globalThis;
if (!globalCache.__carebridgeDatabase) {
  globalCache.__carebridgeDatabase = { connection: null, promise: null };
}
const cached = globalCache.__carebridgeDatabase;

const options = {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
};

function connectionUri() {
  return process.env.MONGODB_URI || process.env.MONGO_DB_URI;
}

async function connectToDatabase() {
  if (cached.connection && mongoose.connection.readyState === 1) return cached.connection;
  const uri = connectionUri();
  if (!uri) {
    const error = new Error('MONGODB_URI is not configured.');
    error.code = 'DATABASE_CONFIGURATION_ERROR';
    throw error;
  }
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, options).then(() => mongoose.connection);
  }
  try {
    cached.connection = await cached.promise;
    return cached.connection;
  } catch (error) {
    // Reset so the next request can retry instead of reusing a rejected promise.
    cached.promise = null;
    cached.connection = null;
    throw error;
  }
}

module.exports = { connectToDatabase };
