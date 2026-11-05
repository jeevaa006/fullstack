import { KPI_META, KPI_ORDER } from './kpiMeta';
import { formatBucket, formatDateTime, titleCase } from './format';

const cell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const row = (...values) => values.map(cell).join(',');

/* Exports exactly the payload that is on screen, so the file and the dashboard agree. */
export function downloadAnalyticsCsv(data, generatedAt = new Date()) {
  if (!data) return;
  const lines = [];
  lines.push(row('CareBridge platform analytics'));
  lines.push(row('Exported', formatDateTime(generatedAt.toISOString())));
  lines.push(row('Range', data.range.fromDay, data.range.toDay, data.range.timezone, `${data.range.days} day(s)`));
  lines.push(row('Granularity', data.range.granularity));
  lines.push(row('Filters', `role=${data.filters.role || 'all'}`, `verification=${data.filters.verification || 'all'}`, `appointment status=${data.filters.appointmentStatus || 'all'}`, `district=${data.filters.district || 'all'}`));
  lines.push('');

  lines.push(row('KPI', 'Value', 'Previous period', 'Change %'));
  for (const key of KPI_ORDER) {
    const metric = data.kpis[key];
    if (!metric) continue;
    lines.push(row(KPI_META[key]?.label || key, metric.value, metric.previous ?? '', metric.changePercent ?? ''));
  }
  lines.push('');

  lines.push(row('Summary', 'Percent or ratio'));
  lines.push(row('Appointment completion rate', data.summary.completionRate));
  lines.push(row('Appointment cancellation rate', data.summary.cancellationRate));
  lines.push(row('Doctor verification rate', data.summary.verificationRate));
  lines.push(row('Appointments per doctor', data.summary.appointmentsPerDoctor));
  lines.push(row('Appointments per patient', data.summary.appointmentsPerPatient));
  lines.push('');

  lines.push(row(`Registrations (${data.trends.granularity})`, 'Patients', 'Doctors', 'Admins', 'Total'));
  for (const point of data.trends.registrations) {
    lines.push(row(formatBucket(point.bucket), point.patients, point.doctors, point.admins, point.total));
  }
  lines.push('');

  lines.push(row('Cumulative accounts', 'Total'));
  for (const point of data.trends.userGrowth) {
    lines.push(row(formatBucket(point.bucket), point.total));
  }
  lines.push('');

  lines.push(row(`Appointments (${data.trends.granularity})`, 'Requested', 'Completed', 'Cancelled or rejected', 'Pending or confirmed'));
  for (const point of data.trends.appointments) {
    lines.push(row(formatBucket(point.bucket), point.booked, point.completed, point.cancelled, point.open));
  }
  lines.push('');

  lines.push(row('Distribution', 'Category', 'Count'));
  for (const [name, rows] of Object.entries(data.distributions)) {
    if (!Array.isArray(rows)) continue;
    for (const entry of rows) {
      lines.push(row(titleCase(name), titleCase(entry.key), entry.value));
    }
  }
  lines.push('');

  lines.push(row('Doctor activity', 'Specialization', 'District', 'Hospital', 'Appointments', 'Completed', 'Cancelled or rejected', 'Upcoming'));
  for (const doctor of data.doctorActivity) {
    lines.push(row(doctor.name, doctor.specialization, doctor.district, doctor.hospital, doctor.appointments, doctor.completed, doctor.cancelled, doctor.upcoming));
  }
  lines.push('');

  lines.push(row('Hospital activity', 'Appointments', 'Completed', 'Doctors'));
  for (const hospital of data.hospitalActivity) {
    lines.push(row(hospital.hospital, hospital.appointments, hospital.completed, hospital.doctors));
  }
  lines.push('');

  lines.push(row('Patient activity', 'Appointments'));
  for (const patient of data.patientActivity) {
    lines.push(row(patient.name, patient.appointments));
  }
  lines.push('');

  lines.push(row('Recent activity', 'Type', 'Detail', 'Role', 'Timestamp'));
  for (const event of data.activity) {
    lines.push(row(event.title, event.type, event.detail, event.role, formatDateTime(event.at)));
  }

  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `carebridge-analytics-${data.range.fromDay}_to_${data.range.toDay}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
