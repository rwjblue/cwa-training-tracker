import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AccountChange } from '../shared/account-sync';
import type { PlannedTask } from '../shared/plan';
import { dateInTimezone, type Profile } from '../shared/training';
import { advisorReportWindow } from '../shared/report-window';
import {
  MAX_REPORT_FIELDS,
  REPORT_FIELD_TYPES,
  REPORT_SOURCE_MAPPINGS,
  starterAdvisorReportDefinition,
  validateAdvisorReportDefinition,
  validateAdvisorReportAnswers,
  type AdvisorReportDefinition,
  type AdvisorReportField,
} from '../shared/report-definition';
import './advisor-report.css';

const bounds = ['min', 'max', 'minExclusive', 'maxExclusive'] as const;
type FieldDraft = Omit<
  AdvisorReportField,
  'options' | 'min' | 'max' | 'minExclusive' | 'maxExclusive'
> & {
  editorId: string;
  choices: string;
  min: string;
  max: string;
  minExclusive: string;
  maxExclusive: string;
};
const fieldDraft = (field: AdvisorReportField): FieldDraft => {
  const { options, ...rules } = field;
  return {
    ...rules,
    editorId: crypto.randomUUID(),
    choices: options?.join('\n') ?? '',
    min: String(field.min ?? ''),
    max: String(field.max ?? ''),
    minExclusive: String(field.minExclusive ?? ''),
    maxExclusive: String(field.maxExclusive ?? ''),
  };
};
const fieldDefinition = (field: FieldDraft): AdvisorReportField => {
  const {
    editorId: _editorId,
    choices,
    min,
    max,
    minExclusive,
    maxExclusive,
    integer,
    ...rest
  } = field;
  return {
    ...rest,
    ...(field.type === 'rating'
      ? { options: choices.split('\n').filter((choice) => choice !== '') }
      : {}),
    ...(field.type === 'number'
      ? {
          integer: Boolean(integer),
          ...Object.fromEntries(
            Object.entries({ min, max, minExclusive, maxExclusive })
              .filter(([, value]) => value !== '')
              .map(([key, value]) => [
                key,
                /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : NaN,
              ]),
          ),
        }
      : {}),
    ...(rest.externalId ? {} : { externalId: undefined }),
  };
};

