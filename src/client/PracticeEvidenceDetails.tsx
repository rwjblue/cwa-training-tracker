import type { PracticeEvidence } from '../shared/practice-evidence';
import {
  practiceEvidenceDetails,
  practiceSessionEvidenceDetails,
} from '../shared/practice-evidence';
import type { PracticeSession } from '../shared/training';

export function EvidenceSummary({ evidence }: { evidence: PracticeEvidence }) {
  return (
    <div className="session-scratchpad">
      {practiceEvidenceDetails(evidence).map((detail) => (
        <p key={detail}>{detail}</p>
      ))}
    </div>
  );
}
export function PracticeEvidenceDetails({
  entry,
  expanded = false,
}: {
  entry: Partial<Pick<PracticeSession, 'metadata' | 'evidenceMode' | 'minutes'>>;
  expanded?: boolean;
}) {
  const details = practiceSessionEvidenceDetails(entry.metadata, entry.evidenceMode, entry.minutes);
  const content = (
    <div className="session-scratchpad">
      {details.map((detail) => (
        <p key={detail}>{detail}</p>
      ))}
    </div>
  );
  return !details.length ? null : expanded ? (
    content
  ) : (
    <details className="session-scratchpad">
      <summary>Practice evidence</summary>
      {content}
    </details>
  );
}
