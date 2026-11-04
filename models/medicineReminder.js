const mongoose = require('mongoose');

const MedicineReminderSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  medicineName: { type: String, required: true, trim: true, maxlength: 120 },
  instructions: { type: String, trim: true, maxlength: 300, default: '' },
  reminderTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  active: { type: Boolean, default: true },
}, { timestamps: true });
MedicineReminderSchema.pre('validate', function validateDateRange() {
  if (this.startDate && this.endDate && this.endDate < this.startDate) this.invalidate('endDate', 'End date must be on or after start date.');
});
module.exports = mongoose.models.MedicineReminder || mongoose.model('MedicineReminder', MedicineReminderSchema);
