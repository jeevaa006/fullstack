import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Eye, EyeOff,
  HeartPulse, Hospital, Info, KeyRound, LockKeyhole, LogOut, MapPin, Menu, Pill, RefreshCw,
  Search, ShieldCheck, Stethoscope, UserRound, X,
} from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PropTypes from 'prop-types';
import { AuthProvider } from './context/AuthContext';
import useAuth from './context/useAuth';
import api, { errorMessage } from './services/api';
import './App.css';

const DISCLAIMER = 'CareBridge provides general healthcare-support information only. It does not provide a medical diagnosis and is not a replacement for a qualified healthcare professional. In a medical emergency, contact local emergency services immediately.';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const ROLE_LABEL = { patient: 'Patient', doctor: 'Doctor', admin: 'Administrator' };

const STATUS_TONE = {
  Pending: 'warning',
  Confirmed: 'success',
  Completed: 'info',
  Rejected: 'danger',
  Cancelled: 'danger',
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  active: 'success',
  inactive: 'muted',
  published: 'success',
  unpublished: 'muted',
  demo: 'info',
};

const STATUS_LABEL = {
  approved: 'Verified',
  pending: 'Pending review',
  rejected: 'Not approved',
  active: 'Active',
  inactive: 'Inactive',
  published: 'Published',
  unpublished: 'Unpublished',
};

