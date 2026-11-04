require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const Appointment = require('../models/appointment');
const Hospital = require('../models/hospital');
require('../models/medicineReminder');

/*
 * Rebuilds the CareBridge database with a realistic Tamil Nadu dataset.
 *
 * DESTRUCTIVE: every application collection is dropped first. Run `npm run db:backup`
 * before this script if the current data matters.
 *
 * All doctors, patients and hospitals below are fictional people and fictional
 * institutions. Names are realistic Tamil names so the interface reads naturally in a
 * project demonstration, but no record describes a real clinician or real hospital.
 */

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@carebridge.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PATIENT_EMAIL = (process.env.DEMO_PATIENT_EMAIL || 'patient@carebridge.com').toLowerCase();
const PATIENT_PASSWORD = process.env.DEMO_PATIENT_PASSWORD || 'patient123';
const DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD || 'doctor123';
const COLLECTIONS = ['users', 'doctorprofiles', 'hospitals', 'appointments', 'medicinereminders', 'todos'];

const DISTRICTS = [
  { district: 'Coimbatore', city: 'Coimbatore', pincode: '641001' },
  { district: 'Chennai', city: 'Chennai', pincode: '600001' },
  { district: 'Madurai', city: 'Madurai', pincode: '625001' },
  { district: 'Tiruchirappalli', city: 'Tiruchirappalli', pincode: '620001' },
  { district: 'Salem', city: 'Salem', pincode: '636001' },
  { district: 'Erode', city: 'Erode', pincode: '638001' },
  { district: 'Tirunelveli', city: 'Tirunelveli', pincode: '627001' },
  { district: 'Vellore', city: 'Vellore', pincode: '632001' },
  { district: 'Thanjavur', city: 'Thanjavur', pincode: '613001' },
  { district: 'Dindigul', city: 'Dindigul', pincode: '624001' },
  { district: 'Karur', city: 'Karur', pincode: '639001' },
  { district: 'Namakkal', city: 'Namakkal', pincode: '637001' },
  { district: 'Kancheepuram', city: 'Kancheepuram', pincode: '631501' },
  { district: 'Cuddalore', city: 'Cuddalore', pincode: '607001' },
  { district: 'Kanyakumari', city: 'Nagercoil', pincode: '629001' },
  { district: 'Pudukkottai', city: 'Pudukkottai', pincode: '622001' },
  { district: 'Virudhunagar', city: 'Virudhunagar', pincode: '626001' },
  { district: 'Tiruppur', city: 'Tiruppur', pincode: '641601' },
  { district: 'Thoothukudi', city: 'Thoothukudi', pincode: '628001' },
  { district: 'Nilgiris', city: 'Udhagamandalam', pincode: '643001' },
];

const HOSPITAL_NAMES = [
  'Kaveri Multispeciality Hospital', 'Vaigai Medical Centre', 'Kongunadu Health Centre',
  'Chola Medical Centre', 'Pandya Multispeciality Hospital', 'Pallava Health Centre',
  'Nellai City Hospital', 'Bhavani Medical Centre', 'Amaravathi Multispeciality Hospital',
  'Vellar Health Centre', 'Thamirabarani Medical Centre', 'Palar City Hospital',
  'Cauvery Delta Medical Centre', 'Marutham Multispeciality Hospital', 'Kurinji Health Centre',
  'Mullai Medical Centre', 'Neithal Multispeciality Hospital', 'Vanji City Hospital',
  'Ponni Medical Centre', 'Kadal Health Centre',
];

const HOSPITAL_SERVICES = [
  'Emergency', 'General Medicine', 'Paediatrics', 'Obstetrics and Gynaecology', 'Orthopaedics',
  'Cardiology', 'Diagnostics', 'Pharmacy', 'Ambulance', 'Intensive Care', 'Dialysis', 'Physiotherapy',
];

