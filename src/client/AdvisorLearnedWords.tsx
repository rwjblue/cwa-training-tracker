import { useMemo, useState } from 'react';
import type { PracticeSession } from '../shared/training';
import type { ReportDocument } from '../shared/report-document';
import { reportablePractice, reportPracticeDate } from '../shared/report-evidence';
import {
  confirmedLearnedWordHistory,
  learnedWordCandidates,
  reportWordValues,
} from '../shared/report-learned-words';

/** Current owned candidates are selectable; the draft owns edits and frozen refresh evidence. */
export default function AdvisorLearnedWords({
  report,
  reports,
  entries,
  onEdit,
}: {
  report: ReportDocument;
  reports: ReportDocument[];
  entries: PracticeSession[];
  onEdit: (key: string, value: string) => void;
}) {
  const fields = report.definition.fields.filter((field) => field.source === 'learned:words');
  const configured = fields.length > 0;
  const [candidateCount, setCandidateCount] = useState(100);
  const [historyCount, setHistoryCount] = useState(100);
  const { candidates, history } = useMemo(
    () =>
      !configured
        ? { candidates: [], history: [] }
        : {
            candidates: learnedWordCandidates(
              reportablePractice(report, entries),
              reports,
              (entry) => reportPracticeDate(entry, report.window.timezone),
            ),
            history: confirmedLearnedWordHistory(reports),
          },
    [entries, reports, report.window, report.provenance, configured],
  );
  if (!fields.length) return null;
  return (
    <details className="advisor-learned-words" aria-label="Learned word sources and history">
      <summary>Review learned-word candidates ({candidates.length})</summary>
      <p>
        These are current saved declarations in this inclusive window, in {report.window.timezone}.
        Refresh from saved practice to update the captured suggestion; your edits and deliberate
        blanks remain protected. A saved scratchpad line such as <code>Learned: Rig, QTH</code>{' '}
        explicitly declares learning. Other prose and heard/generated words do not.
      </p>
      <p>
        Eligible words are suggested once. Only the words in the exact confirmed native submission
        exclude future suggestions. You can deliberately include an excluded word again or type your
        own declaration in the answer field.
      </p>
      {candidates.length ? (
        <ul>
          {candidates.slice(0, candidateCount).map((candidate) => (
            <li key={candidate.word.toLowerCase()}>
              <strong>{candidate.word}</strong>
              <p>
                Saved sources:{' '}
                {candidate.sources.map((source) => `${source.id} (${source.date})`).join('; ')}.
              </p>
              <p>
                {candidate.reportedIn.length
                  ? `Already confirmed in submission ${candidate.reportedIn[0].reportId} at ${candidate.reportedIn[0].submittedAt}; excluded from automatic suggestions.`
                  : 'Eligible: explicitly declared, with no prior confirmed native submission.'}
              </p>
              {fields.map((field) => {
                const raw = report.answers[field.key] ?? '';
                const current = reportWordValues(raw);
                const included = current.some(
                  (word) => word.toLowerCase() === candidate.word.toLowerCase(),
                );
                const next = raw.trim() ? `${raw}, ${candidate.word}` : candidate.word;
                return (
                  <div key={field.key}>
                    <button
                      className="button outline small"
                      disabled={included || next.length > 4000}
                      onClick={() => onEdit(field.key, next)}
                    >
                      Include {candidate.word} in {field.label}
                    </button>
                    {included ? (
                      <span> Already in this answer.</span>
                    ) : next.length > 4000 ? (
                      <span>
                        {' '}
                        Would exceed the 4,000-character answer limit; edit the field deliberately.
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No explicit Learned: declarations in this saved report window. You may declare a learned
          word in the editable answer; no source practice is inferred.
        </p>
      )}
      {candidates.length > candidateCount && (
        <>
          <p>
            Showing {candidateCount} of {candidates.length} candidates. All eligible declarations
            contribute to the bounded suggestion.
          </p>
          <button
            className="button outline small"
            onClick={() => setCandidateCount(candidateCount + 100)}
          >
            Show {Math.min(100, candidates.length - candidateCount)} more candidates
          </button>
        </>
      )}
      <details>
        <summary>Confirmed learned-word history ({history.length})</summary>
        <p>
          This history uses configured learned-word fields in exact native confirmations. Drafts,
          prepared handoffs and imported reference-only reports confer no exclusion authority.
        </p>
        {history.length ? (
          <ul>
            {history.slice(0, historyCount).map((item, index) => (
              <li key={`${item.reportId}:${index}`}>
                {item.word} · submission {item.reportId} · {item.submittedAt}
              </li>
            ))}
          </ul>
        ) : (
          <p>No confirmed native learned-word declarations.</p>
        )}
        {history.length > historyCount && (
          <>
            <p>
              Showing {historyCount} of {history.length} confirmed declarations. Exact complete
              answers remain in private report JSON/backups.
            </p>
            <button
              className="button outline small"
              onClick={() => setHistoryCount(historyCount + 100)}
            >
              Show {Math.min(100, history.length - historyCount)} more confirmed declarations
            </button>
          </>
        )}
      </details>
    </details>
  );
}
