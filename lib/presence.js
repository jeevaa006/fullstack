const User = require('../models/user');

/*
 * Presence is derived from real authenticated traffic. Every protected request and
 * every heartbeat from an open tab updates `lastActiveAt`, and the analytics views
 * count a user as online only while that timestamp is inside the window below.
 * Nothing counts registered or remembered accounts as "online".
 */
const ONLINE_WINDOW_SECONDS = 300;
const ONLINE_WINDOW_MS = ONLINE_WINDOW_SECONDS * 1000;
const WRITE_THROTTLE_MS = 60 * 1000;
const MAX_TRACKED_USERS = 5000;

const recentWrites = new Map();

const onlineWindowStart = (now = Date.now()) => new Date(now - ONLINE_WINDOW_MS);

/*
 * Called from the authentication middleware. The in-process map avoids a database
 * write per request; the conditional update makes the same guarantee across serverless
 * instances, where two warm containers may both hold state for one user.
 */
function touchPresence(user, now = Date.now()) {
  if (!user || !user._id) return Promise.resolve(false);
  const key = String(user._id);
  if ((recentWrites.get(key) || 0) > now - WRITE_THROTTLE_MS) return Promise.resolve(false);
  recentWrites.set(key, now);
  if (recentWrites.size > MAX_TRACKED_USERS) recentWrites.clear();
  const cutoff = new Date(now - WRITE_THROTTLE_MS);
  return User.updateOne(
    { _id: user._id, $or: [{ lastActiveAt: { $exists: false } }, { lastActiveAt: null }, { lastActiveAt: { $lt: cutoff } }] },
    { $set: { lastActiveAt: new Date(now) } },
  ).then(() => true).catch(() => {
    recentWrites.delete(key);
    return false;
  });
}

module.exports = { ONLINE_WINDOW_MS, ONLINE_WINDOW_SECONDS, onlineWindowStart, touchPresence };