const SPECIALITIES = [
  { name: 'General Medicine', qualification: 'MBBS, MD (General Medicine)', fee: 300, bio: 'Treats fevers, infections, diabetes and other common adult illnesses, with a focus on early referral when a specialist is needed.' },
  { name: 'Paediatrics', qualification: 'MBBS, MD (Paediatrics)', fee: 400, bio: 'Cares for newborns, children and adolescents, including growth monitoring, vaccination review and childhood infections.' },
  { name: 'Cardiology', qualification: 'MBBS, MD, DM (Cardiology)', fee: 800, bio: 'Assesses chest pain, blood-pressure problems and heart-rhythm concerns, and reviews ongoing cardiac medication.' },
  { name: 'Dermatology', qualification: 'MBBS, MD (Dermatology)', fee: 500, bio: 'Treats skin, hair and nail conditions such as eczema, fungal infections and chronic rashes.' },
  { name: 'Orthopaedics', qualification: 'MBBS, MS (Orthopaedics)', fee: 600, bio: 'Handles fractures, joint pain, back pain and sports injuries, including rehabilitation planning after surgery.' },
  { name: 'Obstetrics and Gynaecology', qualification: 'MBBS, MS (Obstetrics and Gynaecology)', fee: 600, bio: 'Provides antenatal care, delivery planning, and treatment for menstrual and reproductive health concerns.' },
  { name: 'Ophthalmology', qualification: 'MBBS, MS (Ophthalmology)', fee: 400, bio: 'Checks vision, screens for cataract and glaucoma, and manages eye infections and diabetic eye changes.' },
  { name: 'ENT', qualification: 'MBBS, MS (ENT)', fee: 450, bio: 'Treats ear infections, hearing difficulty, sinus problems, tonsillitis and persistent throat complaints.' },
  { name: 'Neurology', qualification: 'MBBS, MD, DM (Neurology)', fee: 900, bio: 'Evaluates headaches, seizures, stroke recovery, tremor and nerve-related weakness or numbness.' },
  { name: 'Psychiatry', qualification: 'MBBS, MD (Psychiatry)', fee: 700, bio: 'Supports people with anxiety, depression, sleep problems and stress, and reviews ongoing psychiatric medication.' },
  { name: 'Pulmonology', qualification: 'MBBS, MD (Pulmonary Medicine)', fee: 700, bio: 'Manages asthma, chronic cough, breathlessness and tuberculosis follow-up care.' },
  { name: 'Gastroenterology', qualification: 'MBBS, MD, DM (Gastroenterology)', fee: 900, bio: 'Investigates stomach pain, acidity, liver problems and long-standing digestive complaints.' },
  { name: 'Endocrinology', qualification: 'MBBS, MD, DM (Endocrinology)', fee: 800, bio: 'Manages diabetes, thyroid disorders, hormonal imbalance and related long-term treatment plans.' },
  { name: 'Nephrology', qualification: 'MBBS, MD, DM (Nephrology)', fee: 900, bio: 'Monitors kidney function, treats chronic kidney disease and plans dialysis where it is required.' },
  { name: 'Urology', qualification: 'MBBS, MS, MCh (Urology)', fee: 850, bio: 'Treats kidney stones, urinary infections and prostate problems, including surgical review.' },
  { name: 'General Surgery', qualification: 'MBBS, MS (General Surgery)', fee: 700, bio: 'Assesses hernias, gall-bladder disease, abscesses and other conditions that may need an operation.' },
  { name: 'Oncology', qualification: 'MBBS, MD, DM (Medical Oncology)', fee: 1000, bio: 'Guides cancer diagnosis, chemotherapy planning and follow-up reviews for patients and their families.' },
  { name: 'Anaesthesiology', qualification: 'MBBS, MD (Anaesthesiology)', fee: 500, bio: 'Provides pre-surgical assessment, pain relief and post-operative care planning.' },
  { name: 'Dentistry', qualification: 'BDS, MDS (Conservative Dentistry)', fee: 300, bio: 'Treats tooth decay, gum disease and dental pain, and advises on preventive oral care.' },
  { name: 'Physiotherapy', qualification: 'BPT, MPT (Orthopaedic Physiotherapy)', fee: 350, bio: 'Rehabilitates joint stiffness, post-fracture weakness and long-term movement problems through guided exercise.' },
];

