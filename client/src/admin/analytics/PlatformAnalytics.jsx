import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Activity, Ban, Building2, CalendarCheck, CalendarDays, CheckCircle2, ClipboardList, Clock3,
  Download, Hospital, Hourglass, MapPin, Radio, RefreshCw, ShieldCheck, SlidersHorizontal,
  Stethoscope, TrendingUp, UserCheck, UserRound, Users, Wifi, XCircle,
} from 'lucide-react';
import { KPI_ORDER } from './kpiMeta';
import { KpiCard, KpiDetail } from './KpiCard';
import { CategoryBars, ChartCard, PieBreakdown, StackedTrendBars, TrendLines } from './AnalyticsCharts';
import { formatDateTime, formatNumber, relativeTime, titleCase } from './format';
import { downloadAnalyticsCsv } from './exportCsv';
import { useAnalytics, useLiveAnalytics } from './useAnalytics';

const ICONS = {
  totalUsers: Users,
  patients: UserRound,
  doctors: Stethoscope,
  admins: ShieldCheck,
  activeUsers: UserCheck,
  onlineUsers: Wifi,
  verifiedDoctors: ShieldCheck,
  unverifiedDoctors: Hourglass,
  hospitals: Hospital,
  publishedHospitals: Building2,
  appointments: CalendarDays,
  completedAppointments: CheckCircle2,
  pendingAppointments: Clock3,
  confirmedAppointments: CalendarCheck,
  cancelledAppointments: XCircle,
  rejectedAppointments: Ban,
  todaysAppointments: CalendarDays,
  upcomingAppointments: CalendarDays,
  scheduledAppointments: ClipboardList,
  activeNowAppointments: Radio,
  newUsersInRange: TrendingUp,
  newHospitalsInRange: Building2,
  appointmentsBookedInRange: Activity,
};

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'patient', label: 'Patients' },
  { value: 'doctor', label: 'Doctors' },
  { value: 'admin', label: 'Administrators' },
];

const VERIFICATION_OPTIONS = [
  { value: '', label: 'Any verification' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Rejected', label: 'Rejected' },
];

const GRANULARITY_OPTIONS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const DEFAULT_FILTERS = {
  range: '30d', from: '', to: '', role: '', verification: '', appointmentStatus: '', district: '', granularity: 'auto',
};

const buildQuery = (filters) => {
  const params = { range: filters.range };
  if (filters.role) params.role = filters.role;
  if (filters.verification) params.verification = filters.verification;
  if (filters.appointmentStatus) params.appointmentStatus = filters.appointmentStatus;
  if (filters.district) params.district = filters.district;
  if (filters.granularity !== 'auto') params.granularity = filters.granularity;
  if (filters.range === 'custom') {
    if (!filters.from || !filters.to || filters.from > filters.to) return null;
    params.from = filters.from;
    params.to = filters.to;
  }
  return params;
};

function FilterSelect({ id, label, value, onChange, options }) {
  return (
    <div className="field analytics-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
FilterSelect.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string.isRequired })).isRequired,
};

function LiveStat({ icon: Icon, label, value, hint, loading }) {
  return (
    <div className="live-stat">
      <span className="live-stat-icon" aria-hidden="true"><Icon size={16} /></span>
      <span className="live-stat-label">{label}</span>
      <strong className="live-stat-value">{loading ? '—' : formatNumber(value)}</strong>
      <span className="live-stat-hint">{hint}</span>
    </div>
  );
}
LiveStat.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  hint: PropTypes.string.isRequired,
  loading: PropTypes.bool,
};

function ActivityList({ items, emptyText }) {
  if (!items.length) return <p className="analytics-empty">{emptyText}</p>;
  return (
    <ul className="activity-feed">
      {items.map((item) => (
        <li key={item.id} className="activity-item">
          <span className={`activity-dot is-${item.role || 'system'}`} aria-hidden="true" />
          <div className="activity-body">
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
          <time dateTime={new Date(item.at).toISOString()} title={formatDateTime(item.at)}>{relativeTime(item.at)}</time>
        </li>
      ))}
    </ul>
  );
}
ActivityList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    detail: PropTypes.string,
    role: PropTypes.string,
    at: PropTypes.string.isRequired,
  })).isRequired,
  emptyText: PropTypes.string.isRequired,
};

