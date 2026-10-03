import { useState, type ReactNode, type ComponentProps } from 'react';
import { PracticeEvidenceDetails } from './PracticeEvidenceDetails';
import { savedCopyAttempt, copyAttemptReportDetails } from '../shared/copy-report';
import { manualPracticeDetails } from '../shared/external-practice';
import type { ReportDocument, ReportReference } from '../shared/report-document';
import { sameReportValue } from '../shared/report-document';
import { reportPracticeSnapshot } from '../shared/report-evidence';
import { lcwoRunDetails, type LcwoData } from '../shared/lcwo';
import type { PracticeSession } from '../shared/training';

/** Expand facts only on demand: large private histories should not render repeatedly while typing. */
function LazyDetails({ children, ...props }: ComponentProps<'details'>) {
  const [open, setOpen] = useState(false);
  const content = children as ReactNode[];
  return (
    <details {...props} onToggle={(event) => setOpen(event.currentTarget.open)}>
      {content[0]}
      {open && content.slice(1)}
    </details>
  );
}
function SourceFacts({
  report,
  index,
  entries,
  lcwo,
}: {
  report: ReportDocument;
  index: number;
  entries: Map<string, PracticeSession>;
  lcwo: Map<string, NonNullable<LcwoData['runs']>[number]>;
}) {
  const reference = report.evidence[index];
  const snapshot = report.provenance?.sources.find((source) => source.reference === index);
  const entry = reference.kind === 'practice' ? entries.get(reference.id) : undefined;
  const run = reference.kind === 'lcwo' ? lcwo.get(reference.id) : undefined;
  const current = entry ? reportPracticeSnapshot(entry, report.window.timezone) : undefined;
  const { reference: _index, ...prior } = snapshot ?? { reference: index };
  const changed = snapshot && current && !sameReportValue(prior, current);
  return (
    <>
      <p>
        <strong>Source:</strong> {snapshot?.label ?? `${reference.kind} result ${reference.id}`}
      </p>
      {snapshot ? (
        <>
          <p>
            <strong>Captured practice day:</strong> {snapshot.date} ({report.window.timezone})
          </p>
          <ul>
            {snapshot.facts.map((fact, index) => (
              <li key={index}>{fact}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Embedded details were not captured in this copy. Its source ID remains retained.</p>
      )}
      {changed && (
        <p role="status">
          This saved result changed after the suggestion was captured. The report keeps its original
          suggestion facts; refresh a working draft explicitly to use current evidence.
        </p>
      )}
      <LazyDetails>
        <summary>Current account result {reference.id}</summary>
        <p>
          These facts come from the currently saved result in this account. They do not replace this
          report snapshot.
        </p>
        {current || run ? (
          <ul>
            {(current?.facts ?? (run ? lcwoRunDetails(run) : [])).map((fact, index) => (
              <li key={index}>{fact}</li>
            ))}
          </ul>
        ) : (
          <p>
            The current source is unavailable here. The captured report facts and private backup
            remain unchanged.
          </p>
        )}
        {entry && (
          <>
            <PracticeEvidenceDetails entry={entry} expanded />
            <ul>
              {[
                ...manualPracticeDetails(entry.metadata),
                ...(savedCopyAttempt(entry)
                  ? copyAttemptReportDetails(savedCopyAttempt(entry)!)
                  : []),
              ].map((fact, index) => (
                <li key={index}>{fact}</li>
              ))}
            </ul>
          </>
        )}
      </LazyDetails>
    </>
  );
}

/** Presentation only: the document owns captured suggestions, edits and references. */
export default function AdvisorReportEvidence({
  report,
  entries,
  lcwo,
}: {
  report: ReportDocument;
  entries: PracticeSession[];
  lcwo?: LcwoData | null;
}) {
  const provenance = report.provenance;
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const runMap = new Map((lcwo?.runs ?? []).map((run) => [run.id, run]));
  function source(index: number) {
    const reference: ReportReference | undefined = report.evidence[index];
    return (
      reference && (
        <LazyDetails className="advisor-evidence-source" key={`${reference.kind}:${reference.id}`}>
          <summary>View saved result {reference.id}</summary>
          <SourceFacts report={report} index={index} entries={entryMap} lcwo={runMap} />
        </LazyDetails>
      )
    );
  }
  return (
    <LazyDetails className="advisor-evidence" aria-label="Advisor suggestion evidence">
      <summary>Review suggestion evidence ({report.evidence.length} source references)</summary>
      <p>
        Extra review is reportable practice but grants no required-task credit. Class context,
        duplicate records, future and out-of-window results are excluded. Suggestions are captured
        facts, not independent proof of proficiency or on-air activity.
      </p>
      {provenance?.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      {!provenance && (
        <p>
          This older report has no captured suggestion details. Its answers and source references
          are preserved.
        </p>
      )}
      {provenance?.fields.map((suggestion) => {
        const field = report.definition.fields.find((field) => field.key === suggestion.key)!;
        return (
          <LazyDetails key={suggestion.key}>
            <summary>
              Evidence for {field.section} — {field.label}
            </summary>
            <p>
              <strong>Mapping:</strong> {suggestion.mapping}
            </p>
            <p>
              <strong>Captured suggestion:</strong>{' '}
              {suggestion.value || 'Unknown — no compatible measured answer'}
            </p>
            {report.editedKeys.includes(suggestion.key) && (
              <p>
                Your learner edit
                {report.answers[suggestion.key] === '' ? ' (intentional blank)' : ''} is protected;
                the captured suggestion does not replace it.
              </p>
            )}
            {suggestion.warnings.length > 0 && (
              <ul>
                {suggestion.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {suggestion.references.length ? (
              suggestion.references.map(source)
            ) : (
              <p>No compatible saved result supports an automatic answer in this window.</p>
            )}
          </LazyDetails>
        );
      })}
      <LazyDetails>
        <summary>All retained source references</summary>
        {report.evidence.length ? (
          report.evidence.map((_, index) => source(index))
        ) : (
          <p>No saved practice evidence in this window.</p>
        )}
      </LazyDetails>
    </LazyDetails>
  );
}