const FIRST_NAMES = [
  'Aravind', 'Karthik', 'Suresh', 'Ramesh', 'Vignesh', 'Prakash', 'Senthil', 'Ganesh', 'Dinesh', 'Ashwin',
  'Naveen', 'Harish', 'Sathish', 'Manikandan', 'Rajesh', 'Vijay', 'Balaji', 'Gopinath', 'Lokesh', 'Mohan',
  'Priya', 'Lakshmi', 'Kavitha', 'Anitha', 'Deepa', 'Meena', 'Revathi', 'Sangeetha', 'Shalini', 'Divya',
  'Nithya', 'Janani', 'Aishwarya', 'Bhavani', 'Gayathri', 'Hema', 'Kalaiselvi', 'Nandhini', 'Rajalakshmi', 'Suganya',
];

const SURNAMES = [
  'Raman', 'Krishnan', 'Subramanian', 'Natarajan', 'Venkatesan', 'Sundaram', 'Pillai', 'Sekar', 'Murugan',
  'Palanisamy', 'Duraisamy', 'Balasubramanian', 'Kandasamy', 'Ganesan', 'Jeyakumar', 'Kumaran', 'Manickam',
  'Perumal', 'Selvaraj', 'Thangavelu', 'Chidambaram', 'Ramasamy', 'Nallasamy', 'Amirthalingam',
];

const PATIENTS = [
  { name: 'Arun Kumar', email: 'patient@carebridge.com', phone: '+91 90000 10001' },
  { name: 'Divya Sekar', email: 'divya.sekar@carebridge.com', phone: '+91 90000 10002' },
  { name: 'Muthu Pandian', email: 'muthu.pandian@carebridge.com', phone: '+91 90000 10003' },
  { name: 'Sneha Raman', email: 'sneha.raman@carebridge.com', phone: '+91 90000 10004' },
  { name: 'Vijay Anand', email: 'vijay.anand@carebridge.com', phone: '+91 90000 10005' },
  { name: 'Kalaivani Rajendran', email: 'kalaivani.rajendran@carebridge.com', phone: '+91 90000 10006' },
  { name: 'Suresh Babu', email: 'suresh.babu@carebridge.com', phone: '+91 90000 10007' },
  { name: 'Meenakshi Sundaram', email: 'meenakshi.sundaram@carebridge.com', phone: '+91 90000 10008' },
];

/** Deterministic pseudo-random generator so every rebuild produces the same dataset. */
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = createRandom(20261103);
const pick = (list) => list[Math.floor(random() * list.length)];

const dayString = (offset) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

/** Five slots on each weekday for the next two weeks, starting tomorrow. */
function buildAvailability(days = 14) {
  const slots = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    if (date.getUTCDay() === 0) continue;
    const day = date.toISOString().slice(0, 10);
    for (const [startTime, endTime] of [['09:00', '10:00'], ['10:00', '11:00'], ['11:30', '12:30'], ['15:00', '16:00'], ['16:30', '17:30']]) {
      slots.push({ date: day, startTime, endTime });
    }
  }
  return slots;
}

/** 43 distinct realistic names, shuffled deterministically. */
function buildDoctorNames(count) {
  const combinations = [];
  for (const first of FIRST_NAMES) for (const surname of SURNAMES) combinations.push(`${first} ${surname}`);
  for (let index = combinations.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [combinations[index], combinations[swap]] = [combinations[swap], combinations[index]];
  }
  return combinations.slice(0, count);
}

function emailFor(name, index) {
  if (index === 0) return 'doctor@carebridge.com';
  return `dr.${name.toLowerCase().replace(/\s+/g, '.')}@carebridge.com`;
}