function RankTable({ columns, rows, emptyText, label }) {
  if (!rows.length) return <p className="analytics-empty">{emptyText}</p>;
  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table" aria-label={label}>
        <thead>
          <tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.label}>
                  {column.numeric ? formatNumber(row[column.key]) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
RankTable.propTypes = {
  label: PropTypes.string.isRequired,
  emptyText: PropTypes.string.isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string.isRequired, label: PropTypes.string.isRequired, numeric: PropTypes.bool })).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function MetricBar({ label, value, max, display, hint }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="metric-bar">
      <div className="metric-bar-head"><span>{label}</span><strong>{display}</strong></div>
      <div className="metric-bar-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
      {hint && <p>{hint}</p>}
    </div>
  );
}
MetricBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  display: PropTypes.string.isRequired,
  hint: PropTypes.string,
};

function DashboardSkeleton() {
  return (
    <div className="analytics-skeleton" aria-busy="true" aria-label="Loading analytics">
      <div className="analytics-skeleton-grid">
        {Array.from({ length: 8 }).map((_, index) => <span className="skeleton-card" key={index} />)}
      </div>
      <div className="analytics-skeleton-charts">
        {Array.from({ length: 4 }).map((_, index) => <span className="skeleton-chart" key={index} />)}
      </div>
    </div>
  );
}

const pluralRole = (role) => `${titleCase(role)}s`;