const doctorIdentifier = (doctor) => {
  if (!doctor) return '';
  if (typeof doctor.user === 'string') return doctor.user;
  return doctor.user?._id || doctor.user?.id || doctor.userId || '';
};
const doctorName = (doctor) => doctor?.name || doctor?.user?.name || 'Doctor';
const initials = (name) => String(name || 'D').replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'D';
const todayISO = () => new Date().toISOString().slice(0, 10);
const formatDate = (date) => (date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const formatShortDate = (date) => (date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—');
const formatMonthYear = (value) => (value ? new Date(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—');
const cleanParams = (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => String(value || '').trim() !== ''));
const safeRedirect = (account, location) => {
  const requested = location.state?.from;
  const candidate = requested && typeof requested.pathname === 'string' ? `${requested.pathname}${requested.search || ''}${requested.hash || ''}` : '';
  return candidate.startsWith('/') && !candidate.startsWith('//') && new URL(candidate, window.location.origin).origin === window.location.origin ? candidate : `/${account.role}`;
};
const hospitalCoords = (hospital) => {
  const point = hospital?.coordinates?.coordinates;
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) ? point : null;
};

/* ------------------------------------------------------------------ */
/* Shared UI primitives                                                */
/* ------------------------------------------------------------------ */

function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-subtitle">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
PageHeader.propTypes = {
  eyebrow: PropTypes.string,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  actions: PropTypes.node,
};

function SectionHeader({ title, description, action, id }) {
  return (
    <div className="section-head">
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
SectionHeader.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string, action: PropTypes.node, id: PropTypes.string };

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false, disabled = false, min, hint, as = 'input', autoComplete }) {
  const id = useId();
  const Component = as;
  return (
    <div className={`field${disabled ? ' is-disabled' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required-mark" aria-hidden="true">*</span>}
      </label>
      <Component
        id={id}
        type={as === 'input' ? type : undefined}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={min}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}
Field.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  type: PropTypes.string,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  min: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  hint: PropTypes.string,
  as: PropTypes.string,
  autoComplete: PropTypes.string,
};

function Alert({ tone = 'info', children, onRetry }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="alert-text">{children}</span>
      {onRetry && <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}><RefreshCw size={14} /> Try again</button>}
    </div>
  );
}
Alert.propTypes = { tone: PropTypes.string, children: PropTypes.node.isRequired, onRetry: PropTypes.func };

function Loading({ label = 'Loading…' }) {
  return <div className="loading-block" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}
Loading.propTypes = { label: PropTypes.string };

function Empty({ icon, title, text, action }) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-icon" aria-hidden="true">{icon}</span>}
      <div>
        <h3>{title}</h3>
        {text && <p>{text}</p>}
      </div>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
Empty.propTypes = { icon: PropTypes.node, title: PropTypes.string.isRequired, text: PropTypes.string, action: PropTypes.node };

function StatusBadge({ status, label }) {
  const tone = STATUS_TONE[status] || 'muted';
  return <span className={`status-badge tone-${tone}`}><span className="status-dot" aria-hidden="true" />{label || STATUS_LABEL[status] || status}</span>;
}
StatusBadge.propTypes = { status: PropTypes.string.isRequired, label: PropTypes.string };

function SearchForm({ children, onSubmit, onClear, busy, submitLabel = 'Search', id }) {
  return (
    <form className="panel search-panel" onSubmit={onSubmit} role="search" aria-label={id}>
      <div className="search-grid">{children}</div>
      <div className="search-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Search size={16} aria-hidden="true" /> {busy ? 'Searching…' : submitLabel}
        </button>
        {onClear && <button type="button" className="btn btn-outline" onClick={onClear}>Clear filters</button>}
      </div>
    </form>
  );
}
SearchForm.propTypes = {
  children: PropTypes.node.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onClear: PropTypes.func,
  busy: PropTypes.bool,
  submitLabel: PropTypes.string,
  id: PropTypes.string,
};

/* ------------------------------------------------------------------ */
/* Application shell                                                   */
/* ------------------------------------------------------------------ */

const NAV_LINKS = {
  patient: [
    { to: '/patient', label: 'Overview', icon: Activity, end: true },
    { to: '/doctors', label: 'Find a doctor', icon: Search },
    { to: '/hospitals', label: 'Hospitals', icon: Hospital },
    { to: '/patient/appointments', label: 'Appointments', icon: CalendarDays },
    { to: '/patient/reminders', label: 'Medicine reminders', icon: Pill },
    { to: '/patient/guidance', label: 'Health guidance', icon: HeartPulse },
    { to: '/patient/profile', label: 'My profile', icon: UserRound },
  ],
  doctor: [
    { to: '/doctor', label: 'Dashboard', icon: Activity, end: true },
    { to: '/doctor/profile', label: 'My profile', icon: UserRound },
    { to: '/doctor/availability', label: 'Availability', icon: CalendarDays },
    { to: '/doctor/appointments', label: 'Appointment requests', icon: CheckCircle2 },
    { to: '/doctor/history', label: 'Appointment history', icon: Clock3 },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: Activity, end: true },
    { to: '/admin/users', label: 'User management', icon: UserRound },
    { to: '/admin/doctors', label: 'Doctor verification', icon: ShieldCheck },
    { to: '/admin/appointments', label: 'Appointment management', icon: CalendarDays },
    { to: '/admin/hospitals', label: 'Hospital management', icon: Hospital },
    { to: '/admin/statistics', label: 'Platform statistics', icon: Activity },
  ],
};

function AppShell() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavId = 'primary-navigation';

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  const logoutAndRedirect = async () => {
    try { await logout(); } finally { window.location.replace('/login'); }
  };

  const routes = (
    <Routes>
      <Route path="/" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} />
      <Route path="/home" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} />
      <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <AuthPage />} />
      <Route path="/register" element={user ? <Navigate to={`/${user.role}`} replace /> : <AuthPage register />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/about" element={<Protected><AboutPage /></Protected>} />
      <Route path="/doctors" element={<Protected><DoctorDirectory /></Protected>} />
      <Route path="/doctors/:id" element={<Protected><DoctorDetail /></Protected>} />
      <Route path="/hospitals" element={<Protected><HospitalDirectory /></Protected>} />
      <Route path="/patient/*" element={<Protected roles={['patient']}><PatientArea /></Protected>} />
      <Route path="/doctor/*" element={<Protected roles={['doctor']}><DoctorArea /></Protected>} />
      <Route path="/admin/*" element={<Protected roles={['admin']}><AdminArea /></Protected>} />
      <Route path="/access-denied" element={<MessagePage title="Access denied" body="This page is not available to your account. Sign in with an account that has the right role." />} />
      <Route path="*" element={user ? <MessagePage title="Page not found" body="The page you requested could not be found." /> : <Navigate to="/login" replace />} />
    </Routes>
  );

  if (loading) {
    return <div className="boot-screen"><span className="spinner" aria-hidden="true" /><p>Loading CareBridge…</p></div>;
  }

  if (!user) {
    const bareAuthRoute = ['/login', '/register'].includes(location.pathname);
    if (bareAuthRoute) return <div className="public-shell">{routes}</div>;
    return (
      <div className="public-shell">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="app-header public-header">
          <Link className="brand" to="/login"><span className="brand-mark"><HeartPulse size={18} aria-hidden="true" /></span><span className="brand-name">CareBridge</span></Link>
          <div className="header-actions">
            <Link className="btn btn-outline btn-sm" to="/login">Log in</Link>
            <Link className="btn btn-primary btn-sm" to="/register">Register</Link>
          </div>
        </header>
        <main className="public-main" id="main-content" tabIndex={-1}>{routes}</main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={mobileNavOpen}
          aria-controls={mobileNavId}
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {mobileNavOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <Link className="brand" to={`/${user.role}`}>
          <span className="brand-mark"><HeartPulse size={18} aria-hidden="true" /></span>
          <span className="brand-name">CareBridge</span>
        </Link>
        <div className="header-actions">
          <div className="account-chip">
            <span className="account-avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="account-text">
              <span className="account-name">{user.name}</span>
              <span className="account-role">{ROLE_LABEL[user.role] || user.role}</span>
            </span>
          </div>
          <button type="button" className="btn btn-outline btn-sm logout-button" onClick={logoutAndRedirect}>
            <LogOut size={15} aria-hidden="true" /><span className="logout-label">Log out</span>
          </button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar user={user} pathname={location.pathname} id={mobileNavId} open={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
        {mobileNavOpen && <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
        <main className="app-main" id="main-content" tabIndex={-1}>
          {routes}
          <AppFooter />
        </main>
      </div>
    </div>
  );
}

function Sidebar({ user, pathname, id, open, onNavigate }) {
  const links = NAV_LINKS[user.role] || [];
  return (
    <aside id={id} className={`app-sidebar${open ? ' is-open' : ''}`} aria-label={`${ROLE_LABEL[user.role]} navigation`}>
      <p className="sidebar-label">{ROLE_LABEL[user.role]} workspace</p>
      <nav>
        {links.map(({ to, label, icon: Icon, end }) => {
          const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link key={to} to={to} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <p className="sidebar-note">CareBridge supports access to care. It does not provide a diagnosis.</p>
    </aside>
  );
}
Sidebar.propTypes = {
  user: PropTypes.shape({ role: PropTypes.string.isRequired }).isRequired,
  pathname: PropTypes.string.isRequired,
  id: PropTypes.string.isRequired,
  open: PropTypes.bool.isRequired,
  onNavigate: PropTypes.func.isRequired,
};

function AppFooter() {
  return (
    <footer className="app-footer">
      <p>CareBridge · Healthcare access, closer to home.</p>
      <p className="footer-meta">
        Kumaraguru College of Technology · Academic project
        <span aria-hidden="true"> · </span><Link to="/about">About</Link>
        <span aria-hidden="true"> · </span><Link to="/privacy">Privacy</Link>
      </p>
    </footer>
  );
}

function MessagePage({ title, body }) {
  return (
    <div className="page page-narrow">
      <div className="panel">
        <Empty title={title} text={body} action={<Link className="btn btn-primary" to="/">Go to my workspace</Link>} />
      </div>
    </div>
  );
}
MessagePage.propTypes = { title: PropTypes.string.isRequired, body: PropTypes.string.isRequired };

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: { pathname: location.pathname, search: location.search, hash: location.hash } }} />;
  return roles && !roles.includes(user.role) ? <Navigate to="/access-denied" replace /> : children;
}
Protected.propTypes = { roles: PropTypes.arrayOf(PropTypes.string), children: PropTypes.node.isRequired };

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

function AuthPage({ register = false }) {
  const [params] = useSearchParams();
  const currentLocation = useLocation();
  const { login, register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState(params.get('role') === 'doctor' ? 'doctor' : 'patient');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', specialization: '', qualification: '', experienceYears: '', consultationFee: '', hospital: '', district: '', biography: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const change = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  // Keep the selected account type in step with the registration link the visitor used.
  useEffect(() => { if (register) setRole(params.get('role') === 'doctor' ? 'doctor' : 'patient'); }, [register, params]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const account = register ? await createAccount(role, form) : await login({ email: form.email, password: form.password });
      navigate(safeRedirect(account, currentLocation), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-aside" aria-hidden="true">
        <div className="auth-aside-brand">
          <span className="brand-mark brand-mark-lg"><HeartPulse size={24} /></span>
          <span>CareBridge</span>
        </div>
        <h2>Healthcare access, closer to home.</h2>
        <p>Find verified doctors, published healthcare centres and keep your appointments in one calm, accessible place.</p>
        <ul className="auth-points">
          <li><ShieldCheck size={18} /> Administrator-reviewed doctor profiles</li>
          <li><CalendarDays size={18} /> Appointment requests with clear status</li>
          <li><KeyRound size={18} /> Secure password sign-in with role-based access</li>
        </ul>
      </section>

      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">CareBridge</p>
          <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
          <p>{register ? 'Register as a patient or apply as a doctor.' : 'Sign in to continue to your workspace.'}</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <form onSubmit={submit} className="auth-form">
          {register && (
            <>
              <div className="role-switch" role="group" aria-label="Account type">
                <button type="button" className={role === 'patient' ? 'active' : ''} aria-pressed={role === 'patient'} onClick={() => setRole('patient')}>Patient</button>
                <button type="button" className={role === 'doctor' ? 'active' : ''} aria-pressed={role === 'doctor'} onClick={() => setRole('doctor')}>Doctor</button>
              </div>
              <Field label="Full name" required value={form.name} onChange={change('name')} placeholder="Your name" autoComplete="name" />
              <Field label="Phone number (optional)" value={form.phone} onChange={change('phone')} placeholder="Contact number" autoComplete="tel" />
            </>
          )}

          <Field label="Email address" type="email" required value={form.email} onChange={change('email')} placeholder="you@example.com" autoComplete="email" />

          <div className="field">
              <label htmlFor="auth-password">Password <span className="required-mark" aria-hidden="true">*</span></label>
              <div className="password-control">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  value={form.password}
                  onChange={(event) => change('password')(event.target.value)}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
          </div>

          {register && role === 'doctor' && (
            <>
              <div className="form-grid">
                <Field label="Specialization" required value={form.specialization} onChange={change('specialization')} placeholder="e.g. General medicine" />
                <Field label="Qualification" required value={form.qualification} onChange={change('qualification')} placeholder="e.g. MBBS" />
                <Field label="Years of experience" type="number" min="0" required value={form.experienceYears} onChange={change('experienceYears')} />
                <Field label="Consultation fee (₹)" type="number" min="0" required value={form.consultationFee} onChange={change('consultationFee')} />
                <Field label="District" required value={form.district} onChange={change('district')} placeholder="Practice district" />
                <Field label="Hospital affiliation (optional)" value={form.hospital} onChange={change('hospital')} placeholder="Hospital or centre" />
              </div>
              <Alert tone="info">New doctor profiles stay pending until an administrator reviews them. Do not submit credentials you cannot evidence.</Alert>
            </>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy && <span className="spinner spinner-light" aria-hidden="true" />}
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-links">
          {register
            ? <Link to="/login">Already have an account? Sign in</Link>
            : <><Link to="/register?role=patient">Create a patient account</Link><span aria-hidden="true">·</span><Link to="/register?role=doctor">Apply as a doctor</Link></>}
        </div>
        <p className="auth-disclaimer">CareBridge is an academic demonstration and not a certified clinical service. In an emergency, contact local emergency services.</p>
      </section>
    </div>
  );
}
AuthPage.propTypes = { register: PropTypes.bool };

/* ------------------------------------------------------------------ */
/* Public content                                                      */
/* ------------------------------------------------------------------ */

function AboutPage() {
  return (
    <div className="page">
      <PageHeader eyebrow="About" title="CareBridge" description="A rural healthcare support platform built as an academic full-stack project at Kumaraguru College of Technology." />
      <div className="split-2">
        <section className="panel">
          <h2>What the platform does</h2>
          <p>CareBridge helps people discover administrator-verified doctors and published healthcare centres, request appointments from doctor-provided availability, and keep personal medicine reminders.</p>
          <p>Doctor profiles are visible in the public directory only after administrator approval. Health-topic search and healthcare news are attributed to their external sources and are separate from your CareBridge records.</p>
        </section>
        <section className="panel">
          <h2>What it does not do</h2>
          <ul className="plain-list">
            <li>It does not provide a diagnosis or replace a qualified healthcare professional.</li>
            <li>Symptom guidance is a small rule-based educational example, not AI or clinical triage.</li>
            <li>Medicine reminders are saved in the application only; no notifications are sent.</li>
            <li>Directory records are not live facility availability or verified service status.</li>
          </ul>
          <p className="muted">{DISCLAIMER}</p>
        </section>
      </div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <div className="page page-narrow">
      <PageHeader eyebrow="Privacy" title="Privacy information" description="What CareBridge stores and what leaves the application." />
      <section className="panel prose">
        <h2>Account and application data</h2>
        <p>Account details and application records are stored by the CareBridge backend for authentication and the workflows you use. Passwords are hashed and are never stored in browser storage. Do not share passwords or enter sensitive medical information.</p>
        <h2>External services</h2>
        <p>Health-topic search sends only the search words you enter to the U.S. National Library of Medicine’s MedlinePlus service. It does not send your account, symptom text, or appointment data. Map tiles are requested from the configured tile provider when a map is shown. Browser location is requested only after you choose “Use my location”; CareBridge does not store your location.</p>
        <h2>Limitations</h2>
        <p>This academic project is not a certified clinical system. Directory data may be incomplete or out of date and does not represent live facility status.</p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Doctor discovery                                                    */
/* ------------------------------------------------------------------ */

function DoctorCard({ doctor }) {
  const id = doctorIdentifier(doctor);
  const name = doctorName(doctor);
  const content = (
    <>
      <div className="card-head">
        <span className="avatar" aria-hidden="true">{initials(name)}</span>
        <div className="card-head-text">
          <h3>{name}</h3>
          <p className="card-specialty"><Stethoscope size={14} aria-hidden="true" /> {doctor.specialization || 'Specialization not listed'}</p>
        </div>
      </div>
      <div className="badge-row">
        <StatusBadge status="approved" label="Approved" />
        {doctor.isDemo && <StatusBadge status="demo" label="Demonstration profile" />}
      </div>
      <dl className="fact-list compact">
        <div><dt>Qualification</dt><dd>{doctor.qualification || 'Not listed'}</dd></div>
        <div><dt>Experience</dt><dd>{doctor.experienceYears != null ? `${doctor.experienceYears} years` : 'Not listed'}</dd></div>
      </dl>
      <div className="card-foot">
        <span className="card-location"><MapPin size={14} aria-hidden="true" /> {doctor.district || 'District not listed'}</span>
        <span className="card-fee">{doctor.consultationFee != null ? `₹${doctor.consultationFee}` : 'Fee not listed'}</span>
      </div>
      {id && <span className="card-link">View profile <ArrowRight size={14} aria-hidden="true" /></span>}
    </>
  );
  return id
    ? <Link className="doctor-card" to={`/doctors/${id}`}>{content}</Link>
    : <div className="doctor-card">{content}</div>;
}
DoctorCard.propTypes = { doctor: PropTypes.object.isRequired };

function DoctorDirectory() {
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => ({ name: params.get('name') || '', specialization: params.get('specialization') || '', district: params.get('district') || '' }));
  const [filters, setFilters] = useState(initial);
  const [doctors, setDoctors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 12 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // useSearchParams returns a new setter whenever the query string changes, so calling it
  // directly would give `search` a new identity and re-run the mount effect below with the
  // original URL filters, discarding the filters the user just submitted.
  const setParamsRef = useRef(setParams);
  useEffect(() => { setParamsRef.current = setParams; }, [setParams]);

  const search = useCallback(async (values, page = 1) => {
    setLoading(true);
    setError('');
    const query = cleanParams(values);
    setParamsRef.current(new URLSearchParams(query));
    try {
      const { data } = await api.get('/doctors', { params: { ...query, page, limit: 12 } });
      setDoctors(data.doctors);
      setPagination(data.pagination || { page: 1, pages: 1, total: data.doctors.length, limit: 12 });
    } catch (err) {
      setError(errorMessage(err));
      setDoctors([]);
      setPagination({ page: 1, pages: 1, total: 0, limit: 12 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { search(initial); }, [initial, search]);

  const submit = (event) => { event.preventDefault(); search(filters); };
  const clear = () => { const empty = { name: '', specialization: '', district: '' }; setFilters(empty); search(empty); };
  const firstResult = (pagination.page - 1) * pagination.limit + 1;
  const lastResult = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="page">
      <PageHeader
        title="Find a doctor"
        description="Search administrator-approved professionals by name, specialization or district."
      />

      <SearchForm onSubmit={submit} onClear={clear} busy={loading} id="doctor search">
        <Field label="Doctor name" value={filters.name} onChange={(value) => setFilters({ ...filters, name: value })} placeholder="e.g. Priya Raman" />
        <Field label="Specialization" value={filters.specialization} onChange={(value) => setFilters({ ...filters, specialization: value })} placeholder="e.g. Paediatrics" />
        <Field label="District" value={filters.district} onChange={(value) => setFilters({ ...filters, district: value })} placeholder="e.g. Coimbatore" />
      </SearchForm>

      {loading ? <Loading label="Loading doctors…" /> : error ? (
        <Alert tone="error" onRetry={() => search(filters)}>{error}</Alert>
      ) : doctors.length ? (
        <section aria-label="Doctor search results">
          <SectionHeader
            title="Doctors"
            description={pagination.total ? `Showing ${firstResult}–${lastResult} of ${pagination.total} approved ${pagination.total === 1 ? 'profile' : 'profiles'}.` : 'No approved profiles match your search.'}
          />
          <div className="card-grid">{doctors.map((doctor) => <DoctorCard key={doctor._id} doctor={doctor} />)}</div>
          {pagination.pages > 1 && (
            <nav className="pagination" aria-label="Doctor search pages">
              <button type="button" className="btn btn-outline btn-sm" disabled={pagination.page <= 1} onClick={() => search(filters, pagination.page - 1)}>Previous</button>
              <span>Page {pagination.page} of {pagination.pages}</span>
              <button type="button" className="btn btn-outline btn-sm" disabled={pagination.page >= pagination.pages} onClick={() => search(filters, pagination.page + 1)}>Next</button>
            </nav>
          )}
        </section>
      ) : (
        <Empty
          icon={<Search size={20} />}
          title="No doctors found"
          text="No approved profiles match these filters. Try a different name, specialization or district."
          action={<button type="button" className="btn btn-outline" onClick={clear}>Clear filters</button>}
        />
      )}
    </div>
  );
}

function DoctorDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slotError, setSlotError] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('in-person');
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const [booking, setBooking] = useState(false);

  const loadSlots = useCallback(async () => {
    try {
      const { data } = await api.get(`/doctors/${id}/availability`);
      setSlots(Array.isArray(data.availability) ? data.availability : []);
      setSlotError('');
    } catch (err) {
      setSlots([]);
      setSlotError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/doctors/${id}`)
      .then(({ data }) => { if (!cancelled) setProfile(data.doctor); })
      .catch((err) => { if (!cancelled) setError(err.response?.status === 404 ? 'This doctor profile is not available. It may still be awaiting administrator approval.' : errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    loadSlots();
    return () => { cancelled = true; };
  }, [id, loadSlots]);

  const book = async () => {
    if (!selected || !profile) return;
    setBooking(true);
    setNotice('');
    try {
      await api.post('/appointments', {
        doctorId: id,
        appointmentDate: selected.split('|')[0],
        startTime: selected.split('|')[1],
        reason,
        consultationMode: mode,
      });
      setNotice('Your appointment request has been submitted. The doctor will confirm or reject it.');
      setReason('');
      setSelected('');
      await loadSlots();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBooking(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <PageHeader title="Doctor details" description="Professional profile and appointment availability." actions={<Link className="btn btn-outline" to="/doctors"><ArrowLeft size={16} /> Back to search</Link>} />
        <Alert tone="error">{error}</Alert>
        <Empty title="Profile unavailable" text="Return to the directory to choose another approved doctor." action={<Link className="btn btn-primary" to="/doctors">Find a doctor</Link>} />
      </div>
    );
  }
  if (loading || !profile) return <div className="page"><Loading label="Loading doctor profile…" /></div>;

  const name = doctorName(profile);
  const approved = profile.verificationStatus === 'approved';
  const isDemo = profile.isDemo === true;
  // Demonstration profiles are bookable so the end-to-end journey can be exercised,
  // but the appointment is clearly labelled as sample data below rather than care.
  const canBook = user?.role === 'patient' && approved;
  const selectedSlot = slots.find((slot) => `${slot.date}|${slot.startTime}` === selected);
  const upcomingSlots = slots.filter((slot) => slot.date >= todayISO());

  return (
    <div className="page">
      <PageHeader
        title="Doctor details"
        description="Professional information published by this doctor and reviewed by an administrator."
        actions={<Link className="btn btn-outline" to="/doctors"><ArrowLeft size={16} /> Back to search</Link>}
      />

      <section className="panel profile-hero">
        <span className="avatar avatar-lg" aria-hidden="true">{initials(name)}</span>
        <div className="profile-hero-text">
          <div className="badge-row">
            <StatusBadge status={approved ? 'approved' : 'pending'} label={approved ? 'Approved doctor' : 'Pending review'} />
            {profile.isDemo && <StatusBadge status="demo" label="Demonstration profile — not a real doctor" />}
          </div>
          <h2>{name}</h2>
          <p className="profile-role">{profile.specialization || 'Specialization not listed'}</p>
          {(profile.biography || profile.bio) && <p className="profile-bio">{profile.biography || profile.bio}</p>}
        </div>
      </section>

      <section className="panel" aria-label="Professional information">
        <h2 className="panel-title">Professional information</h2>
        <dl className="fact-grid">
          <div><dt>Qualification</dt><dd>{profile.qualification || 'Not listed'}</dd></div>
          <div><dt>Experience</dt><dd>{profile.experienceYears != null ? `${profile.experienceYears} years` : 'Not listed'}</dd></div>
          <div><dt>Consultation fee</dt><dd>{profile.consultationFee != null ? `₹${profile.consultationFee}` : 'Not listed'}</dd></div>
          <div><dt>District</dt><dd>{profile.district || 'Not listed'}</dd></div>
          <div><dt>Location</dt><dd>{[profile.city, profile.state].filter(Boolean).join(', ') || profile.district || 'Not listed'}</dd></div>
          <div><dt>Hospital affiliation</dt><dd>{profile.hospitalName || profile.hospital || 'Not listed'}</dd></div>
        </dl>
      </section>

      <section className="panel booking-panel" aria-labelledby="booking-heading">
        <SectionHeader id="booking-heading" title="Request an appointment" description="Choose one of the slots this doctor has published." />

        {notice && <Alert tone={notice.startsWith('Your appointment') ? 'success' : 'error'}>{notice}</Alert>}
        {slotError && <Alert tone="warning">Available slots could not be loaded. {slotError}</Alert>}

        {!approved && <Alert tone="warning">This profile is not approved yet, so booking is unavailable.</Alert>}
        {approved && isDemo && <Alert tone="info">This is a demonstration profile, not a real doctor. Requests you send here are sample records for this academic project and are not delivered to any clinic.</Alert>}
        {approved && !isDemo && !canBook && <Alert tone="info">Only patient accounts can request an appointment. You are signed in as a {ROLE_LABEL[user?.role]?.toLowerCase()}.</Alert>}

        {upcomingSlots.length ? (
          <div className="slot-grid" role="group" aria-label="Available appointment slots">
            {upcomingSlots.map((slot) => {
              const key = `${slot.date}|${slot.startTime}`;
              const isSelected = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`slot-button${isSelected ? ' is-selected' : ''}`}
                  aria-pressed={isSelected}
                  disabled={!slot.available || !canBook}
                  onClick={() => setSelected(key)}
                >
                  <strong>{formatShortDate(slot.date)}</strong>
                  <span>{slot.startTime}–{slot.endTime}</span>
                  <small>{slot.available ? (isSelected ? 'Selected' : 'Available') : 'Already requested'}</small>
                </button>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={<CalendarDays size={20} />}
            title="No appointment slots published"
            text="This doctor has not published upcoming availability. Check the profile again later or choose another doctor."
            action={<Link className="btn btn-outline" to="/doctors">Browse other doctors</Link>}
          />
        )}

        <div className="booking-form">
          <Field
            label="Reason for visit"
            as="textarea"
            value={reason}
            onChange={setReason}
            placeholder="Briefly describe what you would like help with (minimum 3 characters)"
            hint="Do not include sensitive medical records or emergency information."
            required
          />
          <div className="field">
            <label htmlFor="consultation-mode">Consultation mode</label>
            <select id="consultation-mode" value={mode} onChange={(event) => setMode(event.target.value)} disabled={!canBook}>
              <option value="in-person">In person</option>
              <option value="online">Online request</option>
            </select>
            {mode === 'online' && <p className="field-hint">Online is a request mode only. No video link is created.</p>}
          </div>
        </div>

        <div className="booking-actions">
          <button type="button" className="btn btn-primary" disabled={!canBook || !selected || reason.trim().length < 3 || booking} onClick={book}>
            {booking ? <span className="spinner spinner-light" aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
            {booking ? 'Submitting…' : 'Request this slot'}
          </button>
          {selectedSlot && <p className="booking-summary">{formatDate(selectedSlot.date)} · {selectedSlot.startTime}–{selectedSlot.endTime}</p>}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hospitals                                                           */
/* ------------------------------------------------------------------ */

function HospitalCard({ hospital }) {
  const coords = hospitalCoords(hospital);
  const mapLink = `https://www.openstreetmap.org/search?query=${encodeURIComponent([hospital.name, hospital.district].filter(Boolean).join(', '))}`;
  return (
    <article className="hospital-card">
      <div className="card-head">
        <span className="avatar avatar-square" aria-hidden="true"><Hospital size={18} /></span>
        <div className="card-head-text">
          <h3>{hospital.name}</h3>
          <p className="card-location"><MapPin size={14} aria-hidden="true" /> {hospital.district || 'District not listed'}</p>
        </div>
      </div>
      <p className="hospital-address">{hospital.address}</p>
      {hospital.contact && <p className="hospital-contact">Contact: {hospital.contact}</p>}
      {Array.isArray(hospital.services) && hospital.services.length > 0 && (
        <ul className="chip-list" aria-label="Listed services">
          {hospital.services.map((service) => <li key={service} className="chip">{service}</li>)}
        </ul>
      )}
      <div className="card-foot">
        <span className="muted">{hospital.source ? `Source: ${hospital.source}` : 'Source not recorded'}</span>
        <a className="text-link" href={mapLink} target="_blank" rel="noopener noreferrer">Open in maps <ArrowRight size={14} aria-hidden="true" /></a>
      </div>
      {coords && <p className="map-note">Directory coordinates recorded. Not live facility status.</p>}
    </article>
  );
}
HospitalCard.propTypes = { hospital: PropTypes.object.isRequired };

let nextMapId = 0;
function MapBounds({ hospitals }) {
  const map = useMap();
  useEffect(() => {
    if (hospitals.length === 1) {
      const [longitude, latitude] = hospitalCoords(hospitals[0]);
      map.setView([latitude, longitude], 12);
    } else if (hospitals.length > 1) {
      map.fitBounds(hospitals.map((hospital) => { const [longitude, latitude] = hospitalCoords(hospital); return [latitude, longitude]; }), { padding: [24, 24], maxZoom: 12 });
    }
  }, [hospitals, map]);
  return null;
}
MapBounds.propTypes = { hospitals: PropTypes.arrayOf(PropTypes.object).isRequired };

function LocationListener({ mapId }) {
  const map = useMap();
  useEffect(() => {
    const move = (event) => map.flyTo(event.detail, Math.max(map.getZoom(), 10));
    const eventName = `carebridge-map-location-${mapId}`;
    window.addEventListener(eventName, move);
    return () => window.removeEventListener(eventName, move);
  }, [map, mapId]);
  return null;
}
LocationListener.propTypes = { mapId: PropTypes.number.isRequired };

function HospitalMap({ hospitals }) {
  const [mapId] = useState(() => { nextMapId += 1; return nextMapId; });
  const [locationError, setLocationError] = useState('');
  const locate = () => {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Location access is not available in this browser. Search by district instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => window.dispatchEvent(new CustomEvent(`carebridge-map-location-${mapId}`, { detail: [coords.latitude, coords.longitude] })),
      () => setLocationError('Location was not shared. You can continue searching by district.'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <section className="panel map-panel" aria-labelledby="map-heading">
      <SectionHeader
        id="map-heading"
        title="Map of listed centres"
        description="Only directory records with explicitly entered coordinates are mapped. Markers do not indicate live services."
        action={<button type="button" className="btn btn-outline btn-sm" onClick={locate}><MapPin size={15} /> Use my location</button>}
      />
      {locationError && <p className="muted" role="status">{locationError}</p>}
      <div className="map-frame">
        <MapContainer className="hospital-map" center={[11.0168, 76.9558]} zoom={8} scrollWheelZoom={false}>
          <TileLayer
            url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          />
          <MapBounds hospitals={hospitals} />
          {hospitals.map((hospital) => {
            const [longitude, latitude] = hospitalCoords(hospital);
            return (
              <Marker key={hospital._id} position={[latitude, longitude]}>
                <Popup>
                  <strong>{hospital.name}</strong><br />{hospital.address}
                  {hospital.district ? <><br />{hospital.district}</> : null}
                </Popup>
              </Marker>
            );
          })}
          <LocationListener mapId={mapId} />
        </MapContainer>
      </div>
      <p className="map-attribution">Map tiles © OpenStreetMap contributors. <a href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noopener noreferrer">Tile usage policy</a>.</p>
    </section>
  );
}
HospitalMap.propTypes = { hospitals: PropTypes.arrayOf(PropTypes.object).isRequired };

function HospitalDirectory() {
  const [filters, setFilters] = useState({ q: '', district: '', service: '' });
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const search = useCallback(async (values) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/hospitals', { params: { ...cleanParams(values), limit: 50 } });
      setHospitals(data.hospitals);
    } catch (err) {
      setError(errorMessage(err));
      setHospitals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { search({ q: '', district: '', service: '' }); }, [search]);

  const clear = () => { const empty = { q: '', district: '', service: '' }; setFilters(empty); search(empty); };
  const mapped = hospitals.filter((hospital) => hospitalCoords(hospital));

  return (
    <div className="page">
      <PageHeader
        title="Hospitals and healthcare centres"
        description="Published directory records. Listings are geographic references, not live service availability."
      />

      <SearchForm onSubmit={(event) => { event.preventDefault(); search(filters); }} onClear={clear} busy={loading} id="hospital search">
        <Field label="Centre or address" value={filters.q} onChange={(value) => setFilters({ ...filters, q: value })} placeholder="Search published listings" />
        <Field label="District" value={filters.district} onChange={(value) => setFilters({ ...filters, district: value })} placeholder="e.g. Coimbatore" />
        <Field label="Service" value={filters.service} onChange={(value) => setFilters({ ...filters, service: value })} placeholder="e.g. Emergency" />
      </SearchForm>

      {loading ? <Loading label="Loading centres…" /> : error ? (
        <Alert tone="error" onRetry={() => search(filters)}>{error}</Alert>
      ) : hospitals.length ? (
        <>
          <section aria-label="Healthcare centre results">
            <SectionHeader title="Healthcare centres" description={`${hospitals.length} published ${hospitals.length === 1 ? 'record' : 'records'}.`} />
            <div className="card-grid">{hospitals.map((hospital) => <HospitalCard key={hospital._id} hospital={hospital} />)}</div>
          </section>
          {mapped.length > 0 && <HospitalMap hospitals={mapped} />}
        </>
      ) : (
        <Empty
          icon={<Hospital size={20} />}
          title="No published centres found"
          text="Centre listings appear after an administrator adds and publishes a directory record. Try a different district or service."
          action={<button type="button" className="btn btn-outline" onClick={clear}>Clear filters</button>}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Patient area                                                        */
/* ------------------------------------------------------------------ */

function PatientArea() {
  return (
    <Routes>
      <Route index element={<PatientDashboard />} />
      <Route path="appointments" element={<AppointmentsPage role="patient" />} />
      <Route path="reminders" element={<Reminders />} />
      <Route path="guidance" element={<HealthGuidance />} />
      <Route path="profile" element={<PatientProfile />} />
    </Routes>
  );
}

function PatientDashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([api.get('/appointments', { params: { limit: 50 } }), api.get('/reminders')]).then(([appointmentsResult, remindersResult]) => {
      const errors = [];
      if (appointmentsResult.status === 'fulfilled') setAppointments(appointmentsResult.value.data.appointments);
      else errors.push(errorMessage(appointmentsResult.reason));
      if (remindersResult.status === 'fulfilled') setReminders(remindersResult.value.data.reminders);
      else errors.push(errorMessage(remindersResult.reason));
      if (errors.length) setError(errors.join(' '));
    }).finally(() => setLoading(false));
  }, []);

  const today = todayISO();
  const upcoming = appointments
    .filter((appointment) => ['Pending', 'Confirmed'].includes(appointment.status) && appointment.appointmentDate >= today)
    .sort((a, b) => `${a.appointmentDate} ${a.startTime}`.localeCompare(`${b.appointmentDate} ${b.startTime}`));
  const firstName = user?.name?.trim()?.split(/\s+/)[0];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Patient overview"
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        description="Your appointments, reminders and care shortcuts in one place."
        actions={<Link className="btn btn-primary" to="/doctors"><Search size={16} aria-hidden="true" /> Find a doctor</Link>}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="summary-grid">
        <Link className="metric" to="/patient/appointments">
          <span className="metric-icon"><CalendarDays size={18} aria-hidden="true" /></span>
          <span className="metric-label">Upcoming appointments</span>
          <strong className="metric-value">{loading ? '—' : upcoming.length}</strong>
        </Link>
        <Link className="metric" to="/patient/appointments">
          <span className="metric-icon"><Clock3 size={18} aria-hidden="true" /></span>
          <span className="metric-label">Pending requests</span>
          <strong className="metric-value">{loading ? '—' : appointments.filter((item) => item.status === 'Pending').length}</strong>
        </Link>
        <Link className="metric" to="/patient/appointments">
          <span className="metric-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
          <span className="metric-label">Confirmed</span>
          <strong className="metric-value">{loading ? '—' : appointments.filter((item) => item.status === 'Confirmed').length}</strong>
        </Link>
        <Link className="metric" to="/patient/reminders">
          <span className="metric-icon"><Pill size={18} aria-hidden="true" /></span>
          <span className="metric-label">Active reminders</span>
          <strong className="metric-value">{loading ? '—' : reminders.filter((item) => item.active).length}</strong>
        </Link>
      </div>

      <section className="panel" aria-labelledby="upcoming-heading">
        <SectionHeader
          id="upcoming-heading"
          title="Upcoming appointments"
          description="Pending and confirmed visits from today onward."
          action={<Link className="text-link" to="/patient/appointments">All appointments <ArrowRight size={14} aria-hidden="true" /></Link>}
        />
        {loading ? <Loading /> : upcoming.length ? (
          <ul className="list">
            {upcoming.slice(0, 4).map((appointment) => (
              <li className="list-row" key={appointment._id}>
                <span className="date-block">
                  <strong>{formatShortDate(appointment.appointmentDate)}</strong>
                  <span>{appointment.startTime}–{appointment.endTime}</span>
                </span>
                <span className="list-main">
                  <strong>{appointment.doctor?.name || 'Doctor'}</strong>
                  <small>{appointment.reason || 'Appointment'} · {appointment.consultationMode === 'online' ? 'Online request' : 'In person'}</small>
                </span>
                <StatusBadge status={appointment.status} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            icon={<CalendarDays size={20} />}
            title="No upcoming appointments"
            text="Book a visit with an approved doctor and it will appear here."
            action={<Link className="btn btn-primary" to="/doctors">Find a doctor</Link>}
          />
        )}
      </section>

      <div className="split-2">
        <section className="panel">
          <h2 className="panel-title">Care shortcuts</h2>
          <ul className="link-list">
            <li><Link to="/doctors"><Search size={17} aria-hidden="true" /><span><strong>Find a doctor</strong><small>Search approved professionals</small></span><ArrowRight size={15} aria-hidden="true" /></Link></li>
            <li><Link to="/hospitals"><Hospital size={17} aria-hidden="true" /><span><strong>Hospital directory</strong><small>Published healthcare centres</small></span><ArrowRight size={15} aria-hidden="true" /></Link></li>
            <li><Link to="/patient/reminders"><Pill size={17} aria-hidden="true" /><span><strong>Medicine reminders</strong><small>Your personal schedule</small></span><ArrowRight size={15} aria-hidden="true" /></Link></li>
            <li><Link to="/patient/guidance"><HeartPulse size={17} aria-hidden="true" /><span><strong>Health guidance</strong><small>Educational information and sources</small></span><ArrowRight size={15} aria-hidden="true" /></Link></li>
          </ul>
        </section>

        <section className="panel">
          <SectionHeader title="Today’s reminders" action={<Link className="text-link" to="/patient/reminders">Manage</Link>} />
          {loading ? <Loading /> : reminders.length ? (
            <ul className="list">
              {reminders.filter((item) => item.active).slice(0, 4).map((reminder) => (
                <li className="list-row" key={reminder._id}>
                  <span className="list-icon"><Pill size={16} aria-hidden="true" /></span>
                  <span className="list-main">
                    <strong>{reminder.medicineName}</strong>
                    <small>{reminder.reminderTime} · until {formatShortDate(reminder.endDate)}</small>
                  </span>
                  <StatusBadge status="active" />
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              icon={<Pill size={20} />}
              title="No medicine reminders"
              text="Add a reminder to keep your own schedule in one place."
              action={<Link className="btn btn-outline" to="/patient/reminders">Add a reminder</Link>}
            />
          )}
          <p className="muted small">Reminders are saved in your account. CareBridge does not send notifications.</p>
        </section>
      </div>
    </div>
  );
}

function AppointmentsPage({ role, view = 'all' }) {
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const endpoint = role === 'admin' ? '/admin/appointments' : '/appointments';
      const { data } = await api.get(endpoint, { params: { limit: 50, ...(role === 'admin' && statusFilter ? { status: statusFilter } : {}) } });
      setItems(data.appointments);
    } catch (err) {
      setError(errorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [role, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (role === 'admin' || view === 'all') return items;
    if (view === 'requests') return items.filter((item) => ['Pending', 'Confirmed'].includes(item.status));
    if (view === 'history') return items.filter((item) => ['Completed', 'Rejected', 'Cancelled'].includes(item.status));
    return items;
  }, [items, role, view]);

  const titles = {
    patient: 'My appointments',
    requests: 'Appointment requests',
    history: 'Appointment history',
    admin: 'Appointment management',
  };
  const descriptions = {
    patient: 'Every appointment request and its current status.',
    requests: 'Requests waiting for your decision and confirmed visits.',
    history: 'Completed, rejected and cancelled appointments.',
    admin: 'All appointment records across the platform.',
  };
  const pageKey = role === 'admin' ? 'admin' : role === 'patient' ? 'patient' : view;

  return (
    <div className="page">
      <PageHeader title={titles[pageKey] || 'Appointments'} description={descriptions[pageKey]} />

      {role === 'admin' && (
        <div className="toolbar">
          <label className="field inline-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed'].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={15} /> Refresh</button>
        </div>
      )}

      {loading ? <Loading label="Loading appointments…" /> : error ? (
        <Alert tone="error" onRetry={load}>{error}</Alert>
      ) : visible.length ? (
        <AppointmentTable appointments={visible} role={role} onChanged={load} />
      ) : (
        <Empty
          icon={<CalendarDays size={20} />}
          title={view === 'history' ? 'No appointment history yet' : 'No appointments found'}
          text={role === 'patient'
            ? 'Your appointment records will appear here after you request a visit.'
            : view === 'history' ? 'Completed, rejected and cancelled appointments will appear here.' : 'Appointment records appear here when a booking is made.'}
          action={role === 'patient' ? <Link className="btn btn-primary" to="/doctors">Find a doctor</Link> : null}
        />
      )}
    </div>
  );
}
AppointmentsPage.propTypes = { role: PropTypes.string.isRequired, view: PropTypes.string };

function AppointmentTable({ appointments, role, onChanged }) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const update = async (appointment, status) => {
    setBusyId(appointment._id);
    setError('');
    try {
      await api.patch(`/appointments/${appointment._id}/status`, { status });
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const cancel = (appointment) => {
    if (window.confirm('Cancel this appointment? This cannot be undone.')) update(appointment, 'Cancelled');
  };

  const actionsFor = (appointment) => {
    const busy = busyId === appointment._id;
    if (role === 'doctor' && appointment.status === 'Pending') {
      return <><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => update(appointment, 'Confirmed')}>Accept</button><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => update(appointment, 'Rejected')}>Reject</button></>;
    }
    if (role === 'doctor' && appointment.status === 'Confirmed') {
      return <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => update(appointment, 'Completed')}>Mark completed</button>;
    }
    if ((role === 'patient' || role === 'admin') && ['Pending', 'Confirmed'].includes(appointment.status)) {
      return <button type="button" className="btn btn-outline btn-sm btn-danger-text" disabled={busy} onClick={() => cancel(appointment)}>Cancel</button>;
    }
    return <span className="muted small">No actions</span>;
  };

  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{role === 'admin' ? 'Patient and doctor' : role === 'patient' ? 'Doctor' : 'Patient'}</th>
              <th scope="col">Reason</th>
              <th scope="col">Date</th>
              <th scope="col">Time</th>
              <th scope="col">Mode</th>
              <th scope="col">Status</th>
              <th scope="col" className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => (
              <tr key={appointment._id}>
                <td data-label="With">
                  <strong>{role === 'patient' ? (appointment.doctor?.name || 'Doctor') : role === 'doctor' ? (appointment.patient?.name || 'Patient') : `${appointment.patient?.name || 'Patient'} → ${appointment.doctor?.name || 'Doctor'}`}</strong>
                  {role !== 'patient' && <small className="cell-sub">{appointment.patient?.email || ''}</small>}
                </td>
                <td data-label="Reason">{appointment.reason}</td>
                <td data-label="Date">{formatDate(appointment.appointmentDate)}</td>
                <td data-label="Time">{appointment.startTime}–{appointment.endTime}</td>
                <td data-label="Mode">{appointment.consultationMode === 'online' ? 'Online request' : 'In person'}</td>
                <td data-label="Status"><StatusBadge status={appointment.status} /></td>
                <td data-label="Actions" className="col-actions"><div className="table-actions">{actionsFor(appointment)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
AppointmentTable.propTypes = { appointments: PropTypes.arrayOf(PropTypes.object).isRequired, role: PropTypes.string.isRequired, onChanged: PropTypes.func };

function Reminders() {
  const emptyForm = { medicineName: '', reminderTime: '', startDate: '', endDate: '', instructions: '' };
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/reminders');
      setItems(data.reminders);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (editing) await api.patch(`/reminders/${editing}`, form);
      else await api.post('/reminders', form);
      setForm(emptyForm);
      setEditing('');
      setMessage(editing ? 'Reminder updated.' : 'Reminder added.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item) => {
    setError('');
    try {
      await api.patch(`/reminders/${item._id}`, { active: !item.active });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (item) => {
    if (!window.confirm('Delete this reminder?')) return;
    setError('');
    try {
      await api.delete(`/reminders/${item._id}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <PageHeader title="Medicine reminders" description="Keep your own medicine schedule in CareBridge. This is a personal reference, not a prescription." />

      <div className="split-2 align-start">
        <section className="panel">
          <h2 className="panel-title">{editing ? 'Edit reminder' : 'Add a reminder'}</h2>
          {error && <Alert tone="error">{error}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}
          <form onSubmit={submit} className="form-grid">
            <Field label="Medicine name" required value={form.medicineName} onChange={update('medicineName')} placeholder="Name as written on your medicine" />
            <Field label="Reminder time" type="time" required value={form.reminderTime} onChange={update('reminderTime')} />
            <Field label="Start date" type="date" required value={form.startDate} onChange={update('startDate')} />
            <Field label="End date" type="date" required value={form.endDate} onChange={update('endDate')} />
            <div className="span-all">
              <Field label="Instructions (optional)" as="textarea" value={form.instructions} onChange={update('instructions')} placeholder="Personal note" hint="Do not enter dosages unless your prescriber gave them to you." />
            </div>
            <div className="form-actions span-all">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add reminder'}</button>
              {editing && <button type="button" className="btn btn-outline" onClick={() => { setForm(emptyForm); setEditing(''); }}>Cancel</button>}
            </div>
          </form>
        </section>

        <section className="panel">
          <SectionHeader title="Saved reminders" description="Only your own reminders are shown." />
          {loading ? <Loading /> : items.length ? (
            <ul className="list">
              {items.map((item) => (
                <li className="list-row wrap" key={item._id}>
                  <span className="list-icon"><Pill size={16} aria-hidden="true" /></span>
                  <span className="list-main">
                    <strong>{item.medicineName}</strong>
                    <small>{item.reminderTime} · {formatShortDate(item.startDate)} – {formatShortDate(item.endDate)}{item.instructions ? ` · ${item.instructions}` : ''}</small>
                  </span>
                  <StatusBadge status={item.active ? 'active' : 'inactive'} />
                  <span className="row-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setForm({ medicineName: item.medicineName, reminderTime: item.reminderTime, startDate: item.startDate, endDate: item.endDate, instructions: item.instructions || '' }); setEditing(item._id); setMessage(''); }}>Edit</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(item)}>{item.active ? 'Deactivate' : 'Reactivate'}</button>
                    <button type="button" className="btn btn-ghost btn-sm btn-danger-text" onClick={() => remove(item)}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Pill size={20} />} title="No reminders yet" text="Add a reminder using the form to keep your schedule in one place." />
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Health guidance                                                     */
/* ------------------------------------------------------------------ */

function HealthGuidance() {
  const [symptoms, setSymptoms] = useState('');
  const [result, setResult] = useState('');
  const [query, setQuery] = useState('');
  const [topics, setTopics] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [cached, setCached] = useState(false);
  const [stale, setStale] = useState(false);

  const guidance = (event) => {
    event.preventDefault();
    const text = symptoms.toLowerCase();
    const emergency = ['chest pain', 'difficulty breathing', 'cannot breathe', 'unconscious', 'severe bleeding', 'stroke', 'seizure'].some((term) => text.includes(term));
    setResult(emergency
      ? 'Your description may include warning signs. This tool cannot assess an emergency. Please contact local emergency services or seek urgent professional medical evaluation now.'
      : 'This educational example cannot tell what is causing symptoms. If symptoms are severe, new, worsening, persistent or concerning, contact a qualified healthcare professional for an assessment.');
  };

  const searchTopics = async (event) => {
    event.preventDefault();
    setSearching(true);
    setSearchError('');
    try {
      const { data } = await api.get('/health-information/search', { params: { q: query } });
      setTopics(data.topics || []);
      setCached(data.cached === true);
      setStale(data.stale === true);
    } catch (err) {
      setSearchError(errorMessage(err));
      setTopics([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Health guidance" description="Educational information and attributed external sources. This is not a diagnosis." />

      <div className="notice-banner">
        <Info size={20} aria-hidden="true" />
        <div>
          <strong>Educational symptom guidance, not AI or triage</strong>
          <p>CareBridge uses a short local rule-based example. Your description is not sent to an external service, is not stored, and cannot diagnose a condition.</p>
        </div>
      </div>

      <div className="split-2 align-start">
        <section className="panel">
          <h2 className="panel-title">General symptom guidance</h2>
          <form onSubmit={guidance} className="stack">
            <Field label="Describe what you are experiencing (optional)" as="textarea" value={symptoms} onChange={setSymptoms} placeholder="Share only what you are comfortable entering" />
            <button type="submit" className="btn btn-primary">Show general guidance</button>
          </form>
          {result && <Alert tone="warning">{result}</Alert>}
        </section>

        <section className="panel">
          <h2 className="panel-title">Search health topics</h2>
          <p className="muted">Search sends only these keywords to the U.S. National Library of Medicine’s MedlinePlus service. Topics are in English.</p>
          <form className="search-inline" onSubmit={searchTopics}>
            <Field label="Health topic" value={query} onChange={setQuery} placeholder="e.g. diabetes" required />
            <button type="submit" className="btn btn-primary" disabled={searching || query.trim().length < 2}>
              {searching ? 'Searching…' : 'Search topics'} <Search size={15} aria-hidden="true" />
            </button>
          </form>
          {searchError && <Alert tone="error">{searchError}</Alert>}
          {topics.length > 0 && (
            <>
              <p className="source-meta">{stale ? 'Older cached result (refresh unavailable)' : cached ? 'Cached result' : 'Retrieved now'} · Source: MedlinePlus.gov. MedlinePlus does not endorse CareBridge.</p>
              <ul className="source-list">
                {topics.map((topic) => (
                  <li key={topic.url}>
                    <a href={topic.url} target="_blank" rel="noopener noreferrer">{topic.title} <ArrowRight size={14} aria-hidden="true" /></a>
                    {topic.summary && <p>{topic.summary}</p>}
                    <small>Source: MedlinePlus.gov{topic.categories?.length ? ` · ${topic.categories.join(', ')}` : ''}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <MedicalUpdates />
      <p className="disclaimer-box">{DISCLAIMER}</p>
    </div>
  );
}

function MedicalUpdates() {
  const [topic, setTopic] = useState('healthcare');
  const [news, setNews] = useState(null);
  const [newsError, setNewsError] = useState('');
  const [newsLoading, setNewsLoading] = useState(false);
  const [researchQuery, setResearchQuery] = useState('public health');
  const [research, setResearch] = useState(null);
  const [researchError, setResearchError] = useState('');
  const [researchLoading, setResearchLoading] = useState(false);

  const loadNews = useCallback(async (selectedTopic = 'healthcare') => {
    setNewsLoading(true);
    setNewsError('');
    try {
      const { data } = await api.get('/news/medical', { params: { topic: selectedTopic } });
      setNews(data);
    } catch (err) {
      setNewsError(errorMessage(err));
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const loadResearch = async (event) => {
    event.preventDefault();
    setResearchLoading(true);
    setResearchError('');
    try {
      const { data } = await api.get('/research', { params: { query: researchQuery.trim() } });
      setResearch(data);
    } catch (err) {
      setResearchError(errorMessage(err));
    } finally {
      setResearchLoading(false);
    }
  };

  useEffect(() => { loadNews('healthcare'); }, [loadNews]);

  return (
    <section aria-labelledby="updates-heading">
      <SectionHeader id="updates-heading" title="Healthcare news and research" description="Sourced reporting and publication records. Not clinical advice." />
      <div className="split-2 align-start">
        <section className="panel">
          <div className="panel-title-row">
            <h3>Aggregated healthcare news</h3>
            <label className="field inline-field">
              <span>Topic</span>
              <select value={topic} onChange={(event) => { setTopic(event.target.value); loadNews(event.target.value); }}>
                <option value="healthcare">Healthcare</option>
                <option value="hospitals">Hospitals and systems</option>
                <option value="research">Research and innovation</option>
                <option value="public_health">Public-health updates</option>
                <option value="india">India-related healthcare</option>
              </select>
            </label>
          </div>
          <p className="muted small">GDELT collects publisher reporting; articles are not medically verified by GDELT or CareBridge.</p>
          {newsLoading && <Loading label="Loading news…" />}
          {newsError && <Alert tone="error" onRetry={() => loadNews(topic)}>{newsError}</Alert>}
          {news && (
            <>
              <p className="source-meta">{news.stale ? 'Older cached items (refresh unavailable)' : news.cached ? 'Cached items' : 'Retrieved now'} · GDELT DOC 2.0 · {news.retrievedAt ? new Date(news.retrievedAt).toLocaleString() : 'Retrieval time unavailable'}</p>
              {news.articles.length ? (
                <ul className="source-list">
                  {news.articles.map((article) => (
                    <li key={article.url}>
                      <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title} <ArrowRight size={14} aria-hidden="true" /></a>
                      <small>{article.publisher}{article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleString()}` : ''}{article.language ? ` · ${article.language}` : ''}</small>
                    </li>
                  ))}
                </ul>
              ) : <Empty title="No recent stories found" text="Try another topic later. No headlines are generated when the source has none." />}
            </>
          )}
        </section>

        <section className="panel">
          <h3>Recent medical research</h3>
          <p className="muted small">PubMed records are research citations, not clinical recommendations.</p>
          <form className="search-inline" onSubmit={loadResearch}>
            <Field label="Research topic" value={researchQuery} onChange={setResearchQuery} placeholder="For example, diabetes" required />
            <button type="submit" className="btn btn-primary" disabled={researchLoading || researchQuery.trim().length < 2}>
              {researchLoading ? 'Searching…' : 'Search PubMed'} <Search size={15} aria-hidden="true" />
            </button>
          </form>
          {researchError && <Alert tone="error">{researchError}</Alert>}
          {research && (
            <>
              <p className="source-meta">{research.stale ? 'Older cached publications (refresh unavailable)' : research.cached ? 'Cached publications' : 'Retrieved now'} · PubMed / NCBI · {research.retrievedAt ? new Date(research.retrievedAt).toLocaleString() : 'Retrieval time unavailable'}</p>
              {research.publications.length ? (
                <ul className="source-list">
                  {research.publications.map((record) => (
                    <li key={record.pmid}>
                      <a href={record.url} target="_blank" rel="noopener noreferrer">{record.title} <ArrowRight size={14} aria-hidden="true" /></a>
                      <small>{record.authors.length ? record.authors.join(', ') : 'Authors not listed'}{record.journal ? ` · ${record.journal}` : ''}{record.publicationDate ? ` · ${record.publicationDate}` : ''} · PMID {record.pmid || 'not supplied'}</small>
                    </li>
                  ))}
                </ul>
              ) : <Empty title="No publications found" text="Try a broader research term. PubMed returned no records for this query." />}
            </>
          )}
        </section>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

function ProfileAvatar({ name }) {
  return <span className="avatar profile-avatar" aria-hidden="true">{initials(name)}</span>;
}
ProfileAvatar.propTypes = { name: PropTypes.string };

function ProfileCompleteness({ value, label = 'Profile completeness' }) {
  return (
    <div className="completeness">
      <div className="completeness-head"><span>{label}</span><strong>{value}%</strong></div>
      <div className="completeness-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <span className="completeness-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
ProfileCompleteness.propTypes = { value: PropTypes.number.isRequired, label: PropTypes.string };

function ProfileHero({ name, email, subtitle, badges, actions }) {
  return (
    <section className="panel profile-hero-panel" aria-label="Profile summary">
      <div className="profile-identity">
        <ProfileAvatar name={name} />
        <div className="profile-identity-text">
          <h2>{name}</h2>
          <p>{subtitle}</p>
          <p className="profile-identity-email">{email}</p>
        </div>
      </div>
      {badges?.length ? <div className="badge-row">{badges}</div> : null}
      {actions ? <div className="profile-hero-actions">{actions}</div> : null}
    </section>
  );
}
ProfileHero.propTypes = {
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  badges: PropTypes.arrayOf(PropTypes.node),
  actions: PropTypes.node,
};

function PatientProfile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const completed = [name.trim(), phone.trim(), user.email].filter(Boolean).length;
  const completeness = Math.round((completed / 3) * 100);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const { data } = await api.patch('/auth/profile', { name, phone });
      setUser(data.user);
      setMessage('Profile updated.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Manage your personal details and review how you sign in to CareBridge."
      />

      <ProfileHero
        name={user.name}
        email={user.email}
        subtitle={`${ROLE_LABEL[user.role]} account`}
        badges={[
          <StatusBadge key="status" status={user.status} label={user.status === 'active' ? 'Active account' : 'Inactive account'} />,
          <StatusBadge key="password" status="info" label="Password sign-in" />,
        ]}
        actions={<Link className="btn btn-outline" to="/patient/appointments"><CalendarDays size={16} aria-hidden="true" /> My appointments</Link>}
      />

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <div className="profile-layout">
        <section className="panel" aria-labelledby="account-details">
          <div className="section-head">
            <div>
              <h2 id="account-details">Account details</h2>
              <p>Keep your contact information current so care providers can reach you.</p>
            </div>
          </div>
          <form onSubmit={submit} className="stack">
            <div className="form-grid">
              <Field label="Full name" required value={name} onChange={setName} autoComplete="name" />
              <Field label="Email address" value={user.email} onChange={() => {}} disabled hint="Contact an administrator to change the email on your account." />
              <Field label="Phone number" value={phone} onChange={setPhone} autoComplete="tel" placeholder="Add a contact number" />
              <div className="field">
                <span>Account type</span>
                <p className="profile-readonly">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              <span className="muted small">Your email address is used to sign in.</span>
            </div>
          </form>
        </section>

        <aside className="profile-side">
          <section className="panel" aria-labelledby="account-summary">
            <h2 className="panel-title" id="account-summary">Account summary</h2>
            <dl className="fact-list">
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Phone</dt><dd>{user.phone || 'Not added'}</dd></div>
              <div><dt>Member since</dt><dd>{formatMonthYear(user.createdAt)}</dd></div>
              <div><dt>Status</dt><dd>{user.status === 'active' ? 'Active' : 'Inactive'}</dd></div>
            </dl>
            <ProfileCompleteness value={completeness} />
          </section>

          <section className="panel" aria-labelledby="sign-in-methods">
            <h2 className="panel-title" id="sign-in-methods">Sign-in methods</h2>
            <ul className="security-list">
              <li>
                <span className="list-icon"><KeyRound size={16} aria-hidden="true" /></span>
                <div className="list-main"><strong>Password</strong><small>Your password is stored as a secure one-way hash.</small></div>
                <StatusBadge status="approved" label="Enabled" />
              </li>
              <li>
                <span className="list-icon"><LockKeyhole size={16} aria-hidden="true" /></span>
                <div className="list-main"><strong>Session</strong><small>Sign-ins use an HttpOnly cookie that expires after seven days.</small></div>
                <StatusBadge status="approved" label="Protected" />
              </li>
              <li>
                <span className="list-icon"><ShieldCheck size={16} aria-hidden="true" /></span>
                <div className="list-main"><strong>Role-based access</strong><small>Your patient workspace is limited to your own records.</small></div>
                <StatusBadge status="approved" label="Active" />
              </li>
            </ul>
            <p className="profile-security-note"><LockKeyhole size={14} aria-hidden="true" /> CareBridge never displays your password or session token.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Doctor area                                                         */
/* ------------------------------------------------------------------ */

function DoctorArea() {
  return (
    <Routes>
      <Route index element={<DoctorDashboard />} />
      <Route path="appointments" element={<AppointmentsPage role="doctor" view="requests" />} />
      <Route path="history" element={<AppointmentsPage role="doctor" view="history" />} />
      <Route path="profile" element={<DoctorProfileEditor />} />
      <Route path="availability" element={<AvailabilityEditor />} />
    </Routes>
  );
}

function DoctorDashboard() {
  const [data, setData] = useState({ profile: null, appointments: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([api.get('/doctors/me/profile'), api.get('/appointments', { params: { limit: 50 } })]);
    const errors = [];
    const next = { profile: null, appointments: [] };
    if (results[0].status === 'fulfilled') next.profile = results[0].value.data.profile;
    else errors.push(errorMessage(results[0].reason));
    if (results[1].status === 'fulfilled') next.appointments = results[1].value.data.appointments;
    else errors.push(errorMessage(results[1].reason));
    setData(next);
    setError(errors.join(' '));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = data.appointments.filter((item) => item.status === 'Pending');
  const confirmed = data.appointments.filter((item) => item.status === 'Confirmed');
  const status = data.profile?.verificationStatus || 'pending';

  return (
    <div className="page">
      <PageHeader
        eyebrow="Doctor workspace"
        title="Dashboard"
        description="Your verification status, appointment requests and availability at a glance."
        actions={<Link className="btn btn-primary" to="/doctor/availability"><CalendarDays size={16} /> Manage availability</Link>}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {!loading && (
        status === 'approved'
          ? <div className="status-banner success"><ShieldCheck size={18} aria-hidden="true" /><span><strong>Your profile is approved.</strong> Patients can find you in the directory and request published slots.</span></div>
          : <div className="status-banner warning"><ShieldCheck size={18} aria-hidden="true" /><span><strong>Your profile is {status === 'rejected' ? 'not approved' : 'awaiting review'}.</strong> It is not visible in the public directory until an administrator approves it.</span></div>
      )}

      <div className="summary-grid">
        <Link className="metric" to="/doctor/appointments"><span className="metric-icon"><Clock3 size={18} /></span><span className="metric-label">Pending requests</span><strong className="metric-value">{loading ? '—' : pending.length}</strong></Link>
        <Link className="metric" to="/doctor/appointments"><span className="metric-icon"><CheckCircle2 size={18} /></span><span className="metric-label">Confirmed</span><strong className="metric-value">{loading ? '—' : confirmed.length}</strong></Link>
        <Link className="metric" to="/doctor/history"><span className="metric-icon"><Activity size={18} /></span><span className="metric-label">Completed</span><strong className="metric-value">{loading ? '—' : data.appointments.filter((item) => item.status === 'Completed').length}</strong></Link>
        <Link className="metric" to="/doctor/profile"><span className="metric-icon"><UserRound size={18} /></span><span className="metric-label">Profile status</span><strong className="metric-value metric-text">{loading ? '—' : STATUS_LABEL[status] || status}</strong></Link>
      </div>

      <section className="panel" aria-labelledby="doctor-requests">
        <SectionHeader id="doctor-requests" title="Recent appointment requests" description="Accept or reject requests from the requests page." action={<Link className="text-link" to="/doctor/appointments">Manage requests <ArrowRight size={14} /></Link>} />
        {loading ? <Loading /> : pending.length ? (
          <ul className="list">
            {pending.slice(0, 5).map((appointment) => (
              <li className="list-row" key={appointment._id}>
                <span className="date-block"><strong>{formatShortDate(appointment.appointmentDate)}</strong><span>{appointment.startTime}</span></span>
                <span className="list-main"><strong>{appointment.patient?.name || 'Patient'}</strong><small>{appointment.reason}</small></span>
                <StatusBadge status={appointment.status} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<CheckCircle2 size={20} />} title="No pending requests" text="New appointment requests will appear here." />
        )}
      </section>
    </div>
  );
}

function DoctorProfileEditor() {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/doctors/me/profile')
      .then(({ data }) => setForm(data.profile))
      .catch((err) => { setForm({}); setError(errorMessage(err)); });
  }, []);

  if (!form) return <div className="page"><Loading label="Loading your profile…" /></div>;

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const status = form.verificationStatus || 'pending';
  const trackedFields = ['specialization', 'qualification', 'experienceYears', 'consultationFee', 'district', 'hospital', 'biography'];
  const completedFields = trackedFields.filter((key) => String(form[key] ?? '').trim() !== '').length;
  const completeness = Math.round((completedFields / trackedFields.length) * 100);
  const visibilityCopy = status === 'approved'
    ? 'Your profile is approved and visible in the public doctor directory.'
    : status === 'rejected'
      ? 'Your profile was not approved. Update your details and ask an administrator for another review.'
      : 'Your profile is awaiting administrator review and is not visible in the directory yet.';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const { data } = await api.patch('/doctors/me/profile', {
        specialization: form.specialization,
        qualification: form.qualification,
        experienceYears: form.experienceYears,
        consultationFee: form.consultationFee,
        district: form.district,
        hospital: form.hospital,
        biography: form.biography,
      });
      setForm(data.profile);
      setMessage('Professional profile updated.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Doctor workspace"
        title="My profile"
        description="Professional information shown in the public directory after approval."
      />

      <ProfileHero
        name={user.name}
        email={user.email}
        subtitle={form.specialization ? `${form.specialization} · ${ROLE_LABEL[user.role]}` : `${ROLE_LABEL[user.role]} account`}
        badges={[<StatusBadge key="verification" status={status} label={STATUS_LABEL[status] || status} />]}
        actions={(
          <>
            <Link className="btn btn-outline" to="/doctor/availability"><CalendarDays size={16} aria-hidden="true" /> Availability</Link>
            {status === 'approved' && <Link className="btn btn-primary" to={`/doctors/${user.id}`}><Eye size={16} aria-hidden="true" /> View public profile</Link>}
          </>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <div className="profile-layout">
        <section className="panel" aria-labelledby="practice-details">
          <div className="section-head">
            <div>
              <h2 id="practice-details">Professional details</h2>
              <p>Patients use these details to decide whether to request an appointment.</p>
            </div>
          </div>
          <form onSubmit={submit} className="stack">
            <div className="form-section">
              <h3 className="panel-title">Practice information</h3>
              <div className="form-grid">
                <Field label="Specialization" required value={form.specialization || ''} onChange={set('specialization')} />
                <Field label="Qualification" required value={form.qualification || ''} onChange={set('qualification')} />
                <Field label="Experience (years)" type="number" min="0" value={form.experienceYears ?? ''} onChange={set('experienceYears')} />
                <Field label="Consultation fee (₹)" type="number" min="0" value={form.consultationFee ?? ''} onChange={set('consultationFee')} />
                <Field label="District" required value={form.district || ''} onChange={set('district')} />
                <Field label="Hospital affiliation" value={form.hospital || ''} onChange={set('hospital')} />
              </div>
            </div>
            <div className="form-section">
              <h3 className="panel-title">Biography</h3>
              <Field label="Professional biography" as="textarea" value={form.biography || ''} onChange={set('biography')} placeholder="Describe your practice and the care you provide" hint="A clear, factual summary helps patients understand your practice." />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              <span className="muted small">Approval is controlled by an administrator.</span>
            </div>
          </form>
        </section>

        <aside className="profile-side">
          <section className="panel" aria-labelledby="directory-visibility">
            <h2 className="panel-title" id="directory-visibility">Directory visibility</h2>
            <div className={`status-banner ${status === 'approved' ? 'success' : 'warning'}`}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>{visibilityCopy}</span>
            </div>
            <p className="profile-security-note">Editing your details keeps your current verification status.</p>
          </section>

          <section className="panel" aria-labelledby="doctor-account-summary">
            <h2 className="panel-title" id="doctor-account-summary">Account summary</h2>
            <dl className="fact-list">
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Member since</dt><dd>{formatMonthYear(user.createdAt)}</dd></div>
              <div><dt>Verification</dt><dd>{STATUS_LABEL[status] || status}</dd></div>
              <div><dt>Public listing</dt><dd>{status === 'approved' ? 'Visible to patients' : 'Hidden until approved'}</dd></div>
            </dl>
            <ProfileCompleteness value={completeness} label="Profile completeness" />
          </section>
        </aside>
      </div>
    </div>
  );
}

function AvailabilityEditor() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ date: '', startTime: '', endTime: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/doctors/me/availability')
      .then(({ data }) => setItems((data.availability || []).map(({ date, startTime, endTime, available }) => ({ date, startTime, endTime, available }))))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const add = (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.date || !form.startTime || !form.endTime) return setError('Choose a date, start time and end time.');
    if (form.date < todayISO()) return setError('Choose a date in the future.');
    if (form.endTime <= form.startTime) return setError('The end time must be after the start time.');
    if (items.some((item) => item.date === form.date && item.startTime === form.startTime)) return setError('That date and start time already exists.');
    setItems([...items, { ...form, available: true }].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)));
    setForm({ date: '', startTime: '', endTime: '' });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put('/doctors/me/availability', { availability: items.map(({ date, startTime, endTime }) => ({ date, startTime, endTime })) });
      setItems(data.availability.map((slot) => ({ ...slot })));
      setMessage('Availability saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Availability" description="Publish the slots patients may request. Only future slots are shown to patients." />
      <div className="split-2 align-start">
        <section className="panel">
          <h2 className="panel-title">Add a slot</h2>
          {error && <Alert tone="error">{error}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}
          <form onSubmit={add} className="form-grid">
            <Field label="Date" type="date" required value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
            <Field label="Start time" type="time" required value={form.startTime} onChange={(value) => setForm({ ...form, startTime: value })} />
            <Field label="End time" type="time" required value={form.endTime} onChange={(value) => setForm({ ...form, endTime: value })} />
            <div className="form-actions span-all">
              <button type="submit" className="btn btn-outline">Add slot</button>
            </div>
          </form>
          <p className="muted small">Patients can request one slot at a time. A slot already requested by a patient is marked as requested.</p>
        </section>

        <section className="panel">
          <SectionHeader title="Published slots" description="Save after adding or removing slots." action={<button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save availability'}</button>} />
          {loading ? <Loading /> : items.length ? (
            <ul className="list">
              {items.map((slot, index) => (
                <li className="list-row" key={`${slot.date}-${slot.startTime}`}>
                  <span className="date-block"><strong>{formatShortDate(slot.date)}</strong><span>{slot.startTime}–{slot.endTime}</span></span>
                  <span className="list-main"><strong>{formatDate(slot.date)}</strong><small>{slot.available === false ? 'Requested by a patient' : 'Open for requests'}</small></span>
                  <button type="button" className="btn btn-ghost btn-sm btn-danger-text" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<CalendarDays size={20} />} title="No slots published" text="Add at least one future slot so patients can request an appointment." />
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Administrator area                                                  */
/* ------------------------------------------------------------------ */

function AdminArea() {
  return (
    <Routes>
      <Route index element={<AdminDashboard />} />
      <Route path="users" element={<UserManagement />} />
      <Route path="doctors" element={<DoctorReview />} />
      <Route path="appointments" element={<AppointmentsPage role="admin" />} />
      <Route path="hospitals" element={<HospitalManagement />} />
      <Route path="statistics" element={<PlatformStatistics />} />
    </Routes>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const metrics = [
    { label: 'Registered patients', key: 'patients', icon: UserRound, to: '/admin/users' },
    { label: 'Registered doctors', key: 'doctors', icon: Stethoscope, to: '/admin/doctors' },
    { label: 'Pending doctor reviews', key: 'pendingDoctors', icon: ShieldCheck, to: '/admin/doctors' },
    { label: 'Appointments', key: 'appointments', icon: CalendarDays, to: '/admin/appointments' },
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Dashboard" description="Platform records that come directly from MongoDB." actions={<Link className="btn btn-outline" to="/admin/statistics">Platform statistics</Link>} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="summary-grid">
        {metrics.map(({ label, key, icon: Icon, to }) => (
          <Link className="metric" to={to} key={key}>
            <span className="metric-icon"><Icon size={18} aria-hidden="true" /></span>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{loading ? '—' : stats?.[key] ?? '—'}</strong>
          </Link>
        ))}
      </div>
      <div className="split-2">
        <section className="panel">
          <h2 className="panel-title">Review queue</h2>
          <p>Doctor profiles stay out of the public directory until they are approved.</p>
          <p className="metric-value">{loading ? '—' : stats?.pendingDoctors ?? '—'}</p>
          <Link className="btn btn-primary" to="/admin/doctors">Review doctor profiles</Link>
        </section>
        <section className="panel">
          <h2 className="panel-title">Appointment activity</h2>
          <dl className="fact-grid tight">
            <div><dt>Pending</dt><dd>{stats?.pendingAppointments ?? '—'}</dd></div>
            <div><dt>Confirmed</dt><dd>{stats?.confirmedAppointments ?? '—'}</dd></div>
            <div><dt>Cancelled</dt><dd>{stats?.cancelledAppointments ?? '—'}</dd></div>
            <div><dt>Hospital records</dt><dd>{stats?.hospitals ?? '—'}</dd></div>
          </dl>
          <Link className="text-link" to="/admin/appointments">Open appointment management <ArrowRight size={14} /></Link>
        </section>
      </div>
    </div>
  );
}

function PlatformStatistics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const groups = [
    { title: 'Accounts', rows: [['Registered patients', 'patients'], ['Registered doctors', 'doctors']] },
    { title: 'Doctor verification', rows: [['Approved doctors', 'approvedDoctors'], ['Pending reviews', 'pendingDoctors']] },
    { title: 'Appointments', rows: [['All appointments', 'appointments'], ['Pending', 'pendingAppointments'], ['Confirmed', 'confirmedAppointments'], ['Cancelled', 'cancelledAppointments']] },
    { title: 'Directory', rows: [['Hospital records', 'hospitals']] },
  ];

  return (
    <div className="page page-narrow">
      <PageHeader title="Platform statistics" description="Counts calculated by the server from stored MongoDB records." />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Loading /> : (
        <div className="stat-groups">
          {groups.map((group) => (
            <section className="panel" key={group.title}>
              <h2 className="panel-title">{group.title}</h2>
              <dl className="fact-grid tight">
                {group.rows.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{stats?.[key] ?? 0}</dd></div>)}
              </dl>
            </section>
          ))}
        </div>
      )}
      <p className="muted small">Statistics reflect database state at page load. They do not include external directory or news services.</p>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (values = { q: '', role: '', status: '' }, page = 1) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/users', { params: { ...cleanParams(values), page, limit: 20 } });
      setUsers(data.users);
      setPagination(data.pagination || { page: 1, pages: 1, total: data.users.length, limit: 20 });
    } catch (err) {
      setError(errorMessage(err));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (user) => {
    const next = user.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${next === 'inactive' ? 'Deactivate' : 'Reactivate'} ${user.name}?`)) return;
    setError('');
    try {
      await api.patch(`/admin/users/${user._id}/status`, { status: next });
      await load(filters, pagination.page);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const clear = () => { const empty = { q: '', role: '', status: '' }; setFilters(empty); load(empty); };

  return (
    <div className="page">
      <PageHeader title="User management" description="Patient, doctor and administrator accounts." />
      <SearchForm onSubmit={(event) => { event.preventDefault(); load(filters); }} onClear={clear} busy={loading} id="user search">
        <Field label="Name or email" value={filters.q} onChange={(value) => setFilters({ ...filters, q: value })} placeholder="Search accounts" />
        <div className="field">
          <label htmlFor="user-role">Role</label>
          <select id="user-role" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
            <option value="">All roles</option>
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="user-status">Status</label>
          <select id="user-status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </SearchForm>

      {loading ? <Loading label="Loading users…" /> : error ? <Alert tone="error" onRetry={() => load(filters, pagination.page)}>{error}</Alert> : users.length ? (
        <>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Joined</th><th scope="col" className="col-actions">Actions</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td data-label="User"><strong>{user.name}</strong><small className="cell-sub">{user.email}</small></td>
                  <td data-label="Role"><span className="chip chip-capitalize">{user.role}</span></td>
                  <td data-label="Status"><StatusBadge status={user.status} /></td>
                  <td data-label="Joined">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td>
                  <td data-label="Actions" className="col-actions">
                    {user.role === 'admin'
                      ? <span className="muted small">Protected</span>
                      : <button type="button" className={`btn btn-sm ${user.status === 'active' ? 'btn-outline btn-danger-text' : 'btn-outline'}`} onClick={() => setStatus(user)}>{user.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <nav className="pagination" aria-label="User pages">
            <button type="button" className="btn btn-outline btn-sm" disabled={pagination.page <= 1} onClick={() => load(filters, pagination.page - 1)}>Previous</button>
            <span>Page {pagination.page} of {pagination.pages} · {pagination.total} accounts</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={pagination.page >= pagination.pages} onClick={() => load(filters, pagination.page + 1)}>Next</button>
          </nav>
        )}
        </>
      ) : <Empty icon={<UserRound size={20} />} title="No users found" text="No accounts match these filters." action={<button type="button" className="btn btn-outline" onClick={clear}>Clear filters</button>} />}
    </div>
  );
}

function DoctorReview() {
  const [doctors, setDoctors] = useState([]);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/doctors', { params: { status } });
      setDoctors(data.doctors);
    } catch (err) {
      setError(errorMessage(err));
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const decide = async (doctor, next) => {
    setBusyId(doctor._id);
    setError('');
    try {
      await api.patch(`/admin/doctors/${doctorIdentifier(doctor)}/verification`, { status: next });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Doctor verification" description="Only approved profiles appear in the public doctor directory." />

      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Verification status">
          {['pending', 'approved', 'rejected'].map((option) => (
            <button key={option} type="button" aria-pressed={status === option} className={`tab${status === option ? ' active' : ''}`} onClick={() => setStatus(option)}>
              {STATUS_LABEL[option]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Loading label="Loading profiles…" /> : doctors.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Doctor</th><th scope="col">Specialization</th><th scope="col">Experience</th><th scope="col">District</th><th scope="col">Status</th><th scope="col" className="col-actions">Actions</th></tr></thead>
            <tbody>
              {doctors.map((doctor) => (
                <tr key={doctor._id}>
                  <td data-label="Doctor"><strong>{doctor.user?.name || doctor.name || 'Doctor'}</strong><small className="cell-sub">{doctor.user?.email || 'Email not available'}</small></td>
                  <td data-label="Specialization">{doctor.specialization || '—'}<small className="cell-sub">{doctor.qualification || ''}</small></td>
                  <td data-label="Experience">{doctor.experienceYears != null ? `${doctor.experienceYears} yrs` : '—'}</td>
                  <td data-label="District">{doctor.district || '—'}</td>
                  <td data-label="Status"><StatusBadge status={doctor.verificationStatus} /></td>
                  <td data-label="Actions" className="col-actions">
                    <div className="table-actions">
                      {doctor.verificationStatus !== 'approved' && <button type="button" className="btn btn-primary btn-sm" disabled={busyId === doctor._id} onClick={() => decide(doctor, 'approved')}>Approve</button>}
                      {doctor.verificationStatus !== 'rejected' && <button type="button" className="btn btn-outline btn-sm btn-danger-text" disabled={busyId === doctor._id} onClick={() => decide(doctor, 'rejected')}>Reject</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={<ShieldCheck size={20} />} title={`No ${STATUS_LABEL[status].toLowerCase()} profiles`} text="Profiles appear here when their verification status matches this tab." />}
    </div>
  );
}

function HospitalManagement() {
  const [hospitals, setHospitals] = useState([]);
  const [form, setForm] = useState({ name: '', address: '', district: '', contact: '', services: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/hospitals');
      setHospitals(data.hospitals);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post('/admin/hospitals', {
        ...form,
        source: 'CareBridge administrator',
        services: form.services.split(',').map((service) => service.trim()).filter(Boolean),
        published: false,
      });
      setForm({ name: '', address: '', district: '', contact: '', services: '' });
      setMessage('Centre saved as unpublished. Publish it when the record is ready.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (hospital) => {
    setError('');
    try {
      await api.patch(`/admin/hospitals/${hospital._id}`, { published: !hospital.published });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (hospital) => {
    if (!window.confirm(`Remove ${hospital.name} from the directory?`)) return;
    setError('');
    try {
      await api.delete(`/admin/hospitals/${hospital._id}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <PageHeader title="Hospital management" description="Directory records. Only published records appear in the public hospital directory." />
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <section className="panel">
        <h2 className="panel-title">Add a centre</h2>
        <form onSubmit={submit} className="form-grid">
          <Field label="Centre name" required value={form.name} onChange={set('name')} />
          <Field label="Address" required value={form.address} onChange={set('address')} />
          <Field label="District" required value={form.district} onChange={set('district')} />
          <Field label="Contact (optional)" value={form.contact} onChange={set('contact')} />
          <div className="span-all">
            <Field label="Services, comma-separated" value={form.services} onChange={set('services')} placeholder="Emergency, Outpatient" hint="Only enter information from identifiable sources." />
          </div>
          <div className="form-actions span-all">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add centre'}</button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="managed-centres">
        <SectionHeader id="managed-centres" title="Directory records" action={<button type="button" className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={15} /> Refresh</button>} />
        {loading ? <Loading /> : hospitals.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th scope="col">Centre</th><th scope="col">District</th><th scope="col">Services</th><th scope="col">Status</th><th scope="col" className="col-actions">Actions</th></tr></thead>
              <tbody>
                {hospitals.map((hospital) => (
                  <tr key={hospital._id}>
                    <td data-label="Centre"><strong>{hospital.name}</strong><small className="cell-sub">{hospital.address}</small></td>
                    <td data-label="District">{hospital.district}</td>
                    <td data-label="Services">{(hospital.services || []).join(', ') || '—'}</td>
                    <td data-label="Status"><StatusBadge status={hospital.published ? 'published' : 'unpublished'} /></td>
                    <td data-label="Actions" className="col-actions">
                      <div className="table-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => togglePublish(hospital)}>{hospital.published ? 'Unpublish' : 'Publish'}</button>
                        <button type="button" className="btn btn-outline btn-sm btn-danger-text" onClick={() => remove(hospital)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={<Hospital size={20} />} title="No centre records" text="Add a centre above. Records are unpublished until you publish them." />}
      </section>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