async function seed() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_DB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI (or MONGO_DB_URI) must be configured.');
  if ([ADMIN_PASSWORD, PATIENT_PASSWORD, DOCTOR_PASSWORD].some((value) => value.length < 8)) {
    throw new Error('Seeded passwords must be at least 8 characters to satisfy the account model.');
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  // 1. Remove every application collection so the rebuild is not merged with stale rows.
  for (const name of COLLECTIONS) {
    const exists = await db.listCollections({ name }).hasNext();
    if (exists) await db.collection(name).drop();
  }

  // 2. Hash each shared password once; inserted documents otherwise skip the save hook.
  const [adminHash, patientHash, doctorHash] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, 12),
    bcrypt.hash(PATIENT_PASSWORD, 12),
    bcrypt.hash(DOCTOR_PASSWORD, 12),
  ]);

  const users = [];
  const doctorProfiles = [];
  const appointments = [];

  // 3. Administrator.
  const adminId = new mongoose.Types.ObjectId();
  users.push({
    _id: adminId, name: 'Thangaraj Ramanathan', email: ADMIN_EMAIL, password: adminHash,
    role: 'admin', phone: '+91 90000 00001', status: 'active',
    createdAt: new Date(), updatedAt: new Date(),
  });

  // 4. Patients.
  const patientIds = [];
  for (const patient of PATIENTS) {
    const id = new mongoose.Types.ObjectId();
    patientIds.push(id);
    users.push({
      _id: id, name: patient.name, email: patient.email, password: patientHash, role: 'patient',
      phone: patient.phone, status: 'active',
      createdAt: new Date(), updatedAt: new Date(),
    });
  }

  // 5. Hospitals — one fictional institution per district.
  const hospitals = DISTRICTS.map((place, index) => ({
    name: HOSPITAL_NAMES[index],
    address: `${12 + index}, ${['Trichy Road', 'Brough Road', 'Gandhi Street', 'Anna Salai', 'Court Road'][index % 5]}, ${place.city === place.district ? place.city : `${place.city}, ${place.district}`} - ${place.pincode}`,
    district: place.district,
    contact: `+91 9${String(400000000 + index * 137913).slice(0, 9)}`,
    services: HOSPITAL_SERVICES.slice(0, 6 + (index % 6)),
    source: 'CareBridge academic demonstration dataset (illustrative institution)',
    sourceUpdatedAt: new Date(),
    published: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  // 6. Doctors — two approved per district, plus two awaiting verification.
  const names = buildDoctorNames(42);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const place = DISTRICTS[index % DISTRICTS.length];
    const speciality = SPECIALITIES[index % SPECIALITIES.length];
    const userId = new mongoose.Types.ObjectId();
    const pending = index >= 40;
    const experienceYears = 3 + ((index * 5) % 26);

    users.push({
      _id: userId, name: `Dr. ${name}`, email: emailFor(name, index), password: doctorHash, role: 'doctor',
      phone: `+91 9${String(500000000 + index * 274957).slice(0, 9)}`, status: 'active',
      createdAt: new Date(), updatedAt: new Date(),
    });

    doctorProfiles.push({
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      specialization: speciality.name,
      qualification: speciality.qualification,
      experienceYears,
      consultationFee: speciality.fee + (index % 4) * 50,
      hospital: hospitals[index % hospitals.length].name,
      district: place.district,
      biography: `${speciality.bio} Practising in ${place.city} for ${experienceYears} years.`,
      verificationStatus: pending ? 'pending' : 'approved',
      availability: pending ? [] : buildAvailability(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // 7. Appointments spread across the statuses the dashboards display.
  const approvedDoctors = doctorProfiles.filter((profile) => profile.verificationStatus === 'approved');
  const reasons = [
    'Persistent fever for four days and body ache.',
    'Follow-up review after blood pressure medication change.',
    'Recurring knee pain while walking up stairs.',
    'Child has a cough that has lasted more than a week.',
    'Skin rash on both arms that has not improved.',
    'Routine diabetes review with recent blood test results.',
    'Headaches in the evening over the past two weeks.',
    'Antenatal check-up and advice on the next scan.',
    'Difficulty hearing in the left ear since last month.',
    'Breathlessness while climbing stairs.',
  ];
  const plan = ['Pending', 'Confirmed', 'Confirmed', 'Completed', 'Cancelled', 'Pending', 'Confirmed', 'Completed', 'Rejected', 'Pending'];
  const usedSlots = new Set();

  for (let index = 0; index < plan.length; index += 1) {
    const doctor = approvedDoctors[index % approvedDoctors.length];
    const status = plan[index];
    const future = status === 'Pending' || status === 'Confirmed';
    const slot = future
      ? (doctor.availability.find((candidate) => candidate.date > dayString(0) && !usedSlots.has(`${doctor.user}:${candidate.date}:${candidate.startTime}`)) || doctor.availability[0])
      : { date: dayString(-(index + 2)), startTime: '10:00', endTime: '11:00' };
    if (future) usedSlots.add(`${doctor.user}:${slot.date}:${slot.startTime}`);

    appointments.push({
      _id: new mongoose.Types.ObjectId(),
      patient: patientIds[index % patientIds.length],
      doctor: doctor.user,
      appointmentDate: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      reason: reasons[index],
      consultationMode: index % 4 === 0 ? 'online' : 'in-person',
      status,
      createdAt: new Date(`${slot.date}T06:00:00Z`),
      updatedAt: new Date(`${slot.date}T06:00:00Z`),
    });
  }

  // 8. Medicine reminders for the primary demonstration patient.
  const reminders = [
    { medicineName: 'Metformin 500 mg', instructions: 'After breakfast and dinner', reminderTime: '08:00', days: 30 },
    { medicineName: 'Amlodipine 5 mg', instructions: 'Once daily, after food', reminderTime: '09:00', days: 30 },
    { medicineName: 'Iron and folic acid', instructions: 'After lunch with water', reminderTime: '13:30', days: 90 },
  ].map((item, index) => ({
    _id: new mongoose.Types.ObjectId(),
    patient: patientIds[0],
    medicineName: item.medicineName,
    instructions: item.instructions,
    reminderTime: item.reminderTime,
    startDate: dayString(-index),
    endDate: dayString(item.days),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db.collection('users').insertMany(users);
  await db.collection('hospitals').insertMany(hospitals);
  await db.collection('doctorprofiles').insertMany(doctorProfiles);
  await db.collection('appointments').insertMany(appointments);
  await db.collection('medicinereminders').insertMany(reminders);

  // Models declare indexes lazily; build them explicitly so uniqueness is enforced immediately.
  await mongoose.model('User').syncIndexes();
  await mongoose.model('DoctorProfile').syncIndexes();
  await mongoose.model('Appointment').syncIndexes();
  await mongoose.model('Hospital').syncIndexes();

  console.log('\nCareBridge database rebuilt\n');
  console.log(`  ${users.filter((user) => user.role === 'admin').length} administrator, ${users.filter((user) => user.role === 'doctor').length} doctors, ${users.filter((user) => user.role === 'patient').length} patients`);
  console.log(`  ${hospitals.length} hospitals, ${doctorProfiles.filter((profile) => profile.verificationStatus === 'approved').length} approved doctor profiles, ${doctorProfiles.filter((profile) => profile.verificationStatus === 'pending').length} awaiting verification`);
  console.log(`  ${appointments.length} appointments, ${reminders.length} medicine reminders`);

  console.log('\nSign in with:');
  console.log(`  Administrator   ${ADMIN_EMAIL}   ${ADMIN_PASSWORD}`);
  console.log(`  Patient         ${PATIENT_EMAIL}   ${PATIENT_PASSWORD}`);
  console.log(`  Doctor          doctor@carebridge.com   ${DOCTOR_PASSWORD}   (Dr. ${names[0]})`);
  console.log(`  Other doctors   <their email>   ${DOCTOR_PASSWORD}\n`);

  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(`Seeding failed: ${error.message}`);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
