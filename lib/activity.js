const Activity = require('../models/activity');

/*
 * Activity is advisory: a failed insert must never fail the request that produced
 * the event, so the promise is intentionally not awaited. Log lines never include
 * credentials or request bodies.
 */
const recordActivity = ({ type, actor, summary, targetType = 'system', targetId = null }) => {
  Promise.resolve()
    .then(() => Activity.create({
      type,
      actor: actor?._id || null,
      actorRole: actor?.role || 'system',
      summary: String(summary).slice(0, 200),
      targetType,
      targetId,
    }))
    .catch(() => {
      console.warn(`Activity log write failed for type "${type}".`);
    });
};

module.exports = { recordActivity };
