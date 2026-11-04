const mongoose = require('mongoose');

const CoordinateSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true },
  coordinates: { type: [Number], required: true, validate: { validator: (point) => point.length === 2, message: 'Coordinates require longitude and latitude.' } },
}, { _id: false });

const HospitalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  address: { type: String, required: true, trim: true, maxlength: 400 },
  district: { type: String, required: true, trim: true, maxlength: 100 },
  contact: { type: String, trim: true, maxlength: 40, default: '' },
  services: { type: [String], default: [] },
  coordinates: { type: CoordinateSchema, default: undefined },
  source: { type: String, trim: true, maxlength: 160, default: 'CareBridge administrator' },
  sourceUpdatedAt: { type: Date, default: undefined },
  published: { type: Boolean, default: false },
}, { timestamps: true });
HospitalSchema.index({ district: 1, published: 1 });
module.exports = mongoose.models.Hospital || mongoose.model('Hospital', HospitalSchema);
