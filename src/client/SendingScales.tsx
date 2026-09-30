import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { SendingSection } from '../shared/plan';
import { BOB_CARTER_SCALES_PDF_URL, sendingScalesForSections } from './sending-scales';
import './sending-scales.css';

/** Keep the material beside the clock; changing a section never restarts practice. */
export default function SendingScales({ sections }: { sections?: SendingSection[] }) {
  const scales = sendingScalesForSections(sections);
  const [selected, setSelected] = useState(scales[0]?.id);
  const [textSize, setTextSize] = useState('standard');
  const current = scales.find((scale) => scale.id === selected) ?? scales[0];

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
