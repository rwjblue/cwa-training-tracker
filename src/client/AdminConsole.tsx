import { useEffect, useId, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  ExternalLink,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { type AdminStats, usageToolLabels } from '../shared/admin-stats';
import { api, ApiError, type User } from './api';
import './admin-console.css';

type View = 'overview' | 'usage' | 'operations';
type Period = AdminStats['practice']['days'];
type LoadState =
  | { status: 'loading'; owner: string; days: Period }
  | { status: 'ready'; owner: string; days: Period; stats: AdminStats }
  | { status: 'error'; owner: string; days: Period; message: string; code?: number };

const countFormat = new Intl.NumberFormat();
const decimalFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const timestampFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});
const views = {
  overview: {
    label: 'Overview',
    title: 'Service overview',
    subtitle: 'Account reach, practice volume, and a view of the whole service.',
    icon: LayoutDashboard,
  },
  usage: {
    label: 'Practice usage',
    title: 'Practice usage',
    subtitle: 'See which tools get used and how guest and account activity compare.',
    icon: BarChart3,
  },
  operations: {
    label: 'Operations',
    title: 'Operations',
    subtitle: 'Storage, database reachability, and scheduled maintenance.',
    icon: Activity,
  },
};

function formatDay(day: string) {
  return dayFormat.format(new Date(`${day}T12:00:00Z`));
}

