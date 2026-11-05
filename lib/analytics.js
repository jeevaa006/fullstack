const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const Appointment = require('../models/appointment');
const Hospital = require('../models/hospital');
const Activity = require('../models/activity');
const { ONLINE_WINDOW_SECONDS, onlineWindowStart } = require('./presence');

/*
 * All analytics are computed from stored CareBridge records. No series, count or
 * percentage in this module is generated: figures come from MongoDB aggregations,
 * and comparisons are only reported where a baseline actually exists (records created
 * before the selected period). Metrics whose history is not stored (for example the
 * old status of an appointment) report `changePercent: null` instead of a guess.
 */
const TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 1830;
const MAX_BUCKETS = 400;
const PRESETS = ['today', '7d', '30d', '90d', 'year', 'custom'];
const GRANULARITIES = ['day', 'week', 'month', 'year'];
const ROLES = ['patient', 'doctor', 'admin'];
const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'];
const APPOINTMENT_STATUSES = ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed'];
const ACTIVITY_LIMIT = 15;
const FEED_QUERY_LIMIT = 6;

const invalid = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const firstCount = (rows) => (Array.isArray(rows) && rows[0] ? rows[0].count : 0);

const startOfIstDay = (value) => {
  const shifted = new Date(value.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST_OFFSET_MS);
};
const istDay = (value) => new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istTime = (value) => new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);

const parseIstDay = (text) => {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(stamp - IST_OFFSET_MS);
};

const startOfIstMonth = (value) => {
  const shifted = new Date(value.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - IST_OFFSET_MS);
};
const startOfIstYear = (value) => new Date(Date.UTC(new Date(value.getTime() + IST_OFFSET_MS).getUTCFullYear(), 0, 1) - IST_OFFSET_MS);
const nextIstMonth = (value) => startOfIstMonth(new Date(value.getTime() + 32 * DAY_MS));
const nextIstYear = (value) => new Date(Date.UTC(new Date(value.getTime() + IST_OFFSET_MS).getUTCFullYear() + 1, 0, 1) - IST_OFFSET_MS);

/* ISO week key in the same format MongoDB's `%G-W%V` produces, so JS-filled gaps and
 * aggregation buckets line up exactly. */
