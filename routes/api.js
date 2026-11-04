const express = require('express');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const Appointment = require('../models/appointment');
const Hospital = require('../models/hospital');
const MedicineReminder = require('../models/medicineReminder');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { nearbyFacilities, medicalNews, recentResearch } = require('../services/healthData');

const router = express.Router();
// Authentication limits stay active in normal environments; the integration suite creates many
// accounts from one address, so it is exempted only when NODE_ENV is explicitly "test".
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });
const informationLimit = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const externalDataLimit = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const healthTopicCache = new Map();
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false, trimValues: true, htmlEntities: false });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  status: user.status,
  createdAt: user.createdAt,
});
const fail = (res, status, message) => res.status(status).json({ error: message });
const validId = (id) => mongoose.isValidObjectId(id);
const regex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error('Authentication is not configured. The server administrator must set JWT_SECRET to a random value of at least 32 characters.');
    error.status = 503;
    error.code = 'AUTH_CONFIGURATION_ERROR';
    throw error;
  }
  return secret;
}
function issueCookie(res, user) {
  const token = jwt.sign({ sub: user._id.toString() }, getJwtSecret(), { expiresIn: '7d' });
  res.cookie('carebridge_token', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, path: '/',
  });
}

async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.carebridge_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(res, 401, 'Please sign in to continue.');
    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') return fail(res, 401, 'This account is unavailable.');
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return fail(res, 401, 'Your session is invalid or expired. Please sign in again.');
    next(error);
  }
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : fail(res, 403, 'You do not have permission to do that.');
const auth = (...roles) => [authenticate, ...(roles.length ? [allow(...roles)] : [])];
const validBody = (body, fields) => fields.every((field) => typeof body[field] === 'string' && body[field].trim().length > 0);
const isValidDay = (value) => DAY_RE.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const getPage = (query) => ({ page: Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1)), limit: Math.max(1, Math.min(50, Number.parseInt(query.limit, 10) || 12)) });
const appointmentPopulate = [{ path: 'patient', select: 'name email phone' }, { path: 'doctor', select: 'name email phone' }];

router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.get('/health/db', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    const result = await mongoose.connection.db.admin().ping();
    if (result.ok !== 1) return res.status(503).json({ status: 'unavailable', database: 'unavailable' });
    return res.json({ status: 'ok', database: 'connected' });
  } catch (_error) {
    return res.status(503).json({ status: 'unavailable', database: 'unavailable' });
  }
});

