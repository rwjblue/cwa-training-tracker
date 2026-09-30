import type { PracticeEvidence } from '../shared/practice-evidence';
import { practiceEvidenceDetails, sessionEvidence } from '../shared/practice-evidence';
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
export function PracticeEvidenceDetails({ entry }: { entry: PracticeSession }) {
  const evidence = sessionEvidence(entry.metadata);
  return evidence ? (
    <details className="session-scratchpad">
      <summary>Practice evidence</summary>
      <EvidenceSummary evidence={evidence} />
    </details>
  ) : null;
}