const isoWeekKey = (value) => {
  const shifted = new Date(value.getTime() + IST_OFFSET_MS);
  const day = shifted.getUTCDay() || 7;
  shifted.setUTCDate(shifted.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(shifted.getUTCFullYear(), 0, 1);
  const week = Math.ceil((((shifted.getTime() - yearStart) / DAY_MS) + 1) / 7);
  return `${shifted.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

function resolveRange(query = {}, now = new Date()) {
  const preset = PRESETS.includes(query.range) ? query.range : '30d';
  let from;
  let to = now;

  if (preset === 'custom') {
    const start = parseIstDay(query.from);
    const end = parseIstDay(query.to);
    if (!start || !end) throw invalid('A custom range needs valid from and to dates (YYYY-MM-DD).');
    if (end < start) throw invalid('The end date must be on or after the start date.');
    from = start;
    const endExclusive = new Date(end.getTime() + DAY_MS);
    to = endExclusive > now ? now : endExclusive;
  } else if (preset === 'today') {
    from = startOfIstDay(now);
  } else if (preset === 'year') {
    from = startOfIstYear(now);
  } else {
    const days = Number.parseInt(preset, 10);
    from = startOfIstDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  }

  const duration = to.getTime() - from.getTime();
  if (duration <= 0) throw invalid('The selected range contains no elapsed time.');
  if (duration > MAX_RANGE_DAYS * DAY_MS) throw invalid(`Select a range of ${MAX_RANGE_DAYS} days or less.`);

  const previousFrom = new Date(from.getTime() - duration);
  return {
    preset,
    from,
    to,
    previousFrom,
    previousTo: new Date(from),
    durationMs: duration,
    days: Math.max(1, Math.round(duration / DAY_MS)),
    timezone: TIMEZONE,
    fromDay: istDay(from),
    toDay: istDay(new Date(to.getTime() - 1)),
  };
}

function resolveGranularity(requested, durationDays) {
  let granularity = GRANULARITIES.includes(requested)
    ? requested
    : durationDays <= 31 ? 'day' : durationDays <= 182 ? 'week' : durationDays <= 730 ? 'month' : 'year';
  const estimate = (value) => (value === 'day' ? durationDays
    : value === 'week' ? Math.ceil(durationDays / 7)
      : value === 'month' ? Math.ceil(durationDays / 30)
        : Math.ceil(durationDays / 365));
  while (estimate(granularity) > MAX_BUCKETS && granularity !== 'year') {
    granularity = GRANULARITIES[GRANULARITIES.indexOf(granularity) + 1];
  }
  return granularity;
}

const bucketKeys = (from, to, granularity) => {
  const keys = [];
  if (granularity === 'day') {
    for (let cursor = startOfIstDay(from); cursor < to; cursor = new Date(cursor.getTime() + DAY_MS)) keys.push(istDay(cursor));
    return keys;
  }
  if (granularity === 'week') {
    for (let cursor = startOfIstDay(from); cursor < to; cursor = new Date(cursor.getTime() + 7 * DAY_MS)) keys.push(isoWeekKey(cursor));
    return keys;
  }
  if (granularity === 'month') {
    for (let cursor = startOfIstMonth(from); cursor < to; cursor = nextIstMonth(cursor)) keys.push(istDay(cursor).slice(0, 7));
    return keys;
  }
  for (let cursor = startOfIstYear(from); cursor < to; cursor = nextIstYear(cursor)) keys.push(istDay(cursor).slice(0, 4));
  return keys;
};

const bucketExpression = (field, granularity) => ({
  $dateToString: {
    date: `$${field}`,
    format: granularity === 'day' ? '%Y-%m-%d' : granularity === 'week' ? '%G-W%V' : granularity === 'month' ? '%Y-%m' : '%Y',
    timezone: TIMEZONE,
  },
});

const stage = (...pipeline) => pipeline.filter((item) => item && Object.keys(item).length > 0);

const change = (value, previous) => ({
  value,
  previous: previous === null || previous === undefined ? null : previous,
  changePercent: previous === null || previous === undefined || previous === 0
    ? null
    : Number((((value - previous) / previous) * 100).toFixed(1)),
});

const sumBy = (rows, key) => rows.find((row) => String(row._id) === key)?.count || 0;

const optionList = (...lists) => [...new Set(lists.flat().filter((value) => typeof value === 'string' && value.trim()))].sort((a, b) => a.localeCompare(b));

const doctorLabel = (name) => (name ? `Dr ${name}` : 'Doctor');

async function registrationFeedItems(range, limit) {
  const [users, verifications, hospitals] = await Promise.all([
    User.find({ createdAt: { $gte: range.from, $lt: range.to } })
      .select('name role createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    DoctorProfile.find({ verificationStatus: { $in: ['approved', 'rejected'] }, updatedAt: { $gte: range.from, $lt: range.to } })
      .select('verificationStatus updatedAt user')
      .populate('user', 'name')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),
    Hospital.find({ createdAt: { $gte: range.from, $lt: range.to } })
      .select('name district createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  return [
    ...users.map((user) => ({
      id: `user:${user._id}`,
      type: user.role === 'doctor' ? 'doctor.registered' : 'patient.registered',
      title: user.role === 'doctor' ? 'Doctor account registered' : 'Patient account registered',
      detail: `${user.name} · ${user.role}`,
      role: user.role,
      at: user.createdAt,
    })),
    ...verifications.map((profile) => ({
      id: `verification:${profile._id}:${profile.verificationStatus}`,
      type: 'doctor.verification',
      title: profile.verificationStatus === 'approved' ? 'Doctor profile approved' : 'Doctor profile rejected',
      detail: doctorLabel(profile.user?.name),
      role: 'doctor',
      at: profile.updatedAt,
    })),
    ...hospitals.map((hospital) => ({
      id: `hospital:${hospital._id}`,
      type: 'hospital.registered',
      title: 'Hospital record added',
      detail: `${hospital.name} · ${hospital.district}`,
      role: 'admin',
      at: hospital.createdAt,
    })),
  ];
}

async function appointmentFeedItems(range, limit) {
  const populate = [{ path: 'patient', select: 'name' }, { path: 'doctor', select: 'name' }];
  const [bookings, closures] = await Promise.all([
    Appointment.find({ createdAt: { $gte: range.from, $lt: range.to } })
      .select('appointmentDate startTime status createdAt patient doctor')
      .populate(populate)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Appointment.find({ status: { $in: ['Cancelled', 'Rejected'] }, updatedAt: { $gte: range.from, $lt: range.to } })
      .select('appointmentDate startTime status createdAt updatedAt patient doctor')
      .populate(populate)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  return [
    ...bookings.map((appointment) => ({
      id: `booking:${appointment._id}`,
      type: 'appointment.booked',
      title: 'Appointment requested',
      detail: `${appointment.patient?.name || 'Patient'} → ${doctorLabel(appointment.doctor?.name)} · ${appointment.appointmentDate} ${appointment.startTime}`,
      role: 'patient',
      at: appointment.createdAt,
    })),
    ...closures
      .filter((appointment) => new Date(appointment.updatedAt).getTime() - new Date(appointment.createdAt).getTime() > 1000)
      .map((appointment) => ({
        id: `closure:${appointment._id}:${appointment.status}`,
        type: 'appointment.closed',
        title: appointment.status === 'Rejected' ? 'Appointment rejected' : 'Appointment cancelled',
        detail: `${appointment.patient?.name || 'Patient'} → ${doctorLabel(appointment.doctor?.name)} · ${appointment.appointmentDate} ${appointment.startTime}`,
        role: 'doctor',
        at: appointment.updatedAt,
      })),
  ];
}

async function storedActivityItems(range, limit) {
  const rows = await Activity.find({ createdAt: { $gte: range.from, $lt: range.to } })
    .populate('actor', 'name role')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return rows.map((row) => ({
    id: `activity:${row._id}`,
    type: row.type,
    title: row.type === 'login' ? 'Sign-in' : 'Administrator action',
    detail: row.summary,
    role: row.actor?.role || row.actorRole || 'system',
    at: row.createdAt,
  }));
}

async function buildAnalytics(rawQuery = {}, now = new Date()) {
  const range = resolveRange(rawQuery, now);
  const granularity = resolveGranularity(rawQuery.granularity, range.days);
  const filters = {
    role: ROLES.includes(rawQuery.role) ? rawQuery.role : '',
    verification: VERIFICATION_STATUSES.includes(rawQuery.verification) ? rawQuery.verification : '',
    appointmentStatus: APPOINTMENT_STATUSES.includes(rawQuery.appointmentStatus) ? rawQuery.appointmentStatus : '',
    district: typeof rawQuery.district === 'string' ? rawQuery.district.trim().slice(0, 100) : '',
  };

  const created = { $gte: range.from, $lt: range.to };
  const previousCreated = { $gte: range.previousFrom, $lt: range.previousTo };
  const accountMatch = filters.role ? { role: filters.role } : {};
  const appointmentMatch = filters.appointmentStatus ? { status: filters.appointmentStatus } : {};
  const districtMatch = filters.district ? { district: filters.district } : {};
  const verificationMatch = filters.verification ? { verificationStatus: filters.verification } : {};
  const onlineSince = onlineWindowStart(now.getTime());
  const today = istDay(now);
  const currentTime = istTime(now);

  const registrationBucket = bucketExpression('createdAt', granularity);
  const openStatuses = ['Pending', 'Confirmed'];

  const [userFacetRows, appointmentFacetRows, doctorFacetRows, hospitalFacetRows, registrationEvents, appointmentEvents, storedEvents] = await Promise.all([
    User.aggregate([{
      $facet: {
        total: [{ $match: accountMatch }, { $count: 'count' }],
        previousTotal: [{ $match: { ...accountMatch, createdAt: { $lt: range.from } } }, { $count: 'count' }],
        byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }],
        previousByRole: [{ $match: { createdAt: { $lt: range.from } } }, { $group: { _id: '$role', count: { $sum: 1 } } }],
        byStatus: [{ $match: accountMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }],
        online: [{ $match: { status: 'active', lastActiveAt: { $gte: onlineSince } } }, { $group: { _id: '$role', count: { $sum: 1 } } }],
        registrations: [
          { $match: { createdAt: created, ...accountMatch } },
          { $group: { _id: { bucket: registrationBucket, role: '$role' }, count: { $sum: 1 } } },
        ],
        registeredBefore: [{ $match: { createdAt: { $lt: range.from }, ...accountMatch } }, { $count: 'count' }],
        newUsers: [{ $match: { createdAt: created, ...accountMatch } }, { $count: 'count' }],
        previousNewUsers: [{ $match: { createdAt: previousCreated, ...accountMatch } }, { $count: 'count' }],
      },
    }]),
    Appointment.aggregate([{
      $facet: {
        total: [{ $count: 'count' }],
        previousTotal: [{ $match: { createdAt: { $lt: range.from } } }, { $count: 'count' }],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byMode: [{ $group: { _id: '$consultationMode', count: { $sum: 1 } } }],
        today: [{ $match: { appointmentDate: today } }, { $count: 'count' }],
        upcoming: [{ $match: { appointmentDate: { $gt: today }, status: { $in: openStatuses } } }, { $count: 'count' }],
        scheduled: [{ $match: { appointmentDate: { $gte: today }, status: { $in: openStatuses } } }, { $count: 'count' }],
        activeNow: [{ $match: { appointmentDate: today, status: 'Confirmed', startTime: { $lte: currentTime }, endTime: { $gt: currentTime } } }, { $count: 'count' }],
        booked: [{ $match: { createdAt: created, ...appointmentMatch } }, { $count: 'count' }],
        previousBooked: [{ $match: { createdAt: previousCreated, ...appointmentMatch } }, { $count: 'count' }],
        trend: [
          { $match: { createdAt: created, ...appointmentMatch } },
          { $group: { _id: { bucket: registrationBucket, status: '$status' }, count: { $sum: 1 } } },
        ],
        patients: [
          { $match: { createdAt: created, ...appointmentMatch } },
          { $group: { _id: '$patient', total: { $sum: 1 } } },
          { $sort: { total: -1 } },
          { $limit: 8 },
          { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'account' } },
          { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 0, total: 1, name: '$account.name' } },
        ],
        doctors: [
          { $match: { createdAt: created, ...appointmentMatch } },
          {
            $group: {
              _id: '$doctor',
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $in: ['$status', ['Cancelled', 'Rejected']] }, 1, 0] } },
              upcoming: { $sum: { $cond: [{ $and: [{ $in: ['$status', openStatuses] }, { $gte: ['$appointmentDate', today] }] }, 1, 0] } },
            },
          },
          { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'account' } },
          { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: DoctorProfile.collection.name, localField: '_id', foreignField: 'user', as: 'profile' } },
          { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
          ...stage({ $match: districtMatch.district ? { 'profile.district': filters.district } : {} }),
          ...stage(filters.verification ? { $match: { 'profile.verificationStatus': filters.verification } } : {}),
          { $sort: { total: -1, _id: 1 } },
          { $limit: 25 },
          {
            $project: {
              _id: 0,
              doctorId: '$_id',
              total: 1,
              completed: 1,
              cancelled: 1,
              upcoming: 1,
              name: '$account.name',
              specialization: '$profile.specialization',
              district: '$profile.district',
              hospital: '$profile.hospital',
            },
          },
        ],
      },
    }]),
    DoctorProfile.aggregate([{
      $facet: {
        total: [{ $count: 'count' }],
        verification: [{ $group: { _id: '$verificationStatus', count: { $sum: 1 } } }],
        specializations: [
          ...stage(filters.verification ? { $match: verificationMatch } : {}),
          ...stage(districtMatch.district ? { $match: districtMatch } : {}),
          { $group: { _id: '$specialization', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
        ],
        districts: [
          ...stage(filters.verification ? { $match: verificationMatch } : {}),
          { $group: { _id: '$district', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 12 },
        ],
        districtOptions: [{ $group: { _id: '$district' } }],
      },
    }]),
    Hospital.aggregate([{
      $facet: {
        total: [{ $count: 'count' }],
        previousTotal: [{ $match: { createdAt: { $lt: range.from } } }, { $count: 'count' }],
        byPublication: [{ $group: { _id: '$published', count: { $sum: 1 } } }],
        byDistrict: [
          ...stage(districtMatch.district ? { $match: districtMatch } : {}),
          { $group: { _id: '$district', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 12 },
        ],
        districtOptions: [{ $group: { _id: '$district' } }],
        newHospitals: [{ $match: { createdAt: created } }, { $count: 'count' }],
        previousNewHospitals: [{ $match: { createdAt: previousCreated } }, { $count: 'count' }],
        registrations: [{ $match: { createdAt: created } }, { $group: { _id: registrationBucket, count: { $sum: 1 } } }],
      },
    }]),
    registrationFeedItems(range, FEED_QUERY_LIMIT),
    appointmentFeedItems(range, FEED_QUERY_LIMIT),
    storedActivityItems(range, FEED_QUERY_LIMIT),
  ]);

  const users = userFacetRows[0] || {};
  const appointments = appointmentFacetRows[0] || {};
  const doctors = doctorFacetRows[0] || {};
  const hospitals = hospitalFacetRows[0] || {};

  const roleCounts = users.byRole || [];
  const previousRoleCounts = users.previousByRole || [];
  const statusCounts = appointments.byStatus || [];
  const onlineCounts = users.online || [];
  const verificationCounts = doctors.verification || [];

  const onlineByRole = Object.fromEntries(ROLES.map((role) => [role, sumBy(onlineCounts, role)]));
  const onlineTotal = ROLES.reduce((total, role) => total + onlineByRole[role], 0);
  const statusByKey = Object.fromEntries(APPOINTMENT_STATUSES.map((status) => [status, sumBy(statusCounts, status)]));
  const verificationByKey = Object.fromEntries(VERIFICATION_STATUSES.map((status) => [status, sumBy(verificationCounts, status)]));
  const rolesByKey = Object.fromEntries(ROLES.map((role) => [role, sumBy(roleCounts, role)]));

  const totalAppointments = firstCount(appointments.total);
  const totalUsers = firstCount(users.total);
  const totalHospitals = firstCount(hospitals.total);
  const completionRate = totalAppointments ? Number(((statusByKey.Completed / totalAppointments) * 100).toFixed(1)) : 0;
  const cancellationRate = totalAppointments
    ? Number((((statusByKey.Cancelled + statusByKey.Rejected) / totalAppointments) * 100).toFixed(1))
    : 0;
  const doctorTotal = firstCount(doctors.total);
  const verifiedCount = verificationByKey.approved;
  const verificationRate = doctorTotal ? Number(((verifiedCount / doctorTotal) * 100).toFixed(1)) : 0;

  const kpis = {
    totalUsers: change(totalUsers, firstCount(users.previousTotal)),
    patients: change(rolesByKey.patient, sumBy(previousRoleCounts, 'patient')),
    doctors: change(rolesByKey.doctor, sumBy(previousRoleCounts, 'doctor')),
    admins: change(rolesByKey.admin, sumBy(previousRoleCounts, 'admin')),
    activeUsers: change(sumBy(users.byStatus || [], 'active'), null),
    onlineUsers: change(filters.role ? onlineByRole[filters.role] : onlineTotal, null),
    verifiedDoctors: change(verifiedCount, null),
    unverifiedDoctors: change(verificationByKey.pending + verificationByKey.rejected, null),
    hospitals: change(totalHospitals, firstCount(hospitals.previousTotal)),
    publishedHospitals: change(
      (hospitals.byPublication || []).find((row) => row._id === true)?.count || 0,
      null,
    ),
    appointments: change(totalAppointments, firstCount(appointments.previousTotal)),
    completedAppointments: change(statusByKey.Completed, null),
    pendingAppointments: change(statusByKey.Pending, null),
    confirmedAppointments: change(statusByKey.Confirmed, null),
    cancelledAppointments: change(statusByKey.Cancelled, null),
    rejectedAppointments: change(statusByKey.Rejected, null),
    todaysAppointments: change(firstCount(appointments.today), null),
    upcomingAppointments: change(firstCount(appointments.upcoming), null),
    scheduledAppointments: change(firstCount(appointments.scheduled), null),
    activeNowAppointments: change(firstCount(appointments.activeNow), null),
    newUsersInRange: change(firstCount(users.newUsers), firstCount(users.previousNewUsers)),
    newHospitalsInRange: change(firstCount(hospitals.newHospitals), firstCount(hospitals.previousNewHospitals)),
    appointmentsBookedInRange: change(firstCount(appointments.booked), firstCount(appointments.previousBooked)),
  };

  const keys = bucketKeys(range.from, range.to, granularity);
  const registrationRows = users.registrations || [];
  const registrations = keys.map((key) => {
    const rows = registrationRows.filter((row) => row._id?.bucket === key);
    const patient = rows.find((row) => row._id?.role === 'patient')?.count || 0;
    const doctor = rows.find((row) => row._id?.role === 'doctor')?.count || 0;
    const admin = rows.find((row) => row._id?.role === 'admin')?.count || 0;
    return { bucket: key, patients: patient, doctors: doctor, admins: admin, total: patient + doctor + admin };
  });

  let cumulative = firstCount(users.registeredBefore);
  const userGrowth = registrations.map((point) => {
    cumulative += point.total;
    return { bucket: point.bucket, total: cumulative };
  });

  const appointmentRows = appointments.trend || [];
  const appointmentTrend = keys.map((key) => {
    const rows = appointmentRows.filter((row) => row._id?.bucket === key);
    const countFor = (status) => rows.find((row) => row._id?.status === status)?.count || 0;
    return {
      bucket: key,
      booked: rows.reduce((total, row) => total + row.count, 0),
      completed: countFor('Completed'),
      cancelled: countFor('Cancelled') + countFor('Rejected'),
      open: countFor('Pending') + countFor('Confirmed'),
    };
  });

  const hospitalRows = hospitals.registrations || [];
  const hospitalTrend = keys.map((key) => ({
    bucket: key,
    hospitals: hospitalRows.find((row) => row._id === key)?.count || 0,
  }));

  const doctorActivity = (appointments.doctors || []).slice(0, 10);
  const hospitalActivityMap = new Map();
  for (const doctor of appointments.doctors || []) {
    const hospital = (doctor.hospital || '').trim() || 'Not recorded';
    const current = hospitalActivityMap.get(hospital) || { hospital, appointments: 0, completed: 0, doctors: 0 };
    current.appointments += doctor.total;
    current.completed += doctor.completed;
    current.doctors += 1;
    hospitalActivityMap.set(hospital, current);
  }

  const activity = [...registrationEvents, ...appointmentEvents, ...storedEvents]
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, ACTIVITY_LIMIT);

  return {
    generatedAt: now.toISOString(),
    range: {
      preset: range.preset,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      fromDay: range.fromDay,
      toDay: range.toDay,
      previousFrom: range.previousFrom.toISOString(),
      previousTo: range.previousTo.toISOString(),
      days: range.days,
      timezone: TIMEZONE,
      granularity,
    },
    filters,
    kpis,
    summary: {
      completionRate,
      cancellationRate,
      verificationRate,
      appointmentsPerDoctor: rolesByKey.doctor ? Number((totalAppointments / rolesByKey.doctor).toFixed(1)) : 0,
      appointmentsPerPatient: rolesByKey.patient ? Number((totalAppointments / rolesByKey.patient).toFixed(1)) : 0,
    },
    distributions: {
      usersByRole: ROLES.map((role) => ({ key: role, value: rolesByKey[role] })),
      usersByStatus: [
        { key: 'active', value: sumBy(users.byStatus || [], 'active') },
        { key: 'inactive', value: sumBy(users.byStatus || [], 'inactive') },
      ],
      onlineByRole: ROLES.map((role) => ({ key: role, value: onlineByRole[role] })),
      doctorVerification: VERIFICATION_STATUSES.map((status) => ({ key: status, value: verificationByKey[status] })),
      appointmentsByStatus: APPOINTMENT_STATUSES.map((status) => ({ key: status, value: statusByKey[status] })),
      appointmentsByMode: (appointments.byMode || []).map((row) => ({ key: row._id || 'in-person', value: row.count })),
      hospitalsByPublication: [
        { key: 'published', value: (hospitals.byPublication || []).find((row) => row._id === true)?.count || 0 },
        { key: 'draft', value: (hospitals.byPublication || []).find((row) => row._id === false)?.count || 0 },
      ],
      doctorsBySpecialization: (doctors.specializations || []).map((row) => ({ key: row._id || 'Not specified', value: row.count })),
      doctorsByDistrict: (doctors.districts || []).map((row) => ({ key: row._id || 'Not specified', value: row.count })),
      hospitalsByDistrict: (hospitals.byDistrict || []).map((row) => ({ key: row._id || 'Not specified', value: row.count })),
      patientLocations: {
        available: false,
        reason: 'Patient accounts do not store a district. District breakdowns use doctor and hospital records.',
      },
    },
    trends: {
      granularity,
      registrations,
      userGrowth,
      appointments: appointmentTrend,
      hospitals: hospitalTrend,
    },
    doctorActivity: doctorActivity.map((doctor) => ({
      id: String(doctor.doctorId || ''),
      name: doctorLabel(doctor.name),
      specialization: doctor.specialization || 'Not specified',
      district: doctor.district || 'Not recorded',
      hospital: doctor.hospital || 'Not recorded',
      appointments: doctor.total,
      completed: doctor.completed,
      cancelled: doctor.cancelled,
      upcoming: doctor.upcoming,
    })),
    hospitalActivity: [...hospitalActivityMap.values()].sort((left, right) => right.appointments - left.appointments).slice(0, 10),
    patientActivity: (appointments.patients || []).map((row) => ({ name: row.name || 'Patient', appointments: row.total })),
    activity,
    options: {
      districts: optionList(
        (doctors.districtOptions || []).map((row) => row._id),
        (hospitals.districtOptions || []).map((row) => row._id),
      ),
      roles: ROLES,
      verificationStatuses: VERIFICATION_STATUSES,
      appointmentStatuses: APPOINTMENT_STATUSES,
      granularities: GRANULARITIES,
    },
  };
}

async function buildLiveAnalytics(now = new Date()) {
  const onlineSince = onlineWindowStart(now.getTime());
  const today = istDay(now);
  const currentTime = istTime(now);
  const [onlineRows, activeNow, todayTotal, recent] = await Promise.all([
    User.aggregate([
      { $match: { status: 'active', lastActiveAt: { $gte: onlineSince } } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    Appointment.countDocuments({ appointmentDate: today, status: 'Confirmed', startTime: { $lte: currentTime }, endTime: { $gt: currentTime } }),
    Appointment.countDocuments({ appointmentDate: today }),
    Activity.find().sort({ createdAt: -1 }).limit(8).populate('actor', 'name role').lean(),
  ]);

  const byRole = Object.fromEntries(ROLES.map((role) => [role, sumBy(onlineRows, role)]));
  return {
    generatedAt: now.toISOString(),
    windowSeconds: ONLINE_WINDOW_SECONDS,
    online: {
      total: ROLES.reduce((total, role) => total + byRole[role], 0),
      patient: byRole.patient,
      doctor: byRole.doctor,
      admin: byRole.admin,
    },
    activeAppointmentsNow: activeNow,
    todaysAppointments: todayTotal,
    activity: recent.map((row) => ({
      id: `activity:${row._id}`,
      type: row.type,
      title: row.type === 'login' ? 'Sign-in' : 'Administrator action',
      detail: row.summary,
      role: row.actor?.role || row.actorRole || 'system',
      at: row.createdAt,
    })),
  };
}

module.exports = { buildAnalytics, buildLiveAnalytics, resolveRange, resolveGranularity, bucketKeys };