function plainText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const decoded = value.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
  return decoded.replace(/<[^>]*>/g, ' ').replace(/[\s\u0000-\u001f]+/g, ' ').trim().slice(0, maxLength);
}
function xmlText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(xmlText).join(' ');
  if (value && typeof value === 'object') return plainText(value['#text'] || '', 4000);
  return '';
}
function findDocuments(node) {
  if (!node || typeof node !== 'object') return [];
  if (node.document) return Array.isArray(node.document) ? node.document : [node.document];
  for (const value of Object.values(node)) { const found = findDocuments(value); if (found.length) return found; }
  return [];
}
function findTopicAttributes(node) {
  if (!node || typeof node !== 'object') return null;
  if (node['@_title'] && node['@_url']) return node;
  for (const value of Object.values(node)) {
    const found = findTopicAttributes(value);
    if (found) return found;
  }
  return null;
}
function mapHealthTopic(document) {
  const attrs = findTopicAttributes(document) || document;
  const url = attrs['@_url'];
  if (typeof url !== 'string' || !/^https:\/\/medlineplus\.gov\//i.test(url)) return null;
  const title = plainText(attrs['@_title'] || xmlText(attrs.title), 200);
  const summary = plainText(attrs['@_meta-desc'] || xmlText(attrs['full-summary'] || attrs.fullSummary || attrs.summary || attrs.snippet), 600);
  const categories = attrs['@_group'] ? [plainText(attrs['@_group'], 100)].filter(Boolean) : [];
  if (!title) return null;
  return { title, summary, categories, url, source: 'MedlinePlus.gov' };
}

router.get('/v1/hospitals/nearby', externalDataLimit, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().replace(/\s+/g, ' ') : '';
  const lat = Number(req.query.lat); const lon = Number(req.query.lon);
  const coordinatesProvided = req.query.lat !== undefined || req.query.lon !== undefined;
  if (query.length > 100 || /[<>\u0000-\u001f]/.test(query)) return fail(res, 400, 'Location search must be 100 characters or fewer.');
  if (!query && (!coordinatesProvided || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)) return fail(res, 400, 'Provide a district or address, or user-approved latitude and longitude.');
  try {
    const result = await nearbyFacilities({ query: query || undefined, lat, lon });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return res.json(result);
  } catch (error) {
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: 'Nearby OpenStreetMap facility data is temporarily unavailable. Use the CareBridge directory or try again later.' });
  }
});
router.get('/v1/news/medical', externalDataLimit, async (req, res) => {
  const topic = typeof req.query.topic === 'string' ? req.query.topic : 'healthcare';
  try { const result = await medicalNews(topic); res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900'); return res.json(result); }
  catch (error) { return res.status(400).json({ error: error.message === 'Choose a supported news topic.' ? error.message : 'Aggregated healthcare news is temporarily unavailable.' }); }
});
router.get('/v1/research', externalDataLimit, async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim().replace(/\s+/g, ' ') : '';
  if (query.length < 2 || query.length > 100 || /[<>\u0000-\u001f]/.test(query)) return fail(res, 400, 'Research query must contain 2–100 plain-text characters.');
  try { const result = await recentResearch(query); res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600'); return res.json(result); }
  catch (_error) { return res.status(502).json({ error: 'PubMed research is temporarily unavailable.' }); }
});

router.get('/v1/health-information/search', informationLimit, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().replace(/\s+/g, ' ') : '';
  if (query.length < 2 || query.length > 100 || /[<>\u0000-\u001f]/.test(query)) return fail(res, 400, 'Search query must contain 2–100 plain-text characters.');
  const cacheKey = query.toLocaleLowerCase('en');
  const cached = healthTopicCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json({ ...cached.payload, cached: true });
  const useStaleCache = () => cached && cached.expiresAt + 48 * 60 * 60 * 1000 > Date.now()
    ? res.json({ ...cached.payload, cached: true, stale: true })
    : null;
  const url = new URL('https://wsearch.nlm.nih.gov/ws/query');
  url.search = new URLSearchParams({ db: 'healthTopics', term: query, retmax: '10', rettype: 'topic', tool: 'carebridge' }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { headers: { accept: 'application/xml, text/xml' }, signal: controller.signal });
    if (!response.ok) {
      const staleResponse = useStaleCache();
      if (staleResponse) return staleResponse;
      return res.status(response.status === 429 ? 503 : 502).json({ error: response.status === 429 ? 'MedlinePlus is temporarily rate limited. Try again later.' : 'Health information is temporarily unavailable.' });
    }
    const xml = await response.text();
    if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !XMLValidator.validate(xml)) return fail(res, 502, 'Health information returned an invalid response.');
    const parsed = xmlParser.parse(xml);
    const topics = findDocuments(parsed).map(mapHealthTopic).filter(Boolean).slice(0, 10);
    const payload = { query, topics, source: 'MedlinePlus.gov', attribution: 'Health information from MedlinePlus.gov. MedlinePlus does not endorse CareBridge.', language: 'en', updated: 'MedlinePlus updates this service Tuesday–Saturday.' };
    if (healthTopicCache.size >= 1000) {
      for (const [key, entry] of healthTopicCache) if (entry.expiresAt <= Date.now()) healthTopicCache.delete(key);
      if (healthTopicCache.size >= 1000) healthTopicCache.delete(healthTopicCache.keys().next().value);
    }
    healthTopicCache.set(cacheKey, { payload, expiresAt: Date.now() + 18 * 60 * 60 * 1000 });
    return res.json({ ...payload, cached: false });
  } catch (error) {
    const staleResponse = useStaleCache();
    if (staleResponse) return staleResponse;
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: error.name === 'AbortError' ? 'Health information search timed out. Try again later.' : 'Health information is temporarily unavailable.' });
  } finally { clearTimeout(timeout); }
});

