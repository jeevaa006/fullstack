const mongoose = require('mongoose');

const SlotSchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
}, { _id: false });

const DoctorProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialization: { type: String, required: true, trim: true, maxlength: 100 },
  qualification: { type: String, required: true, trim: true, maxlength: 200 },
  experienceYears: { type: Number, required: true, min: 0, max: 80 },
  consultationFee: { type: Number, required: true, min: 0, max: 100000 },
  hospital: { type: String, trim: true, maxlength: 150, default: '' },
  district: { type: String, required: true, trim: true, maxlength: 100 },
  biography: { type: String, trim: true, maxlength: 1200, default: '' },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  availability: { type: [SlotSchema], default: [] },
}, { timestamps: true });

DoctorProfileSchema.index({ verificationStatus: 1, specialization: 1, district: 1 });
module.exports = mongoose.models.DoctorProfile || mongoose.model('DoctorProfile', DoctorProfileSchema);
