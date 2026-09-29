import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { checkQsoCopy, QSO_COPY_STATIONS, type QsoCopyField, type QsoCopyResult } from './qso-copy';
import './qso-copy.css';

const EXTRA_FIELDS = new Set(['rig', 'power', 'antenna', 'weather', 'temperature']);
const STATUS_LABELS = {
  correct: 'Correct',
  incorrect: 'Try again',
  unanswered: 'Not answered',
};

/** A contact-local draft; callers remount only when the generated QSO changes. */
export default function QsoCopy({
  fields,
  revealed,
  onReveal,
  onCheck,
  onReplay,
}: {
  fields: QsoCopyField[];
  revealed: boolean;
  onReveal: (revealed: boolean) => void;
  onCheck: () => void;
  onReplay: () => void;
}) {
  const id = useId();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QsoCopyResult | null>(null);
  const [needsRecheck, setNeedsRecheck] = useState(false);
  const hasExtras = fields.some((field) => EXTRA_FIELDS.has(field.kind));
  const stationFields = (extras: boolean) => (
    <div className="qso-copy-stations">
      {QSO_COPY_STATIONS.map((station, stationIndex) => (
        <fieldset key={station.id}>
          <legend>
            Station {stationIndex + 1} · {station.id === 'caller' ? 'called CQ' : 'answered'}
          </legend>
          {fields
            .filter(
              (field) => field.station === station.id && EXTRA_FIELDS.has(field.kind) === extras,
            )
            .map((field) => {
              const checked = result?.fields.find((item) => item.id === field.id);
              const inputId = `${id}-${field.id}`;
              const label =
                field.kind === 'qth' ? 'QTH' : field.kind === 'rst' ? 'RST sent' : field.label;
              return (
                <div className="qso-copy-field" key={field.id}>
                  <label htmlFor={inputId}>{label}</label>
                  <input
                    id={inputId}
                    type="text"
                    value={answers[field.id] ?? ''}
                    maxLength={200}
                    aria-label={`Station ${stationIndex + 1} ${field.kind === 'qth' || field.kind === 'rst' ? label : label.toLowerCase()}`}
                    aria-invalid={checked?.status === 'incorrect' || undefined}
                    aria-describedby={checked || revealed ? `${inputId}-feedback` : undefined}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(event) => {
                      setAnswers((previous) => ({ ...previous, [field.id]: event.target.value }));
                      if (result) {
                        setResult(null);
                        setNeedsRecheck(true);
                      }
                    }}
                  />
                  {(checked || revealed) && (
                    <div className="qso-copy-feedback" id={`${inputId}-feedback`}>
                      {checked && (
                        <span className={`qso-copy-status is-${checked.status}`}>
                          {STATUS_LABELS[checked.status]}
                        </span>
                      )}
                      {revealed && (
                        <span className="qso-copy-expected">
                          Sent: <strong>{field.expected}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </fieldset>
      ))}
    </div>
  );
  return (
    <form
      className="qso-copy-form"
      onSubmit={(event) => {
        event.preventDefault();
        onCheck();
        setResult(checkQsoCopy(fields, answers));
        setNeedsRecheck(false);
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="qso-copy-heading">
        <div>
          <h3>What did you copy?</h3>
          <p>Fill in what you heard. Leave anything you missed blank, then replay and try again.</p>
        </div>
        <button className="text-button" type="button" onClick={onReplay}>
          <RotateCcw size={14} aria-hidden="true" /> Replay QSO
        </button>
      </div>
      <p className="qso-copy-instructions">
        Follow each station’s details, not the callsign it addresses. QTH means city and state; RST
        is the report that station sends to the other operator. Your copy stays here only while this
        contact is open.
      </p>
      {stationFields(false)}
      {hasExtras && (
        <details className="qso-copy-extras">
          <summary>Rig and weather details</summary>
          {stationFields(true)}
        </details>
      )}
      <div className="qso-copy-actions">
        <button className="button dark" type="submit">
          Check answers
        </button>
        <button className="text-button" type="button" onClick={() => onReveal(!revealed)}>
          {revealed ? 'Hide answers' : 'Show answers'}
        </button>
        <p>Checking won’t reveal the answers. Show them when you’re ready.</p>
      </div>
      <div className="qso-copy-result" role="status" aria-live="polite" aria-atomic="true">
        {result ? (
          <>
            <strong>
              {result.answered
                ? `${result.correct} of ${result.answered} filled answers match.`
                : 'No answers entered yet.'}
            </strong>{' '}
            {result.total - result.answered} unanswered.
            {result.answered > result.correct && ' Replay the contact and try those details again.'}
          </>
        ) : needsRecheck ? (
          'Your copy changed. Check answers again when you’re ready.'
        ) : null}
      </div>
    </form>
  );
}