router.post('/v1/auth/register/patient', authLimit, async (req, res, next) => {
  try {
    getJwtSecret();
    const { name, password, phone = '' } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    if (!validBody({ ...req.body, email }, ['name', 'email', 'password']) || !EMAIL_RE.test(email) || password.length < 8 || password.length > 128 || name.trim().length < 2) return fail(res, 400, 'Enter a valid name, email and password (at least 8 characters).');
    const user = await User.create({ name: name.trim(), email: email.toLowerCase(), password, phone: String(phone).slice(0, 25), role: 'patient' });
    issueCookie(res, user);
    res.status(201).json({ user: safeUser(user) });
  } catch (error) { if (error.code === 11000) return fail(res, 409, 'An account with this email already exists.'); next(error); }
});

router.post('/v1/auth/register/doctor', authLimit, async (req, res, next) => {
  try {
    getJwtSecret();
    const { name, password, phone = '', specialization, qualification, experienceYears, consultationFee, hospital = '', district, biography = '' } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    if (!validBody({ ...req.body, email }, ['name', 'email', 'password', 'specialization', 'qualification', 'district']) || !EMAIL_RE.test(email) || password.length < 8 || password.length > 128) return fail(res, 400, 'Complete all required fields with a valid email and password (at least 8 characters).');
    const years = Number(experienceYears); const fee = Number(consultationFee);
    if (!Number.isFinite(years) || years < 0 || years > 80 || !Number.isFinite(fee) || fee < 0 || fee > 100000) return fail(res, 400, 'Experience or consultation fee is outside the allowed range.');
    const user = await User.create({ name: name.trim(), email: email.toLowerCase(), password, phone: String(phone).slice(0, 25), role: 'doctor' });
    try {
      const profile = await DoctorProfile.create({ user: user._id, specialization, qualification, experienceYears: years, consultationFee: fee, hospital, district, biography });
      issueCookie(res, user);
      return res.status(201).json({ user: safeUser(user), profile });
    } catch (error) { await User.deleteOne({ _id: user._id }); throw error; }
  } catch (error) { if (error.code === 11000) return fail(res, 409, 'An account with this email already exists.'); next(error); }
});

router.post('/v1/auth/login', authLimit, async (req, res, next) => {
  try {
    getJwtSecret();
    const email = String(req.body.email || '').trim().toLowerCase(); const password = req.body.password;
    if (!EMAIL_RE.test(email) || typeof password !== 'string') return fail(res, 400, 'Enter a valid email and password.');
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) return fail(res, 401, 'Email or password is incorrect.');
    if (user.status !== 'active') return fail(res, 403, 'This account has been deactivated.');
    issueCookie(res, user);
    res.json({ user: safeUser(user) });
  } catch (error) { next(error); }
});
router.post('/v1/auth/logout', (_req, res) => res.clearCookie('carebridge_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }).json({ message: 'Signed out.' }));
router.get('/v1/auth/me', ...auth(), async (req, res) => res.json({ user: safeUser(req.user) }));
router.patch('/v1/auth/profile', ...auth(), async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) { if (typeof req.body.name !== 'string' || req.body.name.trim().length < 2 || req.body.name.length > 100) return fail(res, 400, 'Name must be between 2 and 100 characters.'); updates.name = req.body.name.trim(); }
    if (req.body.phone !== undefined) { if (typeof req.body.phone !== 'string' || req.body.phone.length > 25) return fail(res, 400, 'Phone number is invalid.'); updates.phone = req.body.phone.trim(); }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
    res.json({ user: safeUser(user) });
  } catch (error) { next(error); }
});

