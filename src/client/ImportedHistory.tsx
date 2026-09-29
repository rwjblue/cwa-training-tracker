import { useState } from 'react';
import type { PracticeSession, TrainingExport } from '../shared/training';
import { api } from './api';
import './imported-history.css';

type RecordData = Record<string, unknown>;
const record = (value: unknown): RecordData =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordData) : {};
const records = (value: unknown): RecordData[] =>
  Array.isArray(value) ? value.filter((item) => Object.keys(record(item)).length) : [];
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const scalar = (value: unknown): string => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(', ');
  return '';
};

const labels: Record<string, string> = {
  id: 'Original record ID',
  taskId: 'Original exercise ID',
  assignmentId: 'Original assignment ID',
  startedAt: 'Started',
  endedAt: 'Ended',
  createdAt: 'Saved',
  recordedAt: 'Recorded (UTC)',
  submittedAt: 'Submitted',
  completed: 'Marked complete',
  review: 'Extra review',
  activeSeconds: 'Practice seconds',
  recallSeconds: 'Recall seconds (included in practice)',
  completedPasses: 'Completed passes',
  performanceRating: 'Performance',
  difficulty: 'Earlier difficulty rating',
  characterWpm: 'Character speed (WPM)',
  effectiveWpm: 'Effective speed (WPM)',
  speedWpm: 'Trainer speed (WPM)',
  wpm: 'Speed (WPM)',
  maximumWpm: 'Maximum speed (WPM)',
  speeds: 'Speeds used (WPM)',
  verifiedPoints: 'Verified points',
  qsoCount: 'QSOs',
  elapsedSeconds: 'Elapsed seconds',
  durationSeconds: 'Duration seconds',
  conditions: 'Contest conditions',
  groupLength: 'Group length',
  maximumLength: 'Maximum word length',
  errorCount: 'Errors',
  errorPercent: 'Errors (%)',
  accuracyPercent: 'Stored accuracy (%)',
  heardCallsigns: 'Callsigns heard',
  heardExchanges: 'Names and exchanges heard',
  workedCallsigns: 'Callsigns worked',
  workedNames: 'Names worked',
  sourceType: 'LCWO trainer',
  sourceResultId: 'LCWO result ID',
  sourceTime: 'Original timestamp',
  sourceAttemptIds: 'Practice evidence IDs',
  sourceLcwoIds: 'LCWO evidence IDs',
  editedAnswerKeys: 'Answers edited by the learner',
  fromDate: 'Practice from',
  toDate: 'Practice through',
  reportDate: 'Report date',
  callsign: 'Callsign',
  firstName: 'First name',
  session: 'Class session',
  runnerWpm: 'Morse Runner speed (WPM)',
  runnerVerifiedPoints: 'Morse Runner verified points',
  lettersWpm: 'Letters effective speed (WPM)',
  figuresWpm: 'Figures effective speed (WPM)',
  customWpm: 'Custom characters effective speed (WPM)',
  wordsWpm: 'Word trainer speed (WPM)',
  callsignWpm: 'Callsign trainer speed (WPM)',
  eventComments: 'On-air event comments',
  learnedWords: 'Learned words',
  problems: 'Problems or questions',
  blockMinutes: 'Preferred block minutes',
  reminderTime: 'Reminder time',
  dailyGoalMinutes: 'Daily goal minutes',
  supersedesId: 'Revises material ID',
  startsAt: 'Starts',
  endsAt: 'Ends',
  dueAt: 'Due',
  minimumPasses: 'Minimum passes',
  maximumPasses: 'Maximum passes',
  objectiveCount: 'Objective count',
  source: 'Result source',
  audioSpeedPreference: 'Recording speed preference',
  audioAutoReplay: 'Replay assigned recordings',
  dailyListeningAutoReplay: 'Replay daily listening',
  gapSeconds: 'Word spacing (seconds)',
  pitch: 'Pitch (Hz)',
  spokenAnswers: 'Spoken answers',
  reading: 'Reading progress',
};
function label(key: string) {
  return (
    labels[key] ??
    key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (part) => part.toUpperCase())
  );
}

