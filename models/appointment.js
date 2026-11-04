const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  appointmentDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
  consultationMode: { type: String, enum: ['in-person', 'online'], default: 'in-person' },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed'], default: 'Pending' },
}, { timestamps: true });

// Terminal appointments release a slot; active bookings alone participate in the unique key.
AppointmentSchema.index(
  { doctor: 1, appointmentDate: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['Pending', 'Confirmed'] } } },
);

module.exports = mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);