router.get('/v1/doctors', async (req, res, next) => {
  try {
    const { page, limit } = getPage(req.query); const filter = { verificationStatus: 'approved' };
    for (const field of ['specialization', 'district', 'hospital']) if (req.query[field]) filter[field] = { $regex: regex(req.query[field]), $options: 'i' };
    let profiles = await DoctorProfile.find(filter).populate('user', 'name').lean();
    if (req.query.name) {
      const nameFilter = new RegExp(regex(req.query.name), 'i');
      profiles = profiles.filter((profile) => nameFilter.test(profile.user?.name || profile.name || ''));
    }
    const sort = String(req.query.sort || 'name');
    if (sort === 'fee') profiles.sort((a, b) => a.consultationFee - b.consultationFee);
    else if (sort === 'experience') profiles.sort((a, b) => b.experienceYears - a.experienceYears);
    else profiles.sort((a, b) => (a.user?.name || '').localeCompare(b.user?.name || ''));
    const total = profiles.length;
    res.json({ doctors: profiles.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});
router.post('/v1/doctors/sync-references', ...auth('admin'), async (_req, res, next) => {
  try {
    const mismatches = await DoctorProfile.aggregate([
      { $match: { $expr: { $ne: [{ $type: '$user' }, 'objectId'] } } },
      { $limit: 1000 },
      { $project: { _id: 1, user: 1 } }
    ]);
    if (!mismatches.length) return res.json({ fixed: 0, reason: 'doctorprofiles.user references are already ObjectId values.' });
    let fixed = 0;
    for (const profile of mismatches) {
      if (mongoose.isValidObjectId(profile.user)) {
        await DoctorProfile.updateOne({ _id: profile._id }, { $set: { user: new mongoose.Types.ObjectId(profile.user) } });
        fixed += 1;
      }
    }
    return res.json({ fixed, scanned: mismatches.length });
  } catch (error) { next(error); }
});

// Static /v1/doctors/me/* routes must be declared before /v1/doctors/:id so that
// Express does not treat the authenticated "me" segment as a doctor identifier.
router.get('/v1/doctors/me/profile', ...auth('doctor'), async (req, res, next) => {
  try { const profile = await DoctorProfile.findOne({ user: req.user._id }); if (!profile) return fail(res, 404, 'Doctor profile not found.'); res.json({ profile }); } catch (error) { next(error); }
});
router.get('/v1/doctors/me/availability', ...auth('doctor'), async (req, res, next) => {
  try {
    const profile = await DoctorProfile.findOne({ user: req.user._id }).select('availability');
    if (!profile) return fail(res, 404, 'Doctor profile not found.');
    const booked = await Appointment.find({ doctor: req.user._id, status: { $in: ['Pending', 'Confirmed'] } }).select('appointmentDate startTime').lean();
    const reserved = new Set(booked.map((slot) => `${slot.appointmentDate}:${slot.startTime}`));
    // Records written directly into MongoDB may not include the availability array.
    const availability = Array.isArray(profile.availability) ? profile.availability : [];
    res.json({ availability: availability.map((slot) => ({ ...slot.toObject(), available: !reserved.has(`${slot.date}:${slot.startTime}`) })) });
  } catch (error) { next(error); }
});
router.patch('/v1/doctors/me/profile', ...auth('doctor'), async (req, res, next) => {
  try {
    const allowed = ['specialization', 'qualification', 'experienceYears', 'consultationFee', 'hospital', 'district', 'biography']; const updates = {};
    for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
    const profile = await DoctorProfile.findOneAndUpdate({ user: req.user._id }, { $set: updates }, { new: true, runValidators: true });
    if (!profile) return fail(res, 404, 'Doctor profile not found.');
    res.json({ profile });
  } catch (error) { next(error); }
});
router.get('/v1/doctors/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return fail(res, 400, 'Invalid doctor ID.');
    const profile = await DoctorProfile.findOne({ user: req.params.id, verificationStatus: 'approved' }).lean();
    if (!profile) return fail(res, 404, 'Approved doctor not found.');
    const linkedUser = await User.findById(profile.user).select('name').lean();
    const hospitalName = typeof profile.hospitalName === 'string' && profile.hospitalName
      ? profile.hospitalName
      : typeof profile.hospital === 'string' ? profile.hospital : '';
    return res.json({
      doctor: {
        ...profile,
        name: profile.name || linkedUser?.name || 'Doctor',
        hospital: hospitalName,
        hospitalName,
        availability: Array.isArray(profile.availability) ? profile.availability : [],
        user: { _id: String(profile.user), name: linkedUser?.name || profile.name || null },
      },
    });
  } catch (error) { next(error); }
});
router.get('/v1/doctors/:id/availability', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return fail(res, 400, 'Invalid doctor ID.');
    const profile = await DoctorProfile.findOne({ user: req.params.id, verificationStatus: 'approved' }).lean();
    if (!profile) return fail(res, 404, 'Approved doctor not found.');
    const today = new Date().toISOString().slice(0, 10);
    // Profiles inserted directly into MongoDB can lack the availability array entirely.
    const availability = Array.isArray(profile.availability) ? profile.availability : [];
    const slots = availability.filter((slot) => slot.date >= today);
    const active = await Appointment.find({ doctor: profile.user, appointmentDate: { $gte: today }, status: { $in: ['Pending', 'Confirmed'] } }).select('appointmentDate startTime').lean();
    const booked = new Set(active.map((item) => `${item.appointmentDate}:${item.startTime}`));
    res.json({ availability: slots.map((slot) => ({ ...slot, available: !booked.has(`${slot.date}:${slot.startTime}`) })) });
  } catch (error) { next(error); }
});
router.put('/v1/doctors/me/availability', ...auth('doctor'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.availability) || req.body.availability.length > 100) return fail(res, 400, 'Provide an availability array with at most 100 slots.');
    const slots = req.body.availability;
    for (const slot of slots) {
      if (!isValidDay(slot.date) || slot.date < new Date().toISOString().slice(0, 10) || !TIME_RE.test(slot.startTime) || !TIME_RE.test(slot.endTime) || slot.endTime <= slot.startTime) return fail(res, 400, 'Each slot needs a future date and valid increasing start and end times.');
    }
    const keys = slots.map((slot) => `${slot.date}/${slot.startTime}`);
    if (new Set(keys).size !== keys.length) return fail(res, 400, 'Availability cannot contain duplicate date and start-time slots.');
    const profile = await DoctorProfile.findOneAndUpdate({ user: req.user._id }, { $set: { availability: slots.map(({ date, startTime, endTime }) => ({ date, startTime, endTime })) } }, { new: true, runValidators: true });
    if (!profile) return fail(res, 404, 'Doctor profile not found.');
    res.json({ availability: profile.availability });
  } catch (error) { next(error); }
});

