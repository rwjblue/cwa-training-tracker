import { useId } from 'react';
import {
  createManualTiming,
  LCWO_FIELDS,
  LCWO_KINDS,
  LCWO_KIND_FIELDS,
  LCWO_METRIC_LIMITS,
  manualCompletionCandidates,
  validateExternalPractice,
  type ExternalPractice,
} from '../shared/external-practice';
import { dateInTimezone, type PracticeSession } from '../shared/training';

export function manualPracticeDraft(entry: Partial<PracticeSession>, timezone: string) {
  const result = entry.metadata?.externalResult;
  const timing = entry.metadata?.manualTiming;
  const string = (key: string) =>
    result && key in result ? String((result as unknown as Record<string, unknown>)[key]) : '';
  return {
    externalKind: result?.trainer === 'lcwo' ? result.kind : (result?.trainer ?? ''),
    mode: result?.trainer === 'morse-runner' ? result.mode : '',
    speedWpm: string('speedWpm'),
    groupLength: string('groupLength'),
    maximumLength: string('maximumLength'),
    errorCount: string('errorCount'),
    errorPercent: string('errorPercent'),
    score: string('score'),
    startingWpm: string('startingWpm'),
    usedWpms: result?.trainer === 'morse-runner' ? (result.usedWpms?.join(', ') ?? '') : '',
    verifiedPoints: string('verifiedPoints'),
    contacts: string('contacts'),
    completedLocal: timing?.completedLocal ?? '',
    timezone: timing?.timezone ?? timezone,
    occurrence: timing?.occurrence === undefined ? '' : String(timing.occurrence),
  };
}
export type ManualPracticeDraft = ReturnType<typeof manualPracticeDraft>;
export function readManualPracticeDraft(draft: ManualPracticeDraft, seconds: number) {
  let externalResult: ExternalPractice | undefined;
  if (draft.externalKind) {
    const row: Record<string, unknown> = { version: 1, source: 'user-entered' };
    if (draft.externalKind === 'morse-runner') {
      Object.assign(row, { trainer: 'morse-runner', mode: draft.mode, elapsedSeconds: seconds });
      for (const key of ['startingWpm', 'verifiedPoints', 'score', 'contacts'] as const)
        if (draft[key].trim()) row[key] = Number(draft[key]);
      if (draft.usedWpms.trim()) {
        const values = draft.usedWpms.split(',').map((value) => value.trim());
        if (values.some((value) => !value))
          throw new Error('Separate actual Runner speeds with commas; omit empty items.');
        row.usedWpms = values.map(Number);
      }
    } else {
      Object.assign(row, { trainer: 'lcwo', kind: draft.externalKind });
      for (const key of LCWO_KIND_FIELDS[draft.externalKind as keyof typeof LCWO_KINDS] ?? [])
        if (draft[key].trim()) row[key] = Number(draft[key]);
    }
    externalResult = validateExternalPractice(row);
  }
  const manualTiming = draft.completedLocal
    ? createManualTiming(
        draft.completedLocal,
        draft.timezone,
        seconds,
        draft.occurrence === '' ? undefined : (Number(draft.occurrence) as 0 | 1),
      )
    : undefined;
  return { externalResult, manualTiming };
}