function fieldText(key: string, value: unknown) {
  if (key === 'editedAnswerKeys' && Array.isArray(value))
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(label)
      .join(', ');
  if (key === 'performanceRating' && value === 'very-good') return 'Very good';
  if (key === 'difficulty' && value === 'right') return 'About right';
  if (key === 'mode' && value === 'SingleCall') return 'Single Call';
  if (['performanceRating', 'difficulty', 'status', 'kind', 'usage'].includes(key))
    return scalar(value).replace(/^./, (part) => part.toUpperCase());
  return scalar(value);
}

function Fields({
  data,
  keys = Object.keys(data),
  blanks = false,
}: {
  data: RecordData;
  keys?: readonly string[];
  blanks?: boolean;
}) {
  const shown = keys.filter(
    (key) => scalar(data[key]) !== '' || (blanks && typeof data[key] === 'string'),
  );
  if (!shown.length) return null;
  return (
    <dl className="imported-fields">
      {shown.map((key) => (
        <div key={key}>
          <dt>{label(key)}</dt>
          <dd>{fieldText(key, data[key]) || 'Not recorded'}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourceLink({
  value,
  children = 'Open original source',
}: {
  value: unknown;
  children?: string;
}) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      return (
        <p>
          <a href={url.href} target="_blank" rel="noreferrer">
            {children}
          </a>
        </p>
      );
  } catch {
    /* Keep unrecognized source text readable without making an active link. */
  }
  return <p className="imported-text">Source: {raw}</p>;
}

function Result({ title, data, keys }: { title: string; data: unknown; keys?: readonly string[] }) {
  const values = record(data);
  if (!Object.keys(values).length) return null;
  return (
    <section className="imported-result">
      <h4>{title}</h4>
      <Fields data={values} keys={keys} />
    </section>
  );
}

export function legacyAttemptTitle(entry: PracticeSession): string {
  return text(record(entry.metadata?.legacyTask).title);
}

/** Read the preserved source without rewriting historical measurements or private notes. */
export function LegacyAttemptDetails({ entry }: { entry: PracticeSession }) {
  const attempt = record(entry.metadata?.legacyAttempt);
  const importedRun = record(entry.metadata?.legacyLcwoRun);
  if (Object.keys(importedRun).length)
    return (
      <details className="imported-attempt">
        <summary>Estimated LCWO practice</summary>
        <p className="imported-text">
          One minute estimated from a completed code-group result that was not covered by a saved
          practice block. This is an estimate, not measured audio time.
        </p>
        <Fields
          data={importedRun}
          keys={[
            'kind',
            'recordedAt',
            'characterWpm',
            'effectiveWpm',
            'accuracyPercent',
            'score',
            'sourceResultId',
            'id',
          ]}
        />
      </details>
    );
  if (!Object.keys(attempt).length) return null;
  const lcwo = record(attempt.lcwoResult);
  const groupSpeed = ['letters', 'figures', 'custom'].includes(text(lcwo.kind));
  const scratchpad = text(attempt.scratchpad);
  return (
    <details className="imported-attempt">
      <summary>Imported results &amp; context</summary>
      {legacyAttemptTitle(entry) && (
        <p className="imported-text">
          <strong>{legacyAttemptTitle(entry)}</strong>
        </p>
      )}
      <Fields
        data={attempt}
        keys={[
          'startedAt',
          'endedAt',
          'completed',
          'review',
          'performanceRating',
          'difficulty',
          'completedPasses',
          'recallSeconds',
          'qsoCount',
        ]}
      />
      {scratchpad && typeof entry.metadata?.scratchpad !== 'string' && (
        <section className="imported-result">
          <h4>Scratchpad</h4>
          <p className="imported-text">{scratchpad}</p>
        </section>
      )}
      <Result
        title="Morse Runner result"
        data={attempt.runnerResult}
        keys={[
          'mode',
          'wpm',
          'speeds',
          'verifiedPoints',
          'qsoCount',
          'score',
          'elapsedSeconds',
          'durationSeconds',
          'status',
          'conditions',
          'source',
          'runStartedAt',
          'runEndedAt',
        ]}
      />
      {Object.keys(lcwo).length > 0 && (
        <Result
          title="LCWO result"
          data={groupSpeed ? { ...lcwo, effectiveWpm: lcwo.speedWpm, speedWpm: undefined } : lcwo}
        />
      )}
      <Result title="On-air observations" data={attempt.cwtResult} />
      {records(attempt.audioResults).map((audio, index) => (
        <section className="imported-result" key={index}>
          <h4>{text(audio.title) || `Recording ${index + 1}`}</h4>
          <Fields
            data={{ ...audio, characterWpm: audio.speedWpm }}
            keys={['characterWpm', 'activeSeconds', 'completedPasses']}
          />
          <SourceLink value={audio.url} />
        </section>
      ))}
      <Fields data={attempt} keys={['id', 'taskId', 'assignmentId']} />
    </details>
  );
}

function mergedRecords(snapshot: unknown, pending: unknown): RecordData[] {
  const result = new Map<string, RecordData>();
  for (const [index, item] of [...records(snapshot), ...records(pending)].entries())
    result.set(text(item.id) || `unidentified:${index}`, item);
  return [...result.values()];
}

function Report({ report }: { report: RecordData }) {
  return (
    <details className="imported-item">
      <summary>
        Session {scalar(report.session) || 'unspecified'} ·{' '}
        {text(report.reportDate) || text(report.createdAt)} ·{' '}
        {report.status === 'submitted' ? 'Submitted report' : 'Saved draft'}
      </summary>
      <Fields data={report} keys={['fromDate', 'toDate', 'createdAt', 'submittedAt']} />
      <h4>Saved answers</h4>
      <Fields data={record(report.answers)} blanks />
      <details className="imported-evidence">
        <summary>Original evidence &amp; revision</summary>
        <Fields
          data={report}
          keys={['id', 'sourceAttemptIds', 'sourceLcwoIds', 'editedAnswerKeys']}
        />
      </details>
    </details>
  );
}

function Resource({ resource }: { resource: RecordData }) {
  return (
    <details className="imported-item">
      <summary>{text(resource.title) || text(resource.id) || 'Source material'}</summary>
      <Fields data={resource} keys={['id', 'format', 'durationSeconds', 'unresolved']} />
      {text(resource.text) && <p className="imported-text">{text(resource.text)}</p>}
      <SourceLink value={resource.url} />
    </details>
  );
}

function DeviceArchive({ original }: { original: RecordData }) {
  const drafts = mergedRecords(
    Object.values(record(original.reportDrafts)),
    Object.keys(record(original.reportDraft)).length ? [original.reportDraft] : [],
  );
  const active = record(original.active);
  const defaults = record(original.wordPracticeDefaults);
  const edits = record(original.reportEditsBySession);
  return (
    <details className="imported-group">
      <summary>Preserved device drafts &amp; preferences</summary>
      <p>
        These are the saved browser state from the original export. They remain available for
        reference and do not resume a timer or submit a report.
      </p>
      {drafts.length > 0 && (
        <>
          <h4>Device report drafts ({drafts.length})</h4>
          {drafts.map((draft, index) => (
            <Report
              key={text(draft.id) || index}
              report={{
                ...draft,
                editedAnswerKeys:
                  edits[String(draft.session)] ??
                  (draft.id === record(original.reportDraft).id
                    ? original.reportEditedKeys
                    : draft.editedAnswerKeys),
              }}
            />
          ))}
        </>
      )}
      <Fields
        data={original}
        keys={['audioSpeedPreference', 'audioAutoReplay', 'dailyListeningAutoReplay', 'dismissed']}
      />
      {Object.keys(record(original.audioSpeedOverrides)).length > 0 && (
        <Result title="Remembered exercise speeds (WPM)" data={original.audioSpeedOverrides} />
      )}
      {Object.keys(record(original.reading)).length > 0 && (
        <Result title="Reading progress" data={original.reading} />
      )}
      {Object.keys(defaults).length > 0 && (
        <section className="imported-result">
          <h4>Word practice defaults</h4>
          <Fields data={defaults} keys={['title', 'text', 'used']} />
          <Fields data={record(defaults.settings)} />
        </section>
      )}
      {Object.keys(active).length > 0 && (
        <details className="imported-item">
          <summary>Unfinished practice: {text(record(active.task).title) || 'Saved draft'}</summary>
          <p>This unfinished block is preserved separately from saved practice.</p>
          <Fields
            data={active}
            keys={[
              'startedAt',
              'activeSeconds',
              'recallSeconds',
              'completedPasses',
              'previousPasses',
              'targetPasses',
              'context',
              'review',
              'scratchpad',
              'bookmarks',
            ]}
          />
          <Fields data={record(active.wordPractice)} keys={['title', 'text']} />
          <Fields data={record(record(active.wordPractice).settings)} />
        </details>
      )}
    </details>
  );
}

function Archive({ data, cutoff }: { data: unknown; cutoff: RecordData }) {
  const original = record(data);
  const snapshot = record(original.snapshot ?? original);
  const pending = record(original.pending);
  const course = record(snapshot.course);
  const reports = mergedRecords(snapshot.reports, pending.reports).sort((a, b) =>
    text(b.createdAt).localeCompare(text(a.createdAt)),
  );
  const materials = mergedRecords(snapshot.materials, pending.materials);
  const runs = records(record(snapshot.lcwo).runs).sort((a, b) =>
    text(b.recordedAt).localeCompare(text(a.recordedAt)),
  );
  const preferences = { ...record(snapshot.preferences), ...record(pending.preferences) };
  const attempts = mergedRecords(snapshot.attempts, pending.attempts);
  const bookkeeping = attempts.filter((attempt) =>
    ['[Left missed]', '[Practiced elsewhere]'].includes(text(attempt.note)),
  );
  return (
    <div className="imported-archive">
      {text(cutoff.date) && (
        <p className="imported-cutoff">
          Practice was imported strictly before <strong>{text(cutoff.date)}</strong> (
          {text(cutoff.timezone)}). The original source archive below retains all exported records,
          including any later records, for reference.
        </p>
      )}
      <p>
        Original records stay private and are included in your backup. Practice entries are in your
        logbook; this view preserves their supporting records.
      </p>
      <details className="imported-group" open>
        <summary>Advisor reports ({reports.length})</summary>
        <p>
          Saved drafts and submitted snapshots retain their original answers and evidence. They can
          be read here; creating or submitting advisor reports is not available yet.
        </p>
        {reports.length ? (
          reports.map((report, index) => <Report key={text(report.id) || index} report={report} />)
        ) : (
          <p>No saved advisor reports in this import.</p>
        )}
      </details>
      <details className="imported-group">
        <summary>LCWO measurements ({runs.length})</summary>
        <p>
          Each row is one original result. Missing measurements remain unrecorded; scores and stored
          accuracy retain LCWO’s original meaning. Any estimated practice credit appears separately
          in your logbook.
        </p>
        {runs.length ? (
          runs.map((run, index) => (
            <details className="imported-item" key={text(run.id) || index}>
              <summary>
                {label(text(run.kind) || 'LCWO')} · {text(run.recordedAt) || 'Date unavailable'}
              </summary>
              <Fields
                data={run}
                keys={[
                  'recordedAt',
                  'sourceType',
                  'maximumWpm',
                  'characterWpm',
                  'effectiveWpm',
                  'score',
                  'accuracyPercent',
                  'lesson',
                  'competitive',
                  'sourceResultId',
                  'sourceTime',
                  'id',
                ]}
              />
            </details>
          ))
        ) : (
          <p>No LCWO measurements in this import.</p>
        )}
      </details>
      <details className="imported-group">
        <summary>Instructor materials ({materials.length})</summary>
        {materials.length ? (
          materials.map((material, index) => (
            <details className="imported-item" key={text(material.id) || index}>
              <summary>
                {text(material.title) || 'Untitled material'} · Session {scalar(material.session)}
              </summary>
              <Fields
                data={material}
                keys={['usage', 'createdAt', 'filename', 'id', 'supersedesId']}
              />
              <p className="imported-text">{text(material.text)}</p>
              <SourceLink value={material.url} />
            </details>
          ))
        ) : (
          <p>No instructor materials in this import.</p>
        )}
      </details>
      <details className="imported-group">
        <summary>Original course &amp; preferences</summary>
        <h4>{text(course.title) || 'Imported course'}</h4>
        <Fields data={course} keys={['version', 'timezone', 'dailyGoalMinutes', 'verifiedAt']} />
        {text(course.instructions) && <p className="imported-text">{text(course.instructions)}</p>}
        <SourceLink value={course.sourceUrl} />
        <h4>Original preferences</h4>
        <Fields data={preferences} keys={['blockMinutes', 'reminderTime', 'updatedAt']} />
        <SourceLink value={preferences.joinUrl} children="Original class link" />
        {records(preferences.carriedTasks).length > 0 && (
          <>
            <h4>Carried exercise reminders</h4>
            {records(preferences.carriedTasks).map((item, index) => (
              <Fields key={index} data={item} />
            ))}
          </>
        )}
        {bookkeeping.length > 0 && (
          <details className="imported-item">
            <summary>Earlier exercise decisions ({bookkeeping.length})</summary>
            {bookkeeping.map((attempt, index) => (
              <Fields
                key={text(attempt.id) || index}
                data={attempt}
                keys={['taskId', 'startedAt', 'note', 'completed']}
              />
            ))}
          </details>
        )}
        <details className="imported-item">
          <summary>Original class meetings ({records(course.meetings).length})</summary>
          {records(course.meetings).map((meeting, index) => (
            <Fields key={index} data={meeting} keys={['session', 'startsAt', 'endsAt']} />
          ))}
        </details>
        <details className="imported-item">
          <summary>Original assignments ({records(course.assignments).length})</summary>
          {records(course.assignments).map((assignment, index) => (
            <details className="imported-item" key={text(assignment.id) || index}>
              <summary>
                Session {scalar(assignment.session)} · Day {scalar(assignment.day)} ·{' '}
                {text(assignment.date)}
              </summary>
              <Fields data={assignment} keys={['dueAt', 'id']} />
              <p className="imported-text">{text(assignment.instructions)}</p>
              <SourceLink value={assignment.sourceUrl} />
              {records(assignment.tasks).map((task, taskIndex) => (
                <section className="imported-result" key={text(task.id) || taskIndex}>
                  <h4>{text(task.title)}</h4>
                  <p className="imported-text">{text(task.instructions)}</p>
                  <Fields
                    data={task}
                    keys={[
                      'id',
                      'kind',
                      'minutes',
                      'speedWpm',
                      'minimumPasses',
                      'maximumPasses',
                      'objectiveCount',
                      'settings',
                      'alternative',
                      'optional',
                      'resourceId',
                    ]}
                  />
                  <SourceLink value={task.sourceUrl} />
                </section>
              ))}
            </details>
          ))}
        </details>
        <details className="imported-item">
          <summary>Original resources ({records(course.resources).length})</summary>
          {records(course.resources).map((resource, index) => (
            <Resource key={text(resource.id) || index} resource={resource} />
          ))}
          {Object.keys(record(snapshot.dailyListening)).length > 0 && (
            <Resource resource={record(snapshot.dailyListening)} />
          )}
        </details>
      </details>
      <DeviceArchive original={original} />
    </div>
  );
}

export function ImportedHistory() {
  const [archive, setArchive] = useState<{ data: unknown; cutoff: RecordData } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const exported = await api<TrainingExport>('/export');
      setArchive({
        data: exported.legacy?.data,
        cutoff: record(record(exported.legacy).importedBefore),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load imported history.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="card imported-history" aria-labelledby="imported-history-heading">
      <div className="section-heading">
        <div>
          <h2 id="imported-history-heading">Imported history</h2>
          <p>
            Read your original advisor reports, LCWO results, instructor materials, and course
            context.
          </p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!archive ? (
        <button className="button outline" onClick={load} disabled={loading}>
          {loading ? 'Loading imported history…' : 'View imported history'}
        </button>
      ) : archive.data === undefined ? (
        <p>No historical source archive is saved in this account.</p>
      ) : (
        <Archive data={archive.data} cutoff={archive.cutoff} />
      )}
    </section>
  );
}