router.post('/v1/appointments', ...auth('patient'), async (req, res, next) => {
  try {
    const { doctorId, appointmentDate, startTime, reason, consultationMode = 'in-person' } = req.body;
    if (!validId(doctorId) || !isValidDay(appointmentDate) || !TIME_RE.test(startTime || '') || typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500 || !['in-person', 'online'].includes(consultationMode)) return fail(res, 400, 'Appointment details are invalid.');
    if (appointmentDate <= new Date().toISOString().slice(0, 10)) return fail(res, 400, 'Choose an appointment date in the future.');
    const profile = await DoctorProfile.findOne({ user: doctorId, verificationStatus: 'approved' });
    if (!profile) return fail(res, 404, 'This doctor is unavailable for bookings.');
    const slot = profile.availability.find((item) => item.date === appointmentDate && item.startTime === startTime);
    if (!slot) return fail(res, 409, 'The doctor is not available at the requested time.');
    try {
      const appointment = await Appointment.create({ patient: req.user._id, doctor: doctorId, appointmentDate, startTime, endTime: slot.endTime, reason: reason.trim(), consultationMode });
      return res.status(201).json({ appointment });
    } catch (error) { if (error.code === 11000) return fail(res, 409, 'This time slot has already been requested. Please choose another.'); throw error; }
  } catch (error) { next(error); }
});
router.get('/v1/appointments', ...auth('patient', 'doctor', 'admin'), async (req, res, next) => {
  try {
    const { page, limit } = getPage(req.query); const filter = req.user.role === 'admin' ? {} : req.user.role === 'patient' ? { patient: req.user._id } : { doctor: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    const [appointments, total] = await Promise.all([Appointment.find(filter).populate(appointmentPopulate).sort({ appointmentDate: -1, startTime: -1 }).skip((page - 1) * limit).limit(limit), Appointment.countDocuments(filter)]);
    res.json({ appointments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});
router.get('/v1/appointments/:id', ...auth('patient', 'doctor', 'admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return fail(res, 400, 'Invalid appointment ID.');
    const appointment = await Appointment.findById(req.params.id).populate(appointmentPopulate);
    if (!appointment) return fail(res, 404, 'Appointment not found.');
    if (req.user.role === 'patient' && appointment.patient._id.toString() !== req.user._id.toString()) return fail(res, 403, 'You cannot view another patient’s appointment.');
    if (req.user.role === 'doctor' && appointment.doctor._id.toString() !== req.user._id.toString()) return fail(res, 403, 'You cannot view another doctor’s appointment.');
    res.json({ appointment });
  } catch (error) { next(error); }
});
router.patch('/v1/appointments/:id/status', ...auth('patient', 'doctor', 'admin'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return fail(res, 400, 'Invalid appointment ID.');
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return fail(res, 404, 'Appointment not found.');
    const nextStatus = req.body.status;
    const transitions = {
      patient: { Pending: ['Cancelled'], Confirmed: ['Cancelled'] },
      doctor: { Pending: ['Confirmed', 'Rejected'], Confirmed: ['Completed'] },
      admin: { Pending: ['Confirmed', 'Rejected', 'Cancelled'], Confirmed: ['Rejected', 'Cancelled', 'Completed'] },
    };
    const owns = req.user.role === 'admin' || (req.user.role === 'patient' && appointment.patient.equals(req.user._id)) || (req.user.role === 'doctor' && appointment.doctor.equals(req.user._id));
    if (!owns) return fail(res, 403, 'You cannot change this appointment.');
    if (!(transitions[req.user.role][appointment.status] || []).includes(nextStatus)) return fail(res, 409, 'This appointment status change is not allowed.');
    appointment.status = nextStatus;
    await appointment.save();
    res.json({ appointment });
  } catch (error) { next(error); }
});

router.get('/v1/hospitals', async (req, res, next) => {
  try {
    const { page, limit } = getPage(req.query); const filter = { published: true };
    if (req.query.district) filter.district = { $regex: regex(req.query.district), $options: 'i' };
    if (req.query.q) filter.$or = ['name', 'address'].map((field) => ({ [field]: { $regex: regex(req.query.q), $options: 'i' } }));
    if (req.query.service) filter.services = { $regex: regex(req.query.service), $options: 'i' };
    const [hospitals, total] = await Promise.all([Hospital.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit), Hospital.countDocuments(filter)]);
    res.json({ hospitals, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});
router.get('/v1/hospitals/:id', async (req, res, next) => {
  try { if (!validId(req.params.id)) return fail(res, 400, 'Invalid hospital ID.'); const hospital = await Hospital.findOne({ _id: req.params.id, published: true }); if (!hospital) return fail(res, 404, 'Hospital not found.'); res.json({ hospital }); } catch (error) { next(error); }
});
router.get('/v1/admin/hospitals', ...auth('admin'), async (_req, res, next) => { try { res.json({ hospitals: await Hospital.find().sort({ name: 1 }) }); } catch (error) { next(error); } });
router.post('/v1/admin/hospitals', ...auth('admin'), async (req, res, next) => {
  try { const { name, address, district } = req.body; if (!validBody(req.body, ['name', 'address', 'district'])) return fail(res, 400, 'Name, address and district are required.'); const coordinates = req.body.coordinates; if (coordinates !== undefined && (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90)) return fail(res, 400, 'Coordinates must be [longitude, latitude] within valid bounds.'); const hospital = await Hospital.create({ name, address, district, contact: req.body.contact || '', services: Array.isArray(req.body.services) ? req.body.services.slice(0, 30).map((s) => String(s).slice(0, 80)) : [], ...(coordinates ? { coordinates: { type: 'Point', coordinates } } : {}), source: typeof req.body.source === 'string' ? req.body.source.slice(0, 160) : 'CareBridge administrator', sourceUpdatedAt: req.body.sourceUpdatedAt ? new Date(req.body.sourceUpdatedAt) : undefined, published: req.body.published === true }); res.status(201).json({ hospital }); } catch (error) { next(error); }
});
router.patch('/v1/admin/hospitals/:id', ...auth('admin'), async (req, res, next) => {
  try { if (!validId(req.params.id)) return fail(res, 400, 'Invalid hospital ID.'); const updates = {}; for (const key of ['name', 'address', 'district', 'contact', 'published', 'source', 'sourceUpdatedAt']) if (req.body[key] !== undefined) updates[key] = req.body[key]; if (req.body.sourceUpdatedAt !== undefined) updates.sourceUpdatedAt = new Date(req.body.sourceUpdatedAt); if (req.body.services !== undefined) updates.services = Array.isArray(req.body.services) ? req.body.services.slice(0, 30) : []; if (req.body.coordinates !== undefined) { const coordinates = req.body.coordinates; if (coordinates === null) updates.coordinates = undefined; else if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) return fail(res, 400, 'Coordinates must be [longitude, latitude] within valid bounds.'); else updates.coordinates = { type: 'Point', coordinates }; } const hospital = await Hospital.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true }); if (!hospital) return fail(res, 404, 'Hospital not found.'); res.json({ hospital }); } catch (error) { next(error); }
});
router.delete('/v1/admin/hospitals/:id', ...auth('admin'), async (req, res, next) => { try { if (!validId(req.params.id)) return fail(res, 400, 'Invalid hospital ID.'); const hospital = await Hospital.findByIdAndDelete(req.params.id); if (!hospital) return fail(res, 404, 'Hospital not found.'); res.json({ message: 'Hospital removed.' }); } catch (error) { next(error); } });

router.get('/v1/reminders', ...auth('patient'), async (req, res, next) => { try { res.json({ reminders: await MedicineReminder.find({ patient: req.user._id }).sort({ startDate: 1, reminderTime: 1 }) }); } catch (error) { next(error); } });
router.post('/v1/reminders', ...auth('patient'), async (req, res, next) => {
  try { const { medicineName, reminderTime, startDate, endDate } = req.body; if (!validBody(req.body, ['medicineName', 'reminderTime', 'startDate', 'endDate']) || !TIME_RE.test(reminderTime) || !isValidDay(startDate) || !isValidDay(endDate) || endDate < startDate) return fail(res, 400, 'Enter a medicine name, valid time and valid date range.'); const reminder = await MedicineReminder.create({ patient: req.user._id, medicineName, reminderTime, startDate, endDate, instructions: typeof req.body.instructions === 'string' ? req.body.instructions.slice(0, 300) : '' }); res.status(201).json({ reminder }); } catch (error) { next(error); }
});
router.patch('/v1/reminders/:id', ...auth('patient'), async (req, res, next) => {
  try { if (!validId(req.params.id)) return fail(res, 400, 'Invalid reminder ID.'); const allowed = ['medicineName', 'instructions', 'reminderTime', 'startDate', 'endDate', 'active']; const updates = {}; for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key]; const reminder = await MedicineReminder.findOneAndUpdate({ _id: req.params.id, patient: req.user._id }, { $set: updates }, { new: true, runValidators: true }); if (!reminder) return fail(res, 404, 'Reminder not found.'); res.json({ reminder }); } catch (error) { next(error); }
});
router.delete('/v1/reminders/:id', ...auth('patient'), async (req, res, next) => { try { if (!validId(req.params.id)) return fail(res, 400, 'Invalid reminder ID.'); const reminder = await MedicineReminder.findOneAndDelete({ _id: req.params.id, patient: req.user._id }); if (!reminder) return fail(res, 404, 'Reminder not found.'); res.json({ message: 'Reminder deleted.' }); } catch (error) { next(error); } });

