require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');

async function seedAdmin() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_DB_URI;
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error('Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters) in your private environment before running this script.');
  }
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    if (existing.role !== 'admin') throw new Error('That email already belongs to a non-admin account; choose a dedicated admin email.');
    existing.name = ADMIN_NAME.trim();
    existing.password = ADMIN_PASSWORD;
    existing.status = 'active';
    await existing.save();
    console.log(`Administrator account updated for ${email}.`);
  } else {
    await User.create({ name: ADMIN_NAME.trim(), email, password: ADMIN_PASSWORD, role: 'admin' });
    console.log(`Administrator account created for ${email}.`);
  }
  await mongoose.disconnect();
}
seedAdmin().catch(async (error) => { console.error(error.message); if (mongoose.connection.readyState) await mongoose.disconnect(); process.exitCode = 1; });
