import { useState } from 'react';
import { LCWO_RUN_LABELS, lcwoRunDetails } from '../shared/lcwo';
import { lcwoContributionDetails, type LcwoContribution } from '../shared/lcwo-practice';
import './lcwo.css';

export default function LcwoHistory({
  rows,
  estimateSeconds,
  timezone,
}: {
  rows: readonly LcwoContribution[];
  estimateSeconds: number;
  timezone: string;
}) {
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(50);
  const shown = rows
    .filter((row) => filter === 'all' || row.run.kind === filter)
    .toSorted(
      (a, b) =>
        b.run.recordedAt.localeCompare(a.run.recordedAt) || b.run.id.localeCompare(a.run.id),
    );
  if (!rows.length) return null;
  return (
    <section
      id="lcwo-source-results"
      className="card lcwo-history"
      aria-label="Retained LCWO results"
    >
      <h2 tabIndex={-1}>Retained LCWO results</h2>
      <p>
        {rows.length} unique external source results. Completion dates use {timezone}; refresh dates
        do not supply practice credit. Source facts are read-only.
      </p>
      <label className="field">
        LCWO trainer filter
        <select
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setLimit(50);
          }}
        >
          <option value="all">All LCWO trainers</option>
          {Object.entries(LCWO_RUN_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {shown.slice(0, limit).map((row) => (
        <details key={row.run.id} className="lcwo-result">
          <summary>
            {LCWO_RUN_LABELS[row.run.kind]} · {row.date} · result {row.run.sourceResultId}
          </summary>
          <p>
            {new Intl.DateTimeFormat(undefined, {
              timeZone: timezone,
              dateStyle: 'medium',
              timeStyle: 'long',
            }).format(new Date(row.run.recordedAt))}
          </p>
          <ul>
            {lcwoRunDetails(row.run).map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <p>{lcwoContributionDetails(row, estimateSeconds)}</p>
        </details>
      ))}
      {!shown.length && <p>No retained results for this trainer.</p>}
      {shown.length > limit && (
        <button className="button outline" onClick={() => setLimit(limit + 50)}>
          Show 50 more results
        </button>
      )}
    </section>
  );
}