router.get('/v1/admin/stats', ...auth('admin'), async (_req, res, next) => {
  try { const [patients, doctors, approvedDoctors, pendingDoctors, appointments, pendingAppointments, confirmedAppointments, cancelledAppointments, hospitals] = await Promise.all([User.countDocuments({ role: 'patient' }), User.countDocuments({ role: 'doctor' }), DoctorProfile.countDocuments({ verificationStatus: 'approved' }), DoctorProfile.countDocuments({ verificationStatus: 'pending' }), Appointment.countDocuments(), Appointment.countDocuments({ status: 'Pending' }), Appointment.countDocuments({ status: 'Confirmed' }), Appointment.countDocuments({ status: 'Cancelled' }), Hospital.countDocuments()]); res.json({ patients, doctors, approvedDoctors, pendingDoctors, appointments, pendingAppointments, confirmedAppointments, cancelledAppointments, hospitals }); } catch (error) { next(error); }
});
router.get('/v1/admin/users', ...auth('admin'), async (req, res, next) => {
  try { const { page, limit } = getPage(req.query); const filter = {}; if (['patient', 'doctor', 'admin'].includes(req.query.role)) filter.role = req.query.role; if (['active', 'inactive'].includes(req.query.status)) filter.status = req.query.status; if (req.query.q) filter.$or = ['name', 'email'].map((field) => ({ [field]: { $regex: regex(req.query.q), $options: 'i' } })); const [users, total] = await Promise.all([User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]); res.json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); } catch (error) { next(error); }
});
router.patch('/v1/admin/users/:id/status', ...auth('admin'), async (req, res, next) => {
  try { if (!validId(req.params.id) || !['active', 'inactive'].includes(req.body.status)) return fail(res, 400, 'Valid user ID and status are required.'); if (req.params.id === req.user._id.toString() && req.body.status === 'inactive') return fail(res, 400, 'You cannot deactivate your own account.'); const user = await User.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true }); if (!user) return fail(res, 404, 'User not found.'); res.json({ user: safeUser(user) }); } catch (error) { next(error); }
});
router.get('/v1/admin/doctors', ...auth('admin'), async (req, res, next) => {
  try { const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending'; const profiles = await DoctorProfile.find({ verificationStatus: status }).populate('user', 'name email phone status').sort({ createdAt: 1 }); res.json({ doctors: profiles }); } catch (error) { next(error); }
});
router.patch('/v1/admin/doctors/:id/verification', ...auth('admin'), async (req, res, next) => {
  try { if (!validId(req.params.id) || !['approved', 'rejected'].includes(req.body.status)) return fail(res, 400, 'Choose approved or rejected verification status.'); const profile = await DoctorProfile.findOneAndUpdate({ user: req.params.id }, { $set: { verificationStatus: req.body.status } }, { new: true }).populate('user', 'name email'); if (!profile) return fail(res, 404, 'Doctor profile not found.'); res.json({ profile }); } catch (error) { next(error); }
});
router.get('/v1/admin/appointments', ...auth('admin'), async (req, res, next) => {
  try { const { page, limit } = getPage(req.query); const filter = {}; if (req.query.status) filter.status = req.query.status; const [appointments, total] = await Promise.all([Appointment.find(filter).populate(appointmentPopulate).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Appointment.countDocuments(filter)]); res.json({ appointments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); } catch (error) { next(error); }
});

router.use((err, _req, res, _next) => {
  if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors).map((item) => item.message).join(' ') });
  if (err.name === 'CastError') return res.status(400).json({ error: 'A supplied identifier or value is invalid.' });
  if (err.code === 11000) return res.status(409).json({ error: 'A record with those details already exists.' });
  console.error(err);
  const status = err.status || 500;
  if (status === 503 && err.code === 'AUTH_CONFIGURATION_ERROR') return fail(res, 503, err.message);
  return res.status(status).json({ error: status < 500 ? err.message : 'An unexpected server error occurred.' });
});
module.exports = router;
