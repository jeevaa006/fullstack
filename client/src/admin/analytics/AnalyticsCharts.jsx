import PropTypes from 'prop-types';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { TONE_INDEX, useChartTheme } from './chartTheme';
import { formatBucket, formatNumber } from './format';

function ChartTooltip({ active, payload, label }) {
  const theme = useChartTheme();
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip" style={{ borderColor: theme.border, background: theme.surface, color: theme.text }}>
      {label !== undefined && <p className="chart-tooltip-title">{formatBucket(label)}</p>}
      <ul>
        {payload.map((item) => (
          <li key={`${item.name}-${item.dataKey}`}>
            <span className="chart-swatch" style={{ background: item.color || item.payload?.fill || theme.series[0] }} aria-hidden="true" />
            <span>{item.name}</span>
            <strong>{formatNumber(item.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
ChartTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.arrayOf(PropTypes.object),
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

function ChartLegend({ items }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className="chart-swatch" style={{ background: item.color }} aria-hidden="true" />
          <span>{item.label}</span>
          {item.value !== undefined && <strong>{formatNumber(item.value)}</strong>}
        </li>
      ))}
    </ul>
  );
}
ChartLegend.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string.isRequired, color: PropTypes.string.isRequired, value: PropTypes.number })).isRequired,
};

export function ChartCard({ id, title, description, children, empty, emptyText, footnote, wide = false }) {
  return (
    <section className={`analytics-chart panel${wide ? ' is-wide' : ''}`} aria-labelledby={id}>
      <div className="analytics-chart-head">
        <h3 id={id}>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {empty ? (
        <p className="analytics-empty">{emptyText}</p>
      ) : children}
      {footnote && !empty && <p className="analytics-footnote">{footnote}</p>}
    </section>
  );
}
ChartCard.propTypes = {
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node,
  empty: PropTypes.bool,
  emptyText: PropTypes.string,
  footnote: PropTypes.string,
  wide: PropTypes.bool,
};

export function CategoryBars({ data, tone = 'primary', horizontal = false, height = 240, ariaLabel }) {
  const theme = useChartTheme();
  const color = theme.series[TONE_INDEX[tone] ?? 0];
  const rows = data.map((row) => ({ ...row, label: row.label || row.key }));
  return (
    <div className="chart-canvas" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 8, bottom: horizontal ? 4 : 16, left: horizontal ? 8 : 0 }} accessibilityLayer>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 4" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} stroke={theme.axis} tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={{ stroke: theme.grid }} />
              <YAxis type="category" dataKey="label" width={112} stroke={theme.axis} tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={{ stroke: theme.grid }} interval={0} angle={data.length > 6 ? -28 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 62 : 30} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={false} width={34} />
            </>
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
          <Bar dataKey="value" name="Records" fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={46} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
CategoryBars.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.string, value: PropTypes.number.isRequired })).isRequired,
  tone: PropTypes.oneOf(Object.keys(TONE_INDEX)),
  horizontal: PropTypes.bool,
  height: PropTypes.number,
  ariaLabel: PropTypes.string,
};

export function TrendLines({ data, series, height = 260, ariaLabel }) {
  const theme = useChartTheme();
  return (
    <div className="chart-canvas" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }} accessibilityLayer>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={{ stroke: theme.grid }} minTickGap={22} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={false} width={34} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: theme.border }} />
          {series.map((item) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.name}
              stroke={theme.series[item.tone]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend items={series.map((item) => ({ label: item.name, color: theme.series[item.tone] }))} />
    </div>
  );
}
TrendLines.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  series: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string.isRequired, name: PropTypes.string.isRequired, tone: PropTypes.number.isRequired })).isRequired,
  height: PropTypes.number,
  ariaLabel: PropTypes.string,
};

export function StackedTrendBars({ data, series, height = 260, ariaLabel }) {
  const theme = useChartTheme();
  return (
    <div className="chart-canvas" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }} accessibilityLayer>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={{ stroke: theme.grid }} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={false} width={34} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} name={item.name} stackId="stack" fill={theme.series[item.tone]} maxBarSize={40} radius={item.top ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend items={series.map((item) => ({ label: item.name, color: theme.series[item.tone] }))} />
    </div>
  );
}
StackedTrendBars.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  series: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string.isRequired, name: PropTypes.string.isRequired, tone: PropTypes.number.isRequired, top: PropTypes.bool })).isRequired,
  height: PropTypes.number,
  ariaLabel: PropTypes.string,
};

export function PieBreakdown({ data, donut = false, height = 250, centerLabel, total, ariaLabel }) {
  const theme = useChartTheme();
  const rows = data.map((row) => ({ ...row, label: row.label || row.key }));
  return (
    <div className="chart-canvas chart-canvas-pie" role="img" aria-label={ariaLabel}>
      <div className="chart-pie-wrap">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart accessibilityLayer>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius={donut ? '58%' : 0}
              outerRadius="86%"
              paddingAngle={donut ? 2 : 0}
              stroke={theme.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {rows.map((row, index) => (
                <Cell key={row.key} fill={theme.series[index % theme.series.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {donut && (
          <div className="chart-pie-center" aria-hidden="true">
            <strong>{formatNumber(total)}</strong>
            {centerLabel && <span>{centerLabel}</span>}
          </div>
        )}
      </div>
      <ChartLegend items={rows.map((row, index) => ({ label: row.label, color: theme.series[index % theme.series.length], value: row.value }))} />
    </div>
  );
}
PieBreakdown.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.string, value: PropTypes.number.isRequired })).isRequired,
  donut: PropTypes.bool,
  height: PropTypes.number,
  centerLabel: PropTypes.string,
  total: PropTypes.number,
  ariaLabel: PropTypes.string,
};
