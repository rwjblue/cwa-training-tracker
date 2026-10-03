import {
  materialInCurrentCourse,
  type InstructorMaterial,
  type OriginalMaterialInventory,
} from '../shared/instructor-material';
import { courseMeetings, type PracticeSession, type Profile } from '../shared/training';
export default function MaterialPreparation({
  profile,
  today,
  materials,
  original,
  entries,
  onOpen,
}: {
  profile: Profile;
  today: string;
  materials: InstructorMaterial[];
  original?: OriginalMaterialInventory;
  entries: PracticeSession[];
  onOpen: () => void;
}) {
  const next = courseMeetings(profile).find((meeting) => meeting.date >= today);
  const parents = new Set(materials.map((material) => material.supersedesId));
  const done = new Set(
    entries
      .filter(
        (entry) =>
          entry.context !== 'class' &&
          entry.date <= today &&
          entry.metadata?.materialCompleted === true,
      )
      .map((entry) => entry.metadata?.instructorMaterial?.id),
  );
  const preparation = next
    ? materials.filter(
        (material) =>
          materialInCurrentCourse(material, profile) &&
          material.session === next.lesson &&
          material.usage === 'preparation' &&
          !parents.has(material.id) &&
          !done.has(material.id),
      )
    : [];
  const associated = new Set(
    materials
      .filter((material) => material.origin?.archiveId === original?.archiveId)
      .map((material) => material.origin?.id),
  );
  const unassociated =
    original?.materials.filter((source) => !associated.has(String(source.id))).length ?? 0;
  if (!preparation.length && !unassociated) return null;
  return (
    <section className="card material-library" aria-label="Instructor preparation">
      <h3>Prepare for your next class{next ? ` · Session ${next.lesson}` : ''}</h3>
      {preparation.map((material) => (
        <p key={material.id}>{material.title}</p>
      ))}
      {unassociated > 0 && (
        <p>
          Imported instructor materials are available. Associate their course/session in your
          material library.
        </p>
      )}
      <button className="button outline" onClick={onOpen}>
        Open instructor materials
      </button>
    </section>
  );
}
