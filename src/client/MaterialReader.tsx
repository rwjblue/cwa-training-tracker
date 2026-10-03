import { useLayoutEffect, useRef, useState } from 'react';
import { MATERIAL_USAGES, type InstructorMaterial } from '../shared/instructor-material';
import { materialReadingToken, readMaterialReading, saveMaterialReading } from './material-reading';
export function MaterialVersion({ material }: { material: InstructorMaterial }) {
  return (
    <p className="field-hint">
      Session {material.session} · {material.course.level} · course starts{' '}
      {material.course.firstClassDate}
      <br />
      Version {material.id} · created {material.createdAt}
      {material.supersedesId && <> · revises {material.supersedesId}</>}
      {material.origin && (
        <>
          <br />
          Original material {material.origin.id}
          {material.origin.supersedesId && (
            <> · original revision of {material.origin.supersedesId}</>
          )}
        </>
      )}
    </p>
  );
}
export default function MaterialReader({
  material,
  scope,
}: {
  material: InstructorMaterial;
  scope: string;
}) {
  const initial = useRef(readMaterialReading(scope)[material.id] ?? { size: 26, scroll: 0 });
  const [size, setSize] = useState(initial.current.size);
  const [remembered, setRemembered] = useState(true);
  const panel = useRef<HTMLDivElement>(null);
  const token = useRef(materialReadingToken(scope));
  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = initial.current.scroll;
  }, []);
  function remember(nextSize = size) {
    setRemembered(
      saveMaterialReading(
        scope,
        material.id,
        { size: nextSize, scroll: panel.current?.scrollTop ?? 0 },
        token.current,
      ),
    );
  }
  return (
    <section aria-label={`Reader: ${material.title}`} className="material-reader">
      <h3>{material.title}</h3>
      <MaterialVersion material={material} />
      <p>{MATERIAL_USAGES[material.usage]}</p>
      {material.url && (
        <p>
          <a href={material.url} target="_blank" rel="noreferrer">
            Open material link
          </a>
        </p>
      )}
      <label className="field">
        Reader text size: {size}px
        <input
          type="range"
          min="18"
          max="48"
          step="1"
          value={size}
          onChange={(event) => {
            const next = Number(event.target.value);
            setSize(next);
            remember(next);
          }}
        />
      </label>
      <div
        ref={panel}
        className="material-text"
        tabIndex={0}
        role="region"
        aria-label="Material text"
        style={{ fontSize: size }}
        onScroll={() => remember()}
      >
        {material.text || 'This material contains a link only.'}
      </div>
      {!remembered && (
        <p className="alert error" role="alert">
          Reading preferences could not be saved on this device. Your current position remains here.{' '}
          <button type="button" className="text-button" onClick={() => remember()}>
            Retry reading preferences
          </button>
        </p>
      )}
    </section>
  );
}
