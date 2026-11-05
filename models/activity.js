const mongoose = require('mongoose');

/*
 * Only events that cannot be reconstructed from existing records are stored here:
 * sign-ins and administrator actions. Registrations, bookings and cancellations are
 * derived from the timestamps already present on users, hospitals and appointments,
 * so nothing is counted twice in the activity feed.
 */
const ActivitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'login',
      'admin.user.status',
      'admin.doctor.verification',
      'admin.hospital.created',
      'admin.hospital.updated',
      'admin.hospital.deleted',
    ],
    index: true,
  },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorRole: { type: String, enum: ['patient', 'doctor', 'admin', 'system'], default: 'system' },
  summary: { type: String, required: true, trim: true, maxlength: 200 },
  targetType: { type: String, enum: ['user', 'doctorProfile', 'hospital', 'session', 'system'], default: 'system' },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

ActivitySchema.index({ createdAt: -1 });

module.exports = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);