export default function PlatformAnalytics() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedKpi, setSelectedKpi] = useState('');
  const [exportedAt, setExportedAt] = useState('');
  const query = useMemo(() => buildQuery(filters), [filters]);
  const [activeQuery, setActiveQuery] = useState(() => buildQuery(DEFAULT_FILTERS));

  useEffect(() => { if (query) setActiveQuery(query); }, [query]);

  const { data, loading, refreshing, error, reload } = useAnalytics(activeQuery);
  const { live, error: liveError, reload: reloadLive } = useLiveAnalytics(true);

  const update = useCallback((patch) => setFilters((current) => ({ ...current, ...patch })), []);
  const reset = () => { setFilters(DEFAULT_FILTERS); setSelectedKpi(''); };
  const refresh = () => { reload(); reloadLive(); };

  const exportCsv = () => {
    if (!data) return;
    downloadAnalyticsCsv(data);
    setExportedAt(new Date().toISOString());
  };

  const customIncomplete = filters.range === 'custom'
    && (!filters.from || !filters.to || filters.from > filters.to);

  const districts = data?.options?.districts || [];
  const districtOptions = [{ value: '', label: 'All districts' }, ...districts.map((district) => ({ value: district, label: district }))];

  const rangeSummary = data
    ? `${data.range.fromDay} → ${data.range.toDay} · ${data.range.days} day${data.range.days === 1 ? '' : 's'} · ${titleCase(data.range.granularity)} buckets · Asia/Kolkata`
    : '';

  const roleRows = (data?.distributions.usersByRole || []).map((row) => ({ key: row.key, label: pluralRole(row.key), value: row.value }));
  const verificationRows = (data?.distributions.doctorVerification || []).map((row) => ({ key: row.key, label: titleCase(row.key), value: row.value }));
  const statusRows = (data?.distributions.appointmentsByStatus || []).map((row) => ({ key: row.key, label: row.key, value: row.value }));
  const publicationRows = (data?.distributions.hospitalsByPublication || []).map((row) => ({ key: row.key, label: titleCase(row.key), value: row.value }));
  const districtRows = (data?.distributions.doctorsByDistrict || []).map((row) => ({ key: row.key, label: row.key, value: row.value }));
  const hospitalDistrictRows = (data?.distributions.hospitalsByDistrict || []).map((row) => ({ key: row.key, label: row.key, value: row.value }));
  const specializationRows = (data?.distributions.doctorsBySpecialization || []).map((row) => ({ key: row.key, label: row.key, value: row.value }));

  const growthSeries = data
    ? data.trends.registrations.map((point, index) => ({
      bucket: point.bucket,
      cumulative: data.trends.userGrowth[index]?.total ?? 0,
      added: point.total,
    }))
    : [];

  const totalUsersValue = data?.kpis.totalUsers.value || 0;
  const totalAppointmentsValue = data?.kpis.appointments.value || 0;
  const totalDoctorsValue = data?.kpis.doctors.value || 0;

  return (
    <div className="page analytics-page">
      <header className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">Administration</p>
          <h1>Platform analytics</h1>
          <p className="page-subtitle">Live and historical platform figures aggregated by the API from stored CareBridge records. No sample data and no estimated counts.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline" onClick={refresh} disabled={loading || refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={!data}>
            <Download size={15} aria-hidden="true" /> Export CSV
          </button>
        </div>
      </header>

      <section className="panel analytics-toolbar" aria-label="Analytics filters">
        <div className="analytics-toolbar-head">
          <h2><SlidersHorizontal size={16} aria-hidden="true" /> Filters</h2>
          <div className="analytics-toolbar-status">
            {refreshing && <span className="analytics-pill is-busy"><span className="spinner spinner-sm" aria-hidden="true" /> Updating</span>}
            {data && <span className="analytics-pill">Snapshot {formatDateTime(data.generatedAt)}</span>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
          </div>
        </div>

        <div className="analytics-range" role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`range-chip${filters.range === option.value ? ' is-active' : ''}`}
              aria-pressed={filters.range === option.value}
              onClick={() => update({ range: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filters.range === 'custom' && (
          <div className="analytics-custom-range">
            <div className="field analytics-field">
              <label htmlFor="analytics-from">From</label>
              <input id="analytics-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update({ from: event.target.value })} />
            </div>
            <div className="field analytics-field">
              <label htmlFor="analytics-to">To</label>
              <input id="analytics-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update({ to: event.target.value })} />
            </div>
            {customIncomplete && <p className="analytics-hint">Choose both dates; the dashboard keeps the previous range until the custom range is complete.</p>}
          </div>
        )}

        <div className="analytics-filters">
          <FilterSelect id="analytics-role" label="Role" value={filters.role} onChange={(value) => update({ role: value })} options={ROLE_OPTIONS} />
          <FilterSelect id="analytics-verification" label="Verification" value={filters.verification} onChange={(value) => update({ verification: value })} options={VERIFICATION_OPTIONS} />
          <FilterSelect id="analytics-status" label="Appointment status" value={filters.appointmentStatus} onChange={(value) => update({ appointmentStatus: value })} options={STATUS_OPTIONS} />
          <FilterSelect id="analytics-district" label="District" value={filters.district} onChange={(value) => update({ district: value })} options={districtOptions} />
          <FilterSelect id="analytics-granularity" label="Trend interval" value={filters.granularity} onChange={(value) => update({ granularity: value })} options={GRANULARITY_OPTIONS} />
        </div>

        <p className="analytics-hint">
          The date range scopes every trend, activity list and period comparison. Role narrows total accounts, active and online counts, the
          status chart and registration trends; verification narrows doctor breakdowns; appointment status narrows status-based charts and
          activity; district narrows doctor and hospital breakdowns.
        </p>
      </section>

      <section className="analytics-live" aria-labelledby="live-heading">
        <div className="analytics-section-head">
          <div>
            <h2 id="live-heading"><Radio size={17} aria-hidden="true" /> Live platform monitor</h2>
            <p>Refreshes every 30 seconds while this tab is visible{live ? ` · last update ${relativeTime(live.generatedAt)}` : ''}.</p>
          </div>
          <span className={`analytics-live-badge${liveError ? ' is-stale' : ''}`}>
            <span className="live-dot" aria-hidden="true" /> {liveError ? 'Live data unavailable' : 'Live'}
          </span>
        </div>
        <div className="analytics-live-grid">
          <LiveStat icon={Wifi} label="Online now" value={live?.online.total} hint="Heartbeat within 5 minutes" loading={!live && !liveError} />
          <LiveStat icon={UserRound} label="Patients online" value={live?.online.patient} hint="Active patient sessions" loading={!live && !liveError} />
          <LiveStat icon={Stethoscope} label="Doctors online" value={live?.online.doctor} hint="Active doctor sessions" loading={!live && !liveError} />
          <LiveStat icon={ShieldCheck} label="Admins online" value={live?.online.admin} hint="Active administrator sessions" loading={!live && !liveError} />
          <LiveStat icon={CalendarCheck} label="Appointments in progress" value={live?.activeAppointmentsNow} hint="Confirmed and inside the slot time" loading={!live && !liveError} />
          <LiveStat icon={CalendarDays} label="Today's appointments" value={live?.todaysAppointments} hint="Any status, Asia/Kolkata date" loading={!live && !liveError} />
        </div>
        {liveError && <p className="analytics-footnote">{liveError} The last successful snapshot stays on screen.</p>}
      </section>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={refresh}>Try again</button>
        </div>
      )}

      {loading && !data ? <DashboardSkeleton /> : data ? (
        <>
          <section aria-labelledby="kpi-heading" className="analytics-section">
            <div className="analytics-section-head">
              <div>
                <h2 id="kpi-heading">Platform KPIs</h2>
                <p>{rangeSummary}</p>
              </div>
              {exportedAt && <span className="analytics-pill">CSV exported {relativeTime(exportedAt)}</span>}
            </div>
            <div className="kpi-grid">
              {KPI_ORDER.map((key) => (
                data.kpis[key] && (
                  <KpiCard
                    key={key}
                    metricKey={key}
                    metric={data.kpis[key]}
                    icon={ICONS[key]}
                    selected={selectedKpi === key}
                    onSelect={() => setSelectedKpi(selectedKpi === key ? '' : key)}
                  />
                )
              ))}
            </div>
            {selectedKpi && <KpiDetail metricKey={selectedKpi} data={data} onClose={() => setSelectedKpi('')} />}
          </section>

          <section className="analytics-section" aria-labelledby="summary-heading">
            <div className="analytics-section-head">
              <div>
                <h2 id="summary-heading">Rates and averages</h2>
                <p>Derived from the same filtered snapshot.</p>
              </div>
            </div>
            <div className="analytics-rates">
              <MetricBar label="Appointment completion rate" value={data.summary.completionRate} max={100} display={`${data.summary.completionRate}%`} hint={`${formatNumber(data.kpis.completedAppointments.value)} of ${formatNumber(totalAppointmentsValue)} appointments`} />
              <MetricBar label="Cancellation and rejection rate" value={data.summary.cancellationRate} max={100} display={`${data.summary.cancellationRate}%`} hint={`${formatNumber(data.kpis.cancelledAppointments.value + data.kpis.rejectedAppointments.value)} appointments`} />
              <MetricBar label="Doctor verification rate" value={data.summary.verificationRate} max={100} display={`${data.summary.verificationRate}%`} hint={`${formatNumber(data.kpis.verifiedDoctors.value)} of ${formatNumber(totalDoctorsValue)} doctor profiles`} />
              <MetricBar label="Appointments per doctor" value={data.summary.appointmentsPerDoctor} max={Math.max(data.summary.appointmentsPerDoctor, 1)} display={String(data.summary.appointmentsPerDoctor)} hint={`Across ${formatNumber(totalDoctorsValue)} doctor accounts`} />
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="charts-heading">
            <div className="analytics-section-head">
              <div>
                <h2 id="charts-heading">Visual reports</h2>
                <p>Hover or focus a chart for exact values. Every series is the same data returned by the API.</p>
              </div>
            </div>

            <div className="analytics-grid">
              <ChartCard id="growth-chart" title="User growth" description="Cumulative accounts and new registrations in each interval." wide>
                <TrendLines
                  data={growthSeries}
                  series={[{ key: 'cumulative', name: 'Total accounts', tone: 0 }, { key: 'added', name: 'New registrations', tone: 1 }]}
                  ariaLabel="Line chart of cumulative accounts and new registrations over the selected range"
                />
              </ChartCard>

              <ChartCard id="role-chart" title="Users by role" description="Distribution of stored accounts." empty={roleRows.every((row) => row.value === 0)} emptyText="No accounts match the current filters.">
                <PieBreakdown data={roleRows} donut total={totalUsersValue} centerLabel="accounts" ariaLabel="Doughnut chart of accounts by role" />
              </ChartCard>

              <ChartCard id="verification-chart" title="Doctor verification" description="Approved profiles appear in the public directory." empty={verificationRows.every((row) => row.value === 0)} emptyText="No doctor profiles match the current filters.">
                <PieBreakdown data={verificationRows} total={totalDoctorsValue} ariaLabel="Pie chart of doctor verification status" />
              </ChartCard>

              <ChartCard id="status-chart" title="Appointment status" description="Current status of stored appointments." empty={statusRows.every((row) => row.value === 0)} emptyText="No appointments stored yet.">
                <CategoryBars data={statusRows} ariaLabel="Bar chart of appointments by status" />
              </ChartCard>

              <ChartCard id="registration-chart" title="New registrations over time" description="Accounts created in each interval, split by role." empty={data.trends.registrations.every((point) => point.total === 0)} emptyText="No registrations in this range.">
                <StackedTrendBars
                  data={data.trends.registrations}
                  series={[{ key: 'patients', name: 'Patients', tone: 0 }, { key: 'doctors', name: 'Doctors', tone: 1, top: true }]}
                  ariaLabel="Stacked bar chart of new patient and doctor registrations"
                />
              </ChartCard>

              <ChartCard id="booking-chart" title="Appointment activity" description="Requests created per interval by their current status." empty={data.trends.appointments.every((point) => point.booked === 0)} emptyText="No appointment requests in this range.">
                <StackedTrendBars
                  data={data.trends.appointments}
                  series={[
                    { key: 'completed', name: 'Completed', tone: 2 },
                    { key: 'open', name: 'Pending or confirmed', tone: 0 },
                    { key: 'cancelled', name: 'Cancelled or rejected', tone: 4, top: true },
                  ]}
                  ariaLabel="Stacked bar chart of appointment requests by current status"
                />
              </ChartCard>

              <ChartCard id="doctor-district-chart" title="Doctors by district" description="Doctor profiles grouped by their recorded district." empty={districtRows.length === 0} emptyText="No district data in doctor profiles.">
                <CategoryBars data={districtRows} horizontal ariaLabel="Bar chart of doctors by district" />
              </ChartCard>

              <ChartCard id="hospital-district-chart" title="Hospitals by district" description="Directory records grouped by district." empty={hospitalDistrictRows.length === 0} emptyText="No hospital records stored.">
                <CategoryBars data={hospitalDistrictRows} tone="secondary" horizontal ariaLabel="Bar chart of hospitals by district" />
              </ChartCard>

              <ChartCard id="specialization-chart" title="Doctors by specialization" description="Most common specialisations among stored doctor profiles." empty={specializationRows.length === 0} emptyText="No doctor profiles stored." >
                <CategoryBars data={specializationRows} tone="deep" horizontal ariaLabel="Bar chart of doctors by specialization" />
              </ChartCard>

              <ChartCard id="publication-chart" title="Hospital publication" description="Published records are visible in the public directory." empty={publicationRows.every((row) => row.value === 0)} emptyText="No hospital records stored.">
                <CategoryBars data={publicationRows} tone="success" ariaLabel="Bar chart of published and draft hospital records" />
              </ChartCard>

              <ChartCard id="patient-location-chart" title="Patients by district" description="Location analytics for patient accounts." empty emptyText={data.distributions.patientLocations.reason} />
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="activity-heading">
            <div className="analytics-section-head">
              <div>
                <h2 id="activity-heading">Recent platform activity</h2>
                <p>Registrations, verification decisions and bookings are derived from stored timestamps; sign-ins and administrator actions come from the activity log.</p>
              </div>
            </div>
            <div className="analytics-split">
              <section className="panel analytics-feed-panel" aria-label="Platform activity feed">
                <ActivityList items={data.activity} emptyText="No activity recorded in this range." />
              </section>
              <section className="panel analytics-feed-panel" aria-label="Live administrator actions">
                <h3>Latest sign-ins and administrator actions</h3>
                <ActivityList items={live?.activity || []} emptyText="No sign-in or administrator activity recorded yet." />
              </section>
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="tables-heading">
            <div className="analytics-section-head">
              <div>
                <h2 id="tables-heading">Detailed reports</h2>
                <p>Activity inside the selected range, grouped by doctor, hospital and patient.</p>
              </div>
            </div>

            <div className="panel analytics-table-panel">
              <h3><Stethoscope size={16} aria-hidden="true" /> Doctor appointment activity</h3>
              <RankTable
                label="Doctor appointment activity"
                emptyText="No doctor appointments in this range."
                columns={[
                  { key: 'name', label: 'Doctor' },
                  { key: 'specialization', label: 'Specialization' },
                  { key: 'district', label: 'District' },
                  { key: 'appointments', label: 'Appointments', numeric: true },
                  { key: 'completed', label: 'Completed', numeric: true },
                  { key: 'cancelled', label: 'Cancelled or rejected', numeric: true },
                  { key: 'upcoming', label: 'Upcoming', numeric: true },
                ]}
                rows={data.doctorActivity.map((doctor) => ({ ...doctor, key: doctor.id }))}
              />
            </div>

            <div className="analytics-split">
              <section className="panel analytics-table-panel" aria-label="Hospital appointment activity">
                <h3><MapPin size={16} aria-hidden="true" /> Hospital appointment activity</h3>
                <RankTable
                  label="Hospital appointment activity"
                  emptyText="No appointments are linked to a hospital name in this range."
                  columns={[
                    { key: 'hospital', label: 'Hospital' },
                    { key: 'appointments', label: 'Appointments', numeric: true },
                    { key: 'completed', label: 'Completed', numeric: true },
                    { key: 'doctors', label: 'Doctors', numeric: true },
                  ]}
                  rows={data.hospitalActivity.map((hospital) => ({ ...hospital, key: hospital.hospital }))}
                />
              </section>

              <section className="panel analytics-table-panel" aria-label="Patient appointment activity">
                <h3><UserRound size={16} aria-hidden="true" /> Patient appointment activity</h3>
                <RankTable
                  label="Patient appointment activity"
                  emptyText="No patient appointment activity in this range."
                  columns={[
                    { key: 'name', label: 'Patient' },
                    { key: 'appointments', label: 'Appointments', numeric: true },
                  ]}
                  rows={data.patientActivity.map((patient, index) => ({ ...patient, key: `${patient.name}-${index}` }))}
                />
              </section>
            </div>
          </section>

          <section className="panel analytics-provenance" aria-label="Data provenance">
            <h3>How these figures are produced</h3>
            <ul>
              <li>All counts, series and tables come from MongoDB aggregations over the users, doctorprofiles, appointments, hospitals and activities collections.</li>
              <li>Period comparisons use records created before the selected range. Metrics whose history is not stored, such as an appointment&apos;s earlier status, show “No baseline” instead of a percentage.</li>
              <li>Online figures count distinct accounts with an authenticated request or heartbeat in the last five minutes; registered accounts are never counted as online.</li>
              <li>Dates and “today” use Asia/Kolkata. District analytics cover doctor profiles and hospital records; patient accounts store no district.</li>
              <li>Every request requires an administrator session; the endpoints are rate limited and the payload contains no password hashes or session tokens.</li>
            </ul>
          </section>
        </>
      ) : (
        <div className="panel analytics-empty-state">
          <h3>Analytics unavailable</h3>
          <p>{error || 'The server has not returned a snapshot yet.'}</p>
          <button type="button" className="btn btn-primary" onClick={refresh}>Load analytics</button>
        </div>
      )}
    </div>
  );
}
