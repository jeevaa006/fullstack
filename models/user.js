const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['patient', 'doctor', 'admin'], default: 'patient', immutable: true },
  phone: { type: String, trim: true, maxlength: 25, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

UserSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};
UserSchema.methods.toJSON = function toJSON() {
  const value = this.toObject();
  delete value.password;
  delete value.__v;
  return value;
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
