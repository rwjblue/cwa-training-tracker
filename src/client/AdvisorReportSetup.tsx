import AdvisorReportDraft from './AdvisorReportDraft';
import type { ReportDocument } from '../shared/report-document';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AccountChange } from '../shared/account-sync';
import type { PlannedTask } from '../shared/plan';
import { type Profile, type PracticeSession } from '../shared/training';
import {
  MAX_REPORT_FIELDS,
  REPORT_FIELD_TYPES,
  REPORT_SOURCE_MAPPINGS,
  starterAdvisorReportDefinition,
  validateAdvisorReportDefinition,
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
  scope,
  generation,
  profile,
  tasks,
  entries,
  reports,
  revision,
  onChange,
}: {
  active: boolean;
  scope: string;
  generation: number;
  profile: Profile;
  tasks: PlannedTask[];
  entries: PracticeSession[];
  reports: ReportDocument[];
  revision: number;
  onChange: (change: AccountChange, revision: number) => Promise<unknown>;
}) {
  const definition = profile.reportDefinition ?? starterAdvisorReportDefinition();
  const [editing, setEditing] = useState(!profile.reportDefinition);
  const [notice, setNotice] = useState('');
  return editing ? (
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
      }}
    />
  ) : (
    <AdvisorReportDraft
      active={active}
      scope={scope}
      generation={generation}
      definition={definition}
      profile={profile}
      tasks={tasks}
      entries={entries}
      reports={reports}
      revision={revision}
      onChange={onChange}
      notice={notice}
      onConfigure={() => {
        setEditing(true);
        setNotice('');
      }}
    />
  );
}
