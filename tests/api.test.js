require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const { app } = require('../index');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const Appointment = require('../models/appointment');
const Hospital = require('../models/hospital');
const MedicineReminder = require('../models/medicineReminder');

const runTag = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
const created = { users: [], profiles: [], appointments: [], hospitals: [], reminders: [] };
const uniqueEmail = (label) => `${label}.${runTag}.${Math.random().toString(36).slice(2)}@example.test`;
const patientInfo = (email = uniqueEmail('patient')) => ({ name: 'Test Patient', email, password: 'patient-test-password-1', phone: '555-0100' });
const doctorInfo = (email = uniqueEmail('doctor')) => ({ name: 'Test Doctor', email, password: 'doctor-test-password-1', specialization: 'Family Medicine', qualification: 'MBBS', experienceYears: 6, consultationFee: 300, district: 'Coimbatore', hospital: 'Community Clinic' });
const futureDate = (days = 3) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

before(async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_DB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required for integration tests.');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 12000 });
  for (const model of [User, DoctorProfile, Appointment, Hospital, MedicineReminder]) {
    const found = await mongoose.connection.db.listCollections({ name: model.collection.name }).hasNext();
    if (!found) throw new Error(`MongoDB must have the ${model.collection.name} collection and permissions configured before running integration tests.`);
  }
});
after(async () => {
  if (mongoose.connection.readyState === 1) {
    // Delete only documents created by this test run; do not clear collections or drop the configured workspace database.
    await Promise.all([
      Appointment.deleteMany({ _id: { $in: created.appointments } }),
      MedicineReminder.deleteMany({ _id: { $in: created.reminders } }),
      Hospital.deleteMany({ _id: { $in: created.hospitals } }),
      DoctorProfile.deleteMany({ _id: { $in: created.profiles } }),
      User.deleteMany({ _id: { $in: created.users } }),
    ]);
    await mongoose.disconnect();
  }
});

async function registerPatient(email = uniqueEmail('patient')) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register/patient').send(patientInfo(email));
  assert.equal(response.status, 201, JSON.stringify(response.body));
  created.users.push(response.body.user.id);
  return { agent, user: response.body.user };
}
async function registerDoctor() {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register/doctor').send(doctorInfo());
  assert.equal(response.status, 201, JSON.stringify(response.body));
  created.users.push(response.body.user.id);
  created.profiles.push(response.body.profile._id);
  return { agent, user: response.body.user, profile: response.body.profile };
}
async function createAdmin() {
  const email = uniqueEmail('admin');
  const admin = await User.create({ name: 'Test Admin', email, password: 'admin-test-password-1', role: 'admin' });
  created.users.push(admin._id);
  const agent = request.agent(app);
  const login = await agent.post('/api/v1/auth/login').send({ email, password: 'admin-test-password-1' });
  assert.equal(login.status, 200);
  return agent;
}
async function approvedDoctorWithSlot() {
  const doctor = await registerDoctor();
  const admin = await createAdmin();
  const review = await admin.patch(`/api/v1/admin/doctors/${doctor.user.id}/verification`).send({ status: 'approved' });
  assert.equal(review.status, 200);
  const slot = await doctor.agent.put('/api/v1/doctors/me/availability').send({ availability: [{ date: futureDate(), startTime: '10:00', endTime: '10:30' }] });
  assert.equal(slot.status, 200, JSON.stringify(slot.body));
  return { ...doctor, admin };
}

test('patient registration validates and normalizes duplicate emails, hashes passwords, and supports login', async () => {
  const invalid = await request(app).post('/api/v1/auth/register/patient').send({ name: 'A', email: 'bad', password: 'short' });
  assert.equal(invalid.status, 400);
  const email = uniqueEmail('person');
  const agent = request.agent(app);
  const first = await agent.post('/api/v1/auth/register/patient').send(patientInfo(` ${email.toUpperCase()} `));
  assert.equal(first.status, 201);
  created.users.push(first.body.user.id);
  assert.equal(first.body.user.email, email.toLowerCase());
  assert.equal(first.body.user.password, undefined);
  assert.match(first.headers['set-cookie'][0], /HttpOnly/i);
  assert.equal((await agent.post('/api/v1/auth/register/patient').send(patientInfo(email))).status, 409);
  const stored = await User.findOne({ email }).select('+password');
  assert.notEqual(stored.password, patientInfo().password);
  assert.equal(await stored.comparePassword(patientInfo().password), true);
  assert.equal((await request.agent(app).post('/api/v1/auth/login').send({ email, password: 'wrong-password' })).status, 401);
  assert.equal((await agent.get('/api/v1/auth/me')).body.user.role, 'patient');
  const updated = await agent.patch('/api/v1/auth/profile').send({ name: 'Updated Test Patient', phone: '555-0199' });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.user.name, 'Updated Test Patient');
  assert.equal(updated.body.user.password, undefined);
  assert.equal(updated.body.user.preferredLanguage, undefined);
  assert.equal((await User.findById(first.body.user.id)).name, 'Updated Test Patient');
});

