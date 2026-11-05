import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Info, X } from 'lucide-react';
import { KPI_META } from './kpiMeta';
import { formatChange, formatDateTime, formatNumber, titleCase } from './format';

export function KpiCard({ metricKey, metric, icon: Icon, selected, onSelect }) {
  const meta = KPI_META[metricKey];
  const change = formatChange(metric.changePercent);
  const direction = metric.changePercent > 0 ? 'up' : metric.changePercent < 0 ? 'down' : 'flat';
  return (
    <button
      type="button"
      className={`kpi-card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-describedby={`kpi-note-${metricKey}`}
      title={meta.description}
    >
      <span className="kpi-card-head">
        <span className="kpi-icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="kpi-label">{meta.label}</span>
      </span>
      <strong className="kpi-value">{formatNumber(metric.value)}</strong>
      <span className="kpi-foot">
        {change ? (
          <span className={`kpi-change is-${direction}`}>
            {direction === 'down' ? <ArrowDownRight size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}
            {change}
          </span>
        ) : (
          <span className="kpi-change is-none">No baseline</span>
        )}
        <span className="kpi-basis">
          {metric.previous === null
            ? 'history not stored'
            : `vs ${formatNumber(metric.previous)} at period start`}
        </span>
      </span>
      <span className="sr-only" id={`kpi-note-${metricKey}`}>{meta.description}</span>
    </button>
  );
}
KpiCard.propTypes = {
  metricKey: PropTypes.string.isRequired,
  metric: PropTypes.shape({
    value: PropTypes.number.isRequired,
    previous: PropTypes.number,
    changePercent: PropTypes.number,
  }).isRequired,
  icon: PropTypes.elementType.isRequired,
  selected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
};

export function KpiDetail({ metricKey, data, onClose }) {
  const meta = KPI_META[metricKey];
  const metric = data.kpis[metricKey];
  if (!meta || !metric) return null;
  const breakdown = Array.isArray(data.distributions[meta.breakdown]) ? data.distributions[meta.breakdown] : [];
  const change = formatChange(metric.changePercent);

  return (
    <section className="analytics-detail" aria-label={`Details for ${meta.label}`} aria-live="polite">
      <div className="analytics-detail-head">
        <div>
          <p className="eyebrow">Drill-down</p>
          <h3>{meta.label}</h3>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close detail">
          <X size={15} aria-hidden="true" /> Close
        </button>
      </div>
      <dl className="analytics-detail-facts">
        <div><dt>Current value</dt><dd>{formatNumber(metric.value)}</dd></div>
        <div><dt>Previous period</dt><dd>{metric.previous === null ? 'Not stored' : formatNumber(metric.previous)}</dd></div>
        <div><dt>Change</dt><dd>{change || 'Not available'}</dd></div>
        <div><dt>Range</dt><dd>{data.range.fromDay} – {data.range.toDay}</dd></div>
      </dl>
      <p className="analytics-detail-note"><Info size={14} aria-hidden="true" /> {meta.description}</p>
      {breakdown.length > 0 && (
        <div className="analytics-detail-breakdown">
          <h4>Related breakdown</h4>
          <ul>
            {breakdown.map((entry) => (
              <li key={entry.key}>
                <span>{titleCase(entry.key)}</span>
                <strong>{formatNumber(entry.value)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="analytics-detail-actions">
        <Link className="btn btn-outline btn-sm" to={meta.link}>Open records</Link>
        <span className="analytics-footnote">Snapshot generated {formatDateTime(data.generatedAt)}</span>
      </div>
    </section>
  );
}
KpiDetail.propTypes = {
  metricKey: PropTypes.string.isRequired,
  data: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
};