function formatTimestamp(timestamp: string) {
  return `${timestampFormat.format(new Date(timestamp))} UTC`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${decimalFormat.format(bytes / 1024 ** exponent)} ${units[exponent]}`;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="admin-metric">
      <dt>{label}</dt>
      <dd className={/^[A-Za-z]/.test(value) ? 'admin-metric-word' : undefined}>{value}</dd>
      <dd className="admin-metric-note">{note}</dd>
    </div>
  );
}

function collectedDays(stats: AdminStats) {
  return stats.practice.series.filter((row) => row.guest !== null && row.account !== null).length;
}

function PracticeChart({ stats, title }: { stats: AdminStats; title: string }) {
  const heading = useId();
  const chartTitle = useId();
  const chartDescription = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const rows = stats.practice.series;
  const knownDays = collectedDays(stats);
  const hasCollectedDays = knownDays > 0;
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const showLatestDays = () => {
      viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    };
    showLatestDays();
    const observer = new ResizeObserver(showLatestDays);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [hasCollectedDays, rows.length]);
  const peak = Math.max(0, ...rows.map((row) => (row.guest ?? 0) + (row.account ?? 0)));
  const maximum = Math.max(4, Math.ceil(peak / 4) * 4);
  const width = 760,
    height = 260,
    left = 48,
    right = 16,
    top = 20,
    bottom = 40;
  const innerWidth = width - left - right,
    innerHeight = height - top - bottom;
  const cellWidth = innerWidth / Math.max(1, rows.length);
  const barWidth = Math.min(42, cellWidth * 0.72);
  const tickIndices = new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]);
  const period = rows.length
    ? `${formatDay(rows[0].day)} – ${formatDay(rows[rows.length - 1].day)}`
    : '';
  return (
    <section className="admin-panel admin-chart-panel" aria-labelledby={heading}>
      <div className="admin-panel-heading">
        <div>
          <h2 id={heading}>{title}</h2>
          <p>{period ? `${period} · Daily totals in UTC` : 'Daily totals in UTC'}</p>
        </div>
        <span className="admin-tag">Approximate counts</span>
      </div>
      <div className="admin-legend" aria-label="Chart legend">
        <span>
          <i className="admin-swatch admin-guest" aria-hidden="true" />
          Guest
        </span>
        <span>
          <i className="admin-swatch admin-account" aria-hidden="true" />
          Account
        </span>
        {knownDays < rows.length && (
          <span>
            <i className="admin-swatch admin-uncollected" aria-hidden="true" />
            Not collected
          </span>
        )}
      </div>
      {!knownDays ? (
        <div className="admin-chart-empty">
          <BarChart3 size={32} aria-hidden="true" />
          <h3>No practice data collected yet</h3>
          <p>Daily totals will appear when new practice reports arrive.</p>
        </div>
      ) : (
        <>
          <div
            ref={viewportRef}
            className="admin-chart-viewport"
            role="region"
            aria-label="Daily practice chart"
            tabIndex={0}
          >
            <svg
              className="admin-chart"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-labelledby={`${chartTitle} ${chartDescription}`}
            >
              <title id={chartTitle}>{title}: guest and account practice reports by day</title>
              <desc id={chartDescription}>
                {countFormat.format(stats.practice.totals.guest)} guest reports and{' '}
                {countFormat.format(stats.practice.totals.account)} account reports. Daily values
                are available in the table below. Days before collection began have no data.
              </desc>
              {Array.from({ length: 5 }, (_, index) => {
                const y = top + innerHeight - (index / 4) * innerHeight;
                return (
                  <g key={index}>
                    <line x1={left} x2={width - right} y1={y} y2={y} className="admin-chart-grid" />
                    <text x={left - 10} y={y + 4} textAnchor="end" className="admin-chart-label">
                      {countFormat.format((maximum * index) / 4)}
                    </text>
                  </g>
                );
              })}
              {rows.map((row, index) => {
                const x = left + index * cellWidth + (cellWidth - barWidth) / 2;
                const known = row.guest !== null && row.account !== null;
                const accountHeight = ((row.account ?? 0) / maximum) * innerHeight;
                const guestHeight = ((row.guest ?? 0) / maximum) * innerHeight;
                return (
                  <g key={row.day}>
                    <title>
                      {row.day}:{' '}
                      {known ? `${row.guest} guest, ${row.account} account` : 'Not collected'}
                    </title>
                    {known ? (
                      <>
                        <rect
                          x={x}
                          y={top + innerHeight - accountHeight}
                          width={barWidth}
                          height={accountHeight}
                          className="admin-chart-account"
                        />
                        <rect
                          x={x}
                          y={top + innerHeight - accountHeight - guestHeight}
                          width={barWidth}
                          height={guestHeight}
                          className="admin-chart-guest"
                        />
                      </>
                    ) : (
                      <rect
                        x={x}
                        y={top + innerHeight - 5}
                        width={barWidth}
                        height={5}
                        className="admin-chart-uncollected"
                      />
                    )}
                    {tickIndices.has(index) && (
                      <text
                        x={x + barWidth / 2}
                        y={height - 12}
                        textAnchor="middle"
                        className="admin-chart-label"
                      >
                        {formatDay(row.day)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          {stats.practice.totals.total === 0 && (
            <p className="admin-chart-note">
              No practice sessions reported in the collected days of this period.
            </p>
          )}
        </>
      )}
      <p className="admin-chart-note">
        Each bar represents one UTC day. Counts reflect reports received, including today’s partial
        day.
      </p>
      {rows.length > 0 && (
        <details className="admin-daily-details">
          <summary>View daily values</summary>
          <div
            className="admin-table-scroll admin-daily-table"
            role="region"
            aria-label="Daily practice values"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Daily practice reports in UTC. Not collected means no measurement is available.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Day (UTC)</th>
                  <th scope="col">Guest</th>
                  <th scope="col">Account</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.day}>
                    <th scope="row">{row.day}</th>
                    {row.guest === null || row.account === null ? (
                      <td colSpan={3}>Not collected</td>
                    ) : (
                      <>
                        <td>{countFormat.format(row.guest)}</td>
                        <td>{countFormat.format(row.account)}</td>
                        <td>{countFormat.format(row.guest + row.account)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function ToolSummary({ stats }: { stats: AdminStats }) {
  const heading = useId();
  const tools = [...stats.practice.tools].sort((a, b) => b.guest + b.account - a.guest - a.account);
  const maximum = Math.max(1, ...tools.map((tool) => tool.guest + tool.account));
  return (
    <section className="admin-panel" aria-labelledby={heading}>
      <div className="admin-panel-heading">
        <div>
          <h2 id={heading}>What people practice</h2>
          <p>Reports by tool in the selected period</p>
        </div>
      </div>
      {!collectedDays(stats) ? (
        <p className="admin-no-data">No tool usage collected yet.</p>
      ) : (
        <div className="admin-tool-list">
          {tools.map((tool) => (
            <div className="admin-tool" key={tool.tool}>
              <div className="admin-tool-heading">
                <span>{usageToolLabels[tool.tool]}</span>
                <strong>{countFormat.format(tool.guest + tool.account)}</strong>
              </div>
              <div className="admin-tool-track" aria-hidden="true">
                <span
                  className="admin-guest"
                  style={{ width: `${(tool.guest / maximum) * 100}%` }}
                />
                <span
                  className="admin-account"
                  style={{ width: `${(tool.account / maximum) * 100}%` }}
                />
              </div>
              <p>
                {countFormat.format(tool.guest)} guest · {countFormat.format(tool.account)} account
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Overview({ stats, onUsage }: { stats: AdminStats; onUsage: () => void }) {
  return (
    <>
      <dl className="admin-metrics">
        <Metric
          label="Total accounts"
          value={countFormat.format(stats.accounts.total)}
          note="Registered accounts today"
        />
        <Metric
          label="New accounts · 30 days"
          value={countFormat.format(stats.accounts.created30)}
          note="From account creation dates"
        />
        <Metric
          label="Active accounts · 7 days"
          value={countFormat.format(stats.accounts.active7)}
          note="Recent private workspace use"
        />
        <Metric
          label={`Practice reports · ${stats.practice.days} days`}
          value={
            collectedDays(stats) ? countFormat.format(stats.practice.totals.total) : 'Not collected'
          }
          note="Guest and account activity · Approximate"
        />
      </dl>
      <div className="admin-overview-grid">
        <PracticeChart stats={stats} title="Practice, day by day" />
        <ToolSummary stats={stats} />
      </div>
      <div className="admin-info-grid">
        <section className="admin-soft-panel">
          <h2>Account reach</h2>
          <dl className="admin-facts">
            <div>
              <dt>New accounts · 7 days</dt>
              <dd>{countFormat.format(stats.accounts.created7)}</dd>
            </div>
            <div>
              <dt>Active accounts · today</dt>
              <dd>{countFormat.format(stats.accounts.activeToday)}</dd>
            </div>
            <div>
              <dt>Active accounts · 30 days</dt>
              <dd>{countFormat.format(stats.accounts.active30)}</dd>
            </div>
          </dl>
          <p>
            Recent activity measures private workspace use, independently of practice volume. Guests
            are not counted as unique people.
          </p>
        </section>
        <section className="admin-soft-panel">
          <h2>180 days of aggregate history</h2>
          <p>
            Practice totals contain only the reporting day, tool, guest/account category, and count.
            They are not linked to accounts or guests.
          </p>
          <p>The account’s most recent activity day is stored separately.</p>
          <button className="admin-text-button" onClick={onUsage}>
            Explore practice usage <span aria-hidden="true">→</span>
          </button>
        </section>
      </div>
    </>
  );
}

function Usage({ stats }: { stats: AdminStats }) {
  const knownDays = collectedDays(stats);
  const totals = stats.practice.totals;
  const share = (count: number) =>
    totals.total
      ? `${decimalFormat.format((count / totals.total) * 100)}% of reported practice`
      : 'No practice sessions reported';
  const value = (count: number) => (knownDays ? countFormat.format(count) : 'Not collected');
  return (
    <>
      <dl className="admin-metrics">
        <Metric
          label="Practice reports"
          value={value(totals.total)}
          note={`In the selected ${stats.practice.days} days`}
        />
        <Metric
          label="Guest reports"
          value={value(totals.guest)}
          note={knownDays ? share(totals.guest) : 'Guest practice stays unidentified'}
        />
        <Metric
          label="Account reports"
          value={value(totals.account)}
          note={knownDays ? share(totals.account) : 'Totals are not linked to accounts'}
        />
        <Metric
          label="Average per collected day"
          value={knownDays ? decimalFormat.format(totals.total / knownDays) : 'Not collected'}
          note={
            knownDays
              ? `${knownDays} collected ${knownDays === 1 ? 'day' : 'days'} · Today may be partial`
              : 'Excludes days before collection began'
          }
        />
      </dl>
      <PracticeChart stats={stats} title="Practice volume" />
      <section
        className="admin-panel admin-tool-table-panel"
        aria-labelledby="admin-tool-table-heading"
      >
        <div className="admin-panel-heading">
          <div>
            <h2 id="admin-tool-table-heading">Practice by tool</h2>
            <p>Guest means signed out when the session was recorded.</p>
          </div>
          <span className="admin-tag">{stats.practice.days} days</span>
        </div>
        {!knownDays ? (
          <p className="admin-no-data">No tool usage collected yet.</p>
        ) : (
          <div
            className="admin-table-scroll"
            role="region"
            aria-label="Practice tool totals"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Practice reports by tool, split into guest and account totals.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Practice tool</th>
                  <th scope="col">Guest</th>
                  <th scope="col">Account</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.practice.tools.map((tool) => (
                  <tr key={tool.tool}>
                    <th scope="row">{usageToolLabels[tool.tool]}</th>
                    <td>{countFormat.format(tool.guest)}</td>
                    <td>{countFormat.format(tool.account)}</td>
                    <td>{countFormat.format(tool.guest + tool.account)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All tools</th>
                  <td>{countFormat.format(totals.guest)}</td>
                  <td>{countFormat.format(totals.account)}</td>
                  <td>{countFormat.format(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      <div className="admin-definitions">
        <section>
          <h2>One session, one request</h2>
          <p>
            Recording new practice sends one background report. Saving works the same for guests and
            accounts.
          </p>
        </section>
        <section>
          <h2>Approximate by design</h2>
          <p>
            Reporting never blocks saving. Failed requests are dropped without retries or a delivery
            queue.
          </p>
        </section>
        <section>
          <h2>Only new practice</h2>
          <p>
            Opening tools, refreshing pages, edits, imports, and transferring guest results into an
            account do not add counts.
          </p>
        </section>
      </div>
    </>
  );
}

function Operations({ stats }: { stats: AdminStats }) {
  const operations = stats.operations;
  return (
    <>
      <dl className="admin-metrics">
        <Metric
          label="Account payload storage"
          value={formatBytes(operations.accountStorageBytes)}
          note="Combined stored account payloads"
        />
        <Metric
          label="Actual database storage"
          value={
            operations.databaseStorageBytes === null
              ? 'Unavailable'
              : formatBytes(operations.databaseStorageBytes)
          }
          note="Database pages, including indexes and other tables"
        />
        <Metric
          label="Database reachability"
          value={operations.databaseReachable ? 'Reachable' : 'Unavailable'}
          note="Checked when this view was loaded"
        />
        <Metric
          label="Practice retention"
          value="180 days"
          note="Older counters removed during daily cleanup"
        />
      </dl>
      <div className="admin-info-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Service & scheduled cleanup</h2>
              <p>Current checks and the last completed cleanup</p>
            </div>
          </div>
          <p
            className={`admin-health ${operations.databaseReachable ? 'admin-health-ok' : 'admin-health-error'}`}
          >
            <span aria-hidden="true" />
            {operations.databaseReachable ? 'Database check passed' : 'Database check unavailable'}
          </p>
          <dl className="admin-facts">
            <div>
              <dt>Check time</dt>
              <dd>{formatTimestamp(stats.generatedAt)}</dd>
            </div>
            <div>
              <dt>Last successful cleanup</dt>
              <dd>
                {operations.lastCleanupAt
                  ? formatTimestamp(operations.lastCleanupAt)
                  : 'Unavailable'}
              </dd>
            </div>
          </dl>
          <p className="admin-panel-note">
            An unavailable cleanup timestamp means a successful run has not been recorded yet.
          </p>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Infrastructure monitoring</h2>
              <p>Provider telemetry is separate from practice reporting</p>
            </div>
          </div>
          <dl className="admin-facts">
            <div>
              <dt>API request volume</dt>
              <dd>Unavailable here</dd>
            </div>
            <div>
              <dt>Errors and latency</dt>
              <dd>Unavailable here</dd>
            </div>
            <div>
              <dt>Email delivery failures</dt>
              <dd>Unavailable here</dd>
            </div>
          </dl>
          {operations.monitoringUrl && (
            <a
              className="admin-monitoring-link"
              href={operations.monitoringUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open provider monitoring <ExternalLink size={16} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </section>
      </div>
      <section className="admin-soft-panel">
        <h2>Storage & capacity</h2>
        <p>
          Account payload storage and actual database storage measure different things. Database
          storage also includes sessions, indexes, and other service data.
        </p>
      </section>
    </>
  );
}

export default function AdminConsole({
  user,
  onSignIn,
}: {
  user: User | null;
  onSignIn: () => void;
}) {
  const [view, setView] = useState<View>('overview');
  const [days, setDays] = useState<Period>(30);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const usageNavigation = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const owner = user?.id;
  useEffect(() => {
    if (!owner) {
      setState(null);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setState({ status: 'loading', owner, days });
    void api<AdminStats>(`/admin/stats?days=${days}`, undefined, 'GET', controller.signal, {
      accountId: owner,
    }).then(
      (stats) => {
        if (current) setState({ status: 'ready', owner, days, stats });
      },
      (error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setState({
          status: 'error',
          owner,
          days,
          message: error instanceof Error ? error.message : 'The statistics could not be loaded.',
          code: error instanceof ApiError ? error.status : undefined,
        });
      },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [owner, days, refresh]);
  const selected = views[view];
  const visible = state && state.owner === owner && state.days === days ? state : null;
  const loading = !!user && (!visible || visible.status === 'loading');
  const stats = visible?.status === 'ready' ? visible.stats : null;
  return (
    <div className="admin-console">
      <div className="admin-topline">
        <span>Admin console</span>
        <span className="admin-access">
          <ShieldCheck size={15} aria-hidden="true" />
          Read only
        </span>
      </div>
      <header className="admin-heading">
        <div>
          <h1>{selected.title}</h1>
          <p>{selected.subtitle}</p>
        </div>
      </header>
      {!user ? (
        <section className="admin-access-state" aria-labelledby="admin-sign-in-heading">
          <ShieldCheck size={32} aria-hidden="true" />
          <h2 id="admin-sign-in-heading">Sign in to view service statistics</h2>
          <p>This console is available to accounts granted metrics access.</p>
          <button className="button dark" onClick={onSignIn}>
            Sign in
          </button>
        </section>
      ) : (
        <>
          <div className="admin-controls">
            <nav className="admin-view-nav" aria-label="Admin console views">
              {(Object.keys(views) as View[]).map((name) => {
                const Icon = views[name].icon;
                return (
                  <button
                    key={name}
                    ref={name === 'usage' ? usageNavigation : undefined}
                    aria-current={view === name ? 'page' : undefined}
                    onClick={() => setView(name)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {views[name].label}
                  </button>
                );
              })}
            </nav>
            <div className="admin-range-controls">
              {view !== 'operations' && (
                <div className="admin-range">
                  <label htmlFor={rangeId}>Practice period</label>
                  <select
                    id={rangeId}
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value) as Period)}
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={180}>Last 180 days</option>
                  </select>
                </div>
              )}
              <button
                className="admin-refresh"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={loading}
                aria-label="Refresh statistics"
                title="Refresh statistics"
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div aria-busy={loading}>
            {loading && (
              <p className="admin-loading" role="status">
                Loading service statistics…
              </p>
            )}
            {visible?.status === 'error' && (
              <section className="admin-access-state" aria-labelledby="admin-error-heading">
                <ShieldCheck size={32} aria-hidden="true" />
                <h2 id="admin-error-heading">
                  {visible.code === 403
                    ? 'Metrics access required'
                    : visible.code === 401
                      ? 'Sign in again to continue'
                      : 'Statistics unavailable'}
                </h2>
                <p>
                  {visible.code === 403
                    ? 'Your account has not been granted access to this read-only console.'
                    : visible.code === 401
                      ? 'Your session is no longer signed in.'
                      : visible.message}
                </p>
                {visible.code === 401 ? (
                  <button className="button dark" onClick={onSignIn}>
                    Sign in
                  </button>
                ) : (
                  visible.code !== 403 && (
                    <button
                      className="button outline"
                      onClick={() => setRefresh((value) => value + 1)}
                    >
                      Try again
                    </button>
                  )
                )}
              </section>
            )}
            {stats && (
              <>
                {view === 'overview' ? (
                  <Overview
                    stats={stats}
                    onUsage={() => {
                      setView('usage');
                      usageNavigation.current?.focus();
                    }}
                  />
                ) : view === 'usage' ? (
                  <Usage stats={stats} />
                ) : (
                  <Operations stats={stats} />
                )}
              </>
            )}
          </div>
          {stats && (
            <footer className="admin-footer">
              <span>Updated {formatTimestamp(stats.generatedAt)}</span>
              <span>
                {stats.practice.collectionStartedDay
                  ? `Practice collection began ${stats.practice.collectionStartedDay} · UTC days`
                  : 'Practice collection has not started · UTC days'}
              </span>
            </footer>
          )}
        </>
      )}
    </div>
  );
}