test('server enforces role restrictions and doctor review before public search', async () => {
  const doctor = await registerDoctor();
  const patient = await registerPatient();
  assert.equal(doctor.profile.verificationStatus, 'pending');
  // The workspace database contains approved directory records, so assert that this pending
  // profile specifically is excluded rather than assuming the whole directory is empty.
  const publicBefore = await request(app).get('/api/v1/doctors?limit=50');
  assert.equal(publicBefore.body.doctors.some((item) => item.user?._id === doctor.user.id), false);
  assert.equal((await patient.agent.get('/api/v1/admin/stats')).status, 403);
  assert.equal((await doctor.agent.patch(`/api/v1/admin/doctors/${doctor.user.id}/verification`).send({ status: 'approved' })).status, 403);
  const admin = await createAdmin();
  assert.equal((await admin.patch(`/api/v1/admin/doctors/${doctor.user.id}/verification`).send({ status: 'approved' })).status, 200);
  const filtered = await request(app).get('/api/v1/doctors?specialization=family&district=coimbatore&name=test');
  assert.ok(filtered.body.doctors.some((item) => item.user.name === 'Test Doctor'));
});

test('doctor details and availability load for profiles stored without an availability field', async () => {
  const doctor = await registerDoctor();
  const admin = await createAdmin();
  await admin.patch(`/api/v1/admin/doctors/${doctor.user.id}/verification`).send({ status: 'approved' });
  // Simulate records written directly into MongoDB before the schema default existed.
  await mongoose.connection.db.collection('doctorprofiles').updateOne(
    { user: new mongoose.Types.ObjectId(doctor.user.id) },
    { $unset: { availability: '' }, $set: { name: 'Legacy Demo Doctor', hospitalName: 'Legacy Community Centre', isDemo: true } },
  );
  const detail = await request(app).get(`/api/v1/doctors/${doctor.user.id}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.doctor.name, 'Legacy Demo Doctor');
  assert.equal(detail.body.doctor.hospital, 'Legacy Community Centre');
  assert.deepEqual(detail.body.doctor.availability, []);
  assert.equal(detail.body.doctor.user.email, undefined, 'doctor details must not expose account email');
  const availability = await request(app).get(`/api/v1/doctors/${doctor.user.id}/availability`);
  assert.equal(availability.status, 200, JSON.stringify(availability.body));
  assert.deepEqual(availability.body.availability, []);
  const ownAvailability = await doctor.agent.get('/api/v1/doctors/me/availability');
  assert.equal(ownAvailability.status, 200, JSON.stringify(ownAvailability.body));
  assert.deepEqual(ownAvailability.body.availability, []);
});

test('doctor details reject invalid identifiers and availability requires authentication', async () => {
  assert.equal((await request(app).get('/api/v1/doctors/notanid')).status, 400);
  assert.equal((await request(app).get('/api/v1/doctors/000000000000000000000000')).status, 404);
  assert.equal((await request(app).get('/api/v1/doctors/me/availability')).status, 401);
});

test('appointment booking persists and rejects duplicate active slot requests', async () => {
  const { user: doctorUser, agent: doctor } = await approvedDoctorWithSlot();
  const first = await registerPatient();
  const second = await registerPatient();
  const booking = { doctorId: doctorUser.id, appointmentDate: futureDate(), startTime: '10:00', reason: 'General health consultation' };
  const results = await Promise.all([first.agent.post('/api/v1/appointments').send(booking), second.agent.post('/api/v1/appointments').send(booking)]);
  assert.deepEqual(results.map((item) => item.status).sort(), [201, 409]);
  const appointment = results.find((item) => item.status === 201).body.appointment;
  created.appointments.push(appointment._id);
  assert.equal(await Appointment.countDocuments({ _id: appointment._id, status: 'Pending' }), 1);
  const confirmed = await doctor.patch(`/api/v1/appointments/${appointment._id}/status`).send({ status: 'Confirmed' });
  assert.equal(confirmed.body.appointment.status, 'Confirmed');
});

test('appointment privacy and status transitions are enforced by owner role', async () => {
  const { user: doctorUser, agent: doctor } = await approvedDoctorWithSlot();
  const patient = await registerPatient();
  const stranger = await registerPatient();
  const createdResponse = await patient.agent.post('/api/v1/appointments').send({ doctorId: doctorUser.id, appointmentDate: futureDate(), startTime: '10:00', reason: 'General health consultation' });
  assert.equal(createdResponse.status, 201);
  const id = createdResponse.body.appointment._id;
  created.appointments.push(id);
  assert.equal((await stranger.agent.get(`/api/v1/appointments/${id}`)).status, 403);
  assert.equal((await stranger.agent.patch(`/api/v1/appointments/${id}/status`).send({ status: 'Cancelled' })).status, 403);
  assert.equal((await patient.agent.patch(`/api/v1/appointments/${id}/status`).send({ status: 'Completed' })).status, 409);
  assert.equal((await doctor.patch(`/api/v1/appointments/${id}/status`).send({ status: 'Confirmed' })).status, 200);
  assert.equal((await doctor.patch(`/api/v1/appointments/${id}/status`).send({ status: 'Completed' })).status, 200);
});

test('reminder validation and ownership protect patient CRUD', async () => {
  const owner = await registerPatient();
  const stranger = await registerPatient();
  assert.equal((await owner.agent.post('/api/v1/reminders').send({ medicineName: 'Patient reminder', reminderTime: '09:00', startDate: '2026-12-20', endDate: '2026-12-01' })).status, 400);
  const response = await owner.agent.post('/api/v1/reminders').send({ medicineName: 'Patient-entered reminder', reminderTime: '09:00', startDate: futureDate(), endDate: futureDate(8), instructions: 'Personal note' });
  assert.equal(response.status, 201);
  created.reminders.push(response.body.reminder._id);
  assert.equal((await owner.agent.get('/api/v1/reminders')).body.reminders.length, 1);
  assert.equal((await stranger.agent.patch(`/api/v1/reminders/${response.body.reminder._id}`).send({ active: false })).status, 404);
  assert.equal((await owner.agent.patch(`/api/v1/reminders/${response.body.reminder._id}`).send({ active: false })).body.reminder.active, false);
  assert.equal((await owner.agent.delete(`/api/v1/reminders/${response.body.reminder._id}`)).status, 200);
  assert.equal((await owner.agent.get('/api/v1/reminders')).body.reminders.length, 0);
});

test('admin hospital publication gates public search and statistics count persisted rows', async () => {
  const admin = await createAdmin();
  assert.equal((await request(app).post('/api/v1/admin/hospitals').send({ name: 'Hidden Test Centre', address: 'Test address', district: 'Coimbatore', published: true })).status, 401);
  const response = await admin.post('/api/v1/admin/hospitals').send({ name: 'Test Health Centre', address: 'Test address', district: 'Coimbatore', services: ['General'], published: false });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  created.hospitals.push(response.body.hospital._id);
  // Published demo centres already exist in Coimbatore, so check this record's visibility.
  const hidden = await request(app).get('/api/v1/hospitals?district=Coimbatore&limit=50');
  assert.equal(hidden.body.hospitals.some((item) => item._id === response.body.hospital._id), false);
  await admin.patch(`/api/v1/admin/hospitals/${response.body.hospital._id}`).send({ published: true });
  const published = await request(app).get('/api/v1/hospitals?district=Coimbatore&limit=50');
  assert.equal(published.body.hospitals.some((item) => item._id === response.body.hospital._id), true);
  assert.equal((await admin.get('/api/v1/admin/stats')).body.hospitals >= 1, true);
});

test('health endpoints report service and usable MongoDB status without leaking configuration', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
  const database = await request(app).get('/api/health/db');
  assert.equal(database.status, 200);
  assert.deepEqual(database.body, { status: 'ok', database: 'connected' });
  assert.doesNotMatch(JSON.stringify(database.body), /mongodb(?:\+srv)?:\/\/|password|stack/i);
});

test('MedlinePlus search validates input, returns attributed safe topics, and caches repeated queries', async () => {
  assert.equal((await request(app).get('/api/v1/health-information/search?q=x')).status, 400);
  const first = await request(app).get('/api/v1/health-information/search?q=diabetes');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.source, 'MedlinePlus.gov');
  assert.equal(first.body.language, 'en');
  assert.equal(first.body.cached, false);
  assert.ok(first.body.topics.length > 0, 'live MedlinePlus request should return health topics');
  assert.ok(first.body.topics.every((topic) => topic.url.startsWith('https://medlineplus.gov/') && !/<[^>]+>/.test(topic.summary)));
  const repeated = await request(app).get('/api/v1/health-information/search?q=Diabetes');
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.cached, true);
});

test('hospital coordinate validation accepts GeoJSON order and rejects invalid ranges', async () => {
  const admin = await createAdmin();
  const invalid = await admin.post('/api/v1/admin/hospitals').send({ name: 'Invalid Coordinate Centre', address: 'Test address', district: 'Coimbatore', coordinates: [300, 20] });
  assert.equal(invalid.status, 400);
  const createdResponse = await admin.post('/api/v1/admin/hospitals').send({ name: 'Mapped Test Centre', address: 'Test address', district: 'Coimbatore', coordinates: [76.95, 11.01], published: true });
  assert.equal(createdResponse.status, 201, JSON.stringify(createdResponse.body));
  created.hospitals.push(createdResponse.body.hospital._id);
  const listed = await request(app).get('/api/v1/hospitals?q=Mapped+Test+Centre');
  assert.deepEqual(listed.body.hospitals[0].coordinates.coordinates, [76.95, 11.01]);
});
