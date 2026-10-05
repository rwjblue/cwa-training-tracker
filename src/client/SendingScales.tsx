import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { SendingSection } from '../shared/plan';
import { BOB_CARTER_SCALES_PDF_URL, sendingScalesForSections } from './sending-scales';
import { sendingSectionFromRoute, sendingSectionRoute } from './tool-share';
import './sending-scales.css';

/** Keep the material beside the clock; changing a section never restarts practice. */
export default function SendingScales({
  sections,
  active = true,
  publicRoute,
  onPublicRouteChange,
}: {
  sections?: SendingSection[];
  active?: boolean;
  publicRoute?: string;
  onPublicRouteChange?: (hash: string) => void;
}) {
  const scales = sendingScalesForSections(sections);
  const [selected, setSelected] = useState(() => {
    const shared = sendingSectionFromRoute(publicRoute);
    return scales.find((scale) => scale.id === shared)?.id ?? scales[0]?.id;
  });
  const [textSize, setTextSize] = useState('standard');
  const current = scales.find((scale) => scale.id === selected) ?? scales[0];
  useEffect(() => {
    if (active && current) onPublicRouteChange?.(sendingSectionRoute(current.id));
  }, [current?.id, onPublicRouteChange, active]);

  return (
    <div className="sending-scales">
      <div className="sending-source">
        <div>
          <strong>Everyday sending scales</strong>
          <p>
            Practice patterns based on Bob Carter WR7Q’s scales. His original PDF includes the
            complete instructions and reference material.
          </p>
        </div>
        <a
          className="button outline"
          href={BOB_CARTER_SCALES_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Bob Carter WR7Q’s scales PDF <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="sending-controls">
        <div className="sending-sections" role="group" aria-label="Sending sections">
          {scales.map((scale) => (
            <button
              key={scale.id}
              aria-pressed={current?.id === scale.id}
              onClick={() => setSelected(scale.id)}
            >
              {scale.title}
            </button>
          ))}
        </div>
        <label>
          Practice text size
          <select value={textSize} onChange={(event) => setTextSize(event.target.value)}>
            <option value="standard">Standard</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>
      {current && (
        <section className={`sending-reading is-${textSize}`} aria-label="Sending practice text">
          <div className="sending-reading-heading">
            <h3>{current.title}</h3>
            <p>{current.guidance}</p>
            {current.id !== 'exercise' && (
              <p className="sending-notation">
                <strong>Prosigns:</strong> Angle brackets mean send the letters as one joined
                signal, without the usual pause between letters. For example, {'<AR>'} joins A and
                R. Keep the short gaps between dots and dashes, and leave normal character spacing
                between repeated signs.
              </p>
            )}
          </div>
          <div className="sending-rows">
            {current.rows.map((row) => (
              <div className={`sending-row is-${row.kind}`} key={row.id}>
                {row.groups.map((group, index) => (
                  <div className="sending-group" key={index}>
                    <span>{group.text}</span>
                    {group.annotation && <small>{group.annotation}</small>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