function DefinitionEditor({
  active,
  definition,
  revision,
  onChange,
  onCancel,
  onSaved,
}: {
  active: boolean;
  definition: AdvisorReportDefinition;
  revision: number;
  onChange: (change: AccountChange, revision: number) => Promise<unknown>;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState(definition.title);
  const [url, setUrl] = useState(definition.formUrl ?? '');
  const [fields, setFields] = useState(() => definition.fields.map(fieldDraft));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const capturedRevision = useRef(revision);
  const mounted = useRef(true);
  const addButton = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) titleInput.current?.focus();
  }, [active]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const edit = (id: string, patch: Partial<FieldDraft>) =>
    setFields((rows) => rows.map((row) => (row.editorId === id ? { ...row, ...patch } : row)));
  const move = (index: number, delta: number) =>
    setFields((rows) => {
      const next = [...rows];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const reportDefinition = validateAdvisorReportDefinition({
        version: 1,
        title,
        ...(url ? { formUrl: url } : {}),
        fields: fields.map(fieldDefinition),
      });
      const result = await onChange(
        { type: 'settings', changes: { reportDefinition } },
        capturedRevision.current,
      );
      if (mounted.current)
        onSaved(
          result &&
            typeof result === 'object' &&
            'destination' in result &&
            result.destination === 'device'
            ? 'Definition saved on this device. Waiting to sync; Retry account sync is available after closing this report.'
            : 'Report definition saved.',
        );
    } catch (error) {
      if (mounted.current) setError((error as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <form className="advisor-report-editor" onSubmit={save} aria-busy={busy} noValidate>
      <h3>Configure advisor fields</h3>
      <p>
        Your definition is private. Choose your own labels and rules; no advisor identity or form
        destination is supplied. Source mappings below supply report context, not inferred
        performance.
      </p>
      <fieldset disabled={busy}>
        <div className="plan-form-grid">
          <label>
            Report title
            <input
              ref={titleInput}
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            External form URL (optional)
            <input
              type="url"
              value={url}
              maxLength={4000}
              placeholder="https://"
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
        </div>
        <p>
          An optional HTTPS destination and field IDs are retained privately. Saving this
          configuration sends no answers to that destination.
        </p>
        {fields.map((field, index) => (
          <details className="advisor-field" key={field.editorId}>
            <summary>
              {index + 1}. {field.label || 'Untitled field'}
            </summary>
            <fieldset aria-label={`Field ${index + 1}`}>
              <div className="plan-form-grid">
                <label>
                  Field key
                  <input
                    value={field.key}
                    maxLength={64}
                    onChange={(event) => edit(field.editorId, { key: event.target.value })}
                  />
                </label>
                <label>
                  Field label
                  <input
                    value={field.label}
                    maxLength={160}
                    onChange={(event) => edit(field.editorId, { label: event.target.value })}
                  />
                </label>
                <label>
                  Section
                  <input
                    value={field.section}
                    maxLength={80}
                    onChange={(event) => edit(field.editorId, { section: event.target.value })}
                  />
                </label>
                <label>
                  Field type
                  <select
                    value={field.type}
                    onChange={(event) =>
                      edit(field.editorId, { type: event.target.value as FieldDraft['type'] })
                    }
                  >
                    {REPORT_FIELD_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Source mapping
                  <select
                    value={field.source}
                    onChange={(event) =>
                      edit(field.editorId, { source: event.target.value as FieldDraft['source'] })
                    }
                  >
                    {REPORT_SOURCE_MAPPINGS.map((mapping) => (
                      <option key={mapping.id} value={mapping.id}>
                        {mapping.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  External field ID (optional)
                  <input
                    value={field.externalId ?? ''}
                    maxLength={100}
                    onChange={(event) => edit(field.editorId, { externalId: event.target.value })}
                  />
                </label>
              </div>
              <label className="advisor-check">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => edit(field.editorId, { required: event.target.checked })}
                />
                Answer required
              </label>
              {field.type === 'rating' && (
                <label>
                  Exact rating choices (one per line)
                  <textarea
                    value={field.choices}
                    rows={4}
                    onChange={(event) => edit(field.editorId, { choices: event.target.value })}
                  />
                  <span>
                    Blank lines are ignored. Choice spelling and capitalization are preserved
                    exactly.
                  </span>
                </label>
              )}
              {field.type === 'number' && (
                <>
                  <div className="plan-form-grid">
                    {bounds.map((bound) => (
                      <label key={bound}>
                        {
                          {
                            min: 'Minimum (inclusive)',
                            max: 'Maximum (inclusive)',
                            minExclusive: 'Greater than (exclusive)',
                            maxExclusive: 'Less than (exclusive)',
                          }[bound]
                        }
                        <input
                          inputMode="decimal"
                          value={field[bound]}
                          onChange={(event) =>
                            edit(field.editorId, { [bound]: event.target.value })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="advisor-check">
                    <input
                      type="checkbox"
                      checked={Boolean(field.integer)}
                      onChange={(event) => edit(field.editorId, { integer: event.target.checked })}
                    />
                    Whole numbers only
                  </label>
                </>
              )}
              <div className="plan-form-actions">
                <button
                  type="button"
                  className="button outline small"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  Move {field.label || 'field'} up
                </button>
                <button
                  type="button"
                  className="button outline small"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Move {field.label || 'field'} down
                </button>
                <button
                  type="button"
                  className="button outline small"
                  disabled={fields.length === 1}
                  onClick={() => {
                    setFields((rows) => rows.filter((row) => row.editorId !== field.editorId));
                    addButton.current?.focus();
                  }}
                >
                  Remove {field.label || 'field'}
                </button>
              </div>
            </fieldset>
          </details>
        ))}
        <button
          ref={addButton}
          type="button"
          className="button outline"
          disabled={fields.length >= MAX_REPORT_FIELDS}
          onClick={() => {
            let number = fields.length + 1;
            while (fields.some((field) => field.key === `field${number}`)) number++;
            setFields((rows) => [
              ...rows,
              fieldDraft({
                key: `field${number}`,
                label: 'New field',
                section: 'Practice',
                type: 'text',
                source: 'manual',
                required: false,
              }),
            ]);
          }}
        >
          Add report field
        </button>
      </fieldset>
      {error && (
        <p className="alert" role="alert">
          {error} Your changes are retained; correct them and save again.
        </p>
      )}
      <div className="plan-form-actions">
        <button type="button" className="button outline" disabled={busy} onClick={onCancel}>
          Cancel configuration
        </button>
        <button className="button dark" disabled={busy}>
          {busy ? 'Saving definition…' : 'Save report definition'}
        </button>
      </div>
    </form>
  );
}

export default function AdvisorReportSetup({
  active,
  profile,
  tasks,
  revision,
  onChange,
}: {
  active: boolean;
  profile: Profile;
  tasks: PlannedTask[];
  revision: number;
  onChange: (change: AccountChange, revision: number) => Promise<unknown>;
}) {
  const definition = profile.reportDefinition ?? starterAdvisorReportDefinition();
  const [editing, setEditing] = useState(!profile.reportDefinition);
  const [session, setSession] = useState(1);
  const zone = profile.classSchedule?.timezone ?? profile.timezone;
  const [reportDate, setReportDate] = useState(() => dateInTimezone(new Date(), zone));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [checked, setChecked] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const invalidateCopy = () => {
    setCopyError('');
    setCopyNotice('');
  };
  const configure = useRef<HTMLButtonElement>(null);
  const firstSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (active && !editing) firstSelect.current?.focus();
  }, [editing, active]);
  let window;
  let windowError = '';
  try {
    window = advisorReportWindow(profile, tasks, session, reportDate);
  } catch (error) {
    windowError = (error as Error).message;
  }
  const context = {
    callsign: profile.callsign,
    displayName: profile.displayName,
    session: String(session),
    reportDate,
  };
  const values = Object.fromEntries(
    definition.fields.map((field) => [
      field.key,
      field.source === 'manual' ? (answers[field.key] ?? '') : context[field.source],
    ]),
  );
  const errors = checked ? validateAdvisorReportAnswers(definition, values) : [];
  const preview = [
    definition.title,
    `Session ${session}; report date ${reportDate}`,
    window
      ? `Course timezone: ${window.timezone}\nWindow: ${window.empty ? 'empty' : `${window.fromDate} through ${window.toDate} (inclusive)`}`
      : windowError,
    ...definition.fields.map((field) => `${field.section} — ${field.label}: ${values[field.key]}`),
  ].join('\n');
  if (editing)
    return (
      <DefinitionEditor
        active={active}
        definition={definition}
        revision={revision}
        onChange={onChange}
        onCancel={() => {
          setEditing(false);
          setNotice('Configuration canceled. Your saved definition is unchanged.');
        }}
        onSaved={(message) => {
          setEditing(false);
          setNotice(message);
          setChecked(false);
        }}
      />
    );
  return (
    <section className="advisor-report-setup" aria-label="Advisor report setup">
      <h3>{definition.title}</h3>
      {notice && <p role="status">{notice}</p>}
      <button
        ref={configure}
        className="button outline small"
        onClick={() => {
          setEditing(true);
          setNotice('');
        }}
      >
        Configure advisor fields
      </button>
      <div className="plan-form-grid">
        <label>
          Class session
          <select
            ref={firstSelect}
            value={session}
            onChange={(event) => {
              setSession(Number(event.target.value));
              invalidateCopy();
              setChecked(false);
            }}
          >
            {Array.from({ length: 16 }, (_, index) => (
              <option key={index} value={index + 1}>
                Session {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Report date
          <input
            type="date"
            value={reportDate}
            onChange={(event) => {
              setReportDate(event.target.value);
              invalidateCopy();
              setChecked(false);
            }}
          />
        </label>
      </div>
      {windowError ? (
        <p className="alert" role="alert">
          {windowError}
        </p>
      ) : (
        window && (
          <section className="advisor-window" aria-label="Report preparation window">
            <p>
              <strong>Course timezone:</strong> {window.timezone}
            </p>
            <p>
              <strong>Source preparation dates:</strong>{' '}
              {window.preparationDates.length
                ? window.preparationDates.join(', ')
                : 'No dated preparation exercises'}
            </p>
            <p>
              <strong>Class:</strong> {window.meetingDate ?? 'No scheduled date'}
              {window.meetingStartsAt
                ? `; ${new Intl.DateTimeFormat('en-US', { timeZone: window.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(window.meetingStartsAt))} (${window.timezone})`
                : ''}
            </p>
            <p>
              <strong>Inclusive report window:</strong>{' '}
              {window.empty
                ? `Empty — preparation starts ${window.fromDate}; report ends ${window.toDate}`
                : `${window.fromDate} through ${window.toDate}`}
            </p>
            <p>{window.explanation} Meeting exceptions do not move curriculum preparation dates.</p>
          </section>
        )
      )}
      <p>
        Preview your field rules below. These preview answers are not saved; copy them before
        closing.
      </p>
      <div className="advisor-answers">
        {definition.fields.map((field, index) => {
          const id = `advisor-answer-${index}`;
          const error = errors.find((error) => error.key === field.key);
          const input = {
            id,
            value: values[field.key],
            'aria-invalid': Boolean(error),
            'aria-describedby': error ? `${id}-error` : undefined,
            onChange: (
              event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
            ) => {
              setAnswers((previous) => ({ ...previous, [field.key]: event.target.value }));
              invalidateCopy();
              setChecked(false);
            },
          };
          return (
            <div key={field.key}>
              <label htmlFor={id}>
                {field.section} — {field.label}
                {field.required ? ' (required)' : ' (optional)'}
              </label>
              {field.type === 'rating' ? (
                <select {...input}>
                  <option value="">No answer</option>
                  {field.options?.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea {...input} maxLength={4000} rows={3} />
              ) : (
                <input
                  {...input}
                  readOnly={field.source !== 'manual'}
                  type={field.type === 'date' ? 'date' : 'text'}
                  inputMode={field.type === 'number' ? 'decimal' : undefined}
                  maxLength={4000}
                />
              )}
              {error && (
                <p id={`${id}-error`} role="alert">
                  {error.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="plan-form-actions">
        <button
          className="button outline"
          disabled={Boolean(windowError)}
          onClick={() => setChecked(true)}
        >
          Check preview answers
        </button>
        <button
          className="button outline"
          disabled={Boolean(windowError)}
          onClick={async () => {
            setChecked(true);
            if (validateAdvisorReportAnswers(definition, values).length) return;
            try {
              await navigator.clipboard.writeText(preview);
              setCopyError('');
              setCopyNotice('Preview copied.');
            } catch {
              setCopyError('Select the preview text below and use your device’s copy command.');
            }
          }}
        >
          Copy advisor preview
        </button>
      </div>
      {checked && !errors.length && !windowError && (
        <p role="status">
          Preview answers satisfy your configured field rules. Nothing has been submitted.
        </p>
      )}
      {copyNotice && <p role="status">{copyNotice}</p>}
      {copyError && <p role="status">{copyError}</p>}
      <pre className="plan-report-text" tabIndex={0} aria-label="Advisor preview text">
        {preview}
      </pre>
    </section>
  );
}