/** Fields only: the common review owns the draft and existing save/retry workflow. */
export default function ManualPracticeFields({
  draft,
  onChange,
  seconds,
  captureTiming = true,
}: {
  draft: ManualPracticeDraft;
  onChange: (draft: ManualPracticeDraft) => void;
  seconds?: number;
  captureTiming?: boolean;
}) {
  const hintId = useId();
  const update = (key: keyof ManualPracticeDraft, value: string) =>
    onChange({ ...draft, [key]: value });
  let candidates: number[] = [];
  let timingError = '';
  let startPreview = '';
  if (draft.completedLocal) {
    try {
      candidates = manualCompletionCandidates(draft.completedLocal, draft.timezone);
      if (!candidates.length)
        timingError = `This time does not exist in ${draft.timezone} because the clock changes. Choose another time.`;
      if (
        candidates.length &&
        seconds !== undefined &&
        (candidates.length === 1 || draft.occurrence !== '')
      ) {
        const timing = createManualTiming(
          draft.completedLocal,
          draft.timezone,
          seconds,
          draft.occurrence === '' ? undefined : (Number(draft.occurrence) as 0 | 1),
        );
        startPreview = `Actual start: ${timing.startedAt} · practice date: ${dateInTimezone(timing.startedAt, timing.timezone)} in ${timing.timezone}.`;
      }
    } catch (error) {
      timingError = (error as Error).message;
    }
  }
  const numberField = (
    key: keyof ManualPracticeDraft,
    label: string,
    min: number,
    max: number,
    step: string = 'any',
  ) => (
    <label className="field" key={key}>
      {label} <span className="label-hint">optional</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft[key]}
        onChange={(event) => update(key, event.target.value)}
      />
    </label>
  );
  return (
    <>
      <label className="field">
        External result <span className="label-hint">optional</span>
        <select
          aria-label="External result"
          aria-describedby={`${hintId}-external`}
          value={draft.externalKind}
          onChange={(event) =>
            onChange({
              ...manualPracticeDraft({}, draft.timezone),
              completedLocal: draft.completedLocal,
              occurrence: draft.occurrence,
              externalKind: event.target.value,
            })
          }
        >
          <option value="">No external result</option>
          {Object.entries(LCWO_KINDS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          {captureTiming && <option value="morse-runner">External Morse Runner</option>}
        </select>
        <span className="field-hint" id={`${hintId}-external`}>
          Enter one actual run. These are user-entered results, separate from native Copy and the
          Companion Runner. Blank means unknown; 0 records a measured zero. Changing trainer clears
          entered metrics.
        </span>
      </label>
      {draft.externalKind && draft.externalKind !== 'morse-runner' && (
        <>
          <p className="field-hint">
            Groups and Koch use effective speed, not character speed. Words and callsigns use the
            trainer’s own actual speed. Enter errors, not accuracy; for words count red received
            entries.
          </p>
          <div className="form-grid">
            {(LCWO_KIND_FIELDS[draft.externalKind as keyof typeof LCWO_KINDS] ?? []).map((key) =>
              numberField(
                key,
                key === 'speedWpm' && ['letters', 'figures', 'custom'].includes(draft.externalKind)
                  ? 'Actual effective speed (WPM)'
                  : LCWO_FIELDS[key],
                LCWO_METRIC_LIMITS[key].min,
                LCWO_METRIC_LIMITS[key].max,
                LCWO_METRIC_LIMITS[key].integer ? '1' : 'any',
              ),
            )}
          </div>
        </>
      )}
      {draft.externalKind === 'morse-runner' && (
        <>
          <p className="field-hint">
            Time practiced is this run’s actual duration, not configured contest length. Used speeds
            are your recollection, not an engine timeline. Verified points and score are separate;
            neither proves an on-air contact.
          </p>
          <div className="form-grid">
            <label className="field">
              External Runner mode
              <select
                value={draft.mode}
                required
                onChange={(event) => update('mode', event.target.value)}
              >
                <option value="">Choose actual mode</option>
                <option value="SingleCall">Single call</option>
                <option value="WPX">WPX</option>
              </select>
            </label>
            {numberField('startingWpm', 'Runner starting speed (WPM)', 1, 200)}
            <label className="field">
              Actual used Runner speeds <span className="label-hint">optional</span>
              <input
                aria-label="Actual used Runner speeds"
                aria-describedby={`${hintId}-speeds`}
                value={draft.usedWpms}
                maxLength={2000}
                placeholder="20, 25, 30"
                onChange={(event) => update('usedWpms', event.target.value)}
              />
              <span className="field-hint" id={`${hintId}-speeds`}>
                Distinct speeds separated by commas. Include the starting speed if known.
              </span>
            </label>
            {numberField('verifiedPoints', 'Runner verified points', 0, 1e12, '1')}
            {numberField('score', 'Runner score', 0, 1e12, '1')}
            {numberField('contacts', 'Runner simulated contacts', 0, 1e12, '1')}
          </div>
        </>
      )}
      {captureTiming && (
        <>
          <div className="form-grid manual-practice-timing">
            <label className="field">
              Actual local completion <span className="label-hint">optional</span>
              <input
                aria-label="Actual local completion"
                aria-describedby={`${hintId}-completion`}
                type="datetime-local"
                step="1"
                value={draft.completedLocal}
                onChange={(event) =>
                  onChange({ ...draft, completedLocal: event.target.value, occurrence: '' })
                }
              />
              <span className="field-hint" id={`${hintId}-completion`}>
                Leave unknown historical times blank. Start is completion minus Time practiced; its
                local date determines the practice date.
              </span>
            </label>
            {draft.completedLocal && (
              <label className="field">
                Practice timezone
                <input
                  aria-label="Practice timezone"
                  aria-describedby={`${hintId}-zone`}
                  value={draft.timezone}
                  required
                  maxLength={100}
                  onChange={(event) =>
                    onChange({ ...draft, timezone: event.target.value, occurrence: '' })
                  }
                />
                <span className="field-hint" id={`${hintId}-zone`}>
                  Captured learner IANA timezone; your browser timezone is not used.
                </span>
              </label>
            )}
          </div>
          {timingError && (
            <p className="alert error" role="alert">
              {timingError}
            </p>
          )}
          {startPreview && (
            <p className="field-hint" role="status">
              {startPreview}
            </p>
          )}
          {candidates.length > 1 && (
            <label className="field">
              Repeated completion time
              <select
                required
                value={draft.occurrence}
                onChange={(event) => update('occurrence', event.target.value)}
              >
                <option value="">Choose the occurrence</option>
                {candidates.map((instant, index) => (
                  <option key={instant} value={index}>
                    {index === 0 ? 'Earlier' : 'Later'} occurrence ·{' '}
                    {new Date(instant).toISOString()}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
    </>
  );
}
