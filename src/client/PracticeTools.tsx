import { ArrowRight, BookOpen, Headphones, Radio, Signal } from 'lucide-react';
import type { PracticeLaunch } from './practice-launch';
import { practiceTools } from './practice-tools';
import './practice-tools.css';

const icons = {
  words: Headphones,
  qso: Radio,
  stories: BookOpen,
  copy: Signal,
  sending: Radio,
  free: Headphones,
  runner: Signal,
};

export default function PracticeTools({
  onPractice,
  disabled,
}: {
  onPractice: (tool: NonNullable<PracticeLaunch['tool']>) => void;
  disabled: boolean;
}) {
  return (
    <section aria-labelledby="practice-tools-title">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> AT YOUR OWN PACE
          </div>
          <h1 id="practice-tools-title">Practice tools</h1>
          <p>Choose a tool for extra practice. All tools work without an account.</p>
        </div>
      </div>
      <div className="practice-tools-grid">
        {practiceTools.map(({ tool, label, description }) => {
          const Icon = icons[tool];
          return (
            <button
              className="practice-tool-card"
              key={tool}
              aria-label={label}
              disabled={disabled}
              onClick={() => onPractice(tool)}
            >
              <Icon size={24} strokeWidth={1.7} aria-hidden="true" />
              <h2>{label}</h2>
              <p>{description}</p>
              <span className="practice-tool-action">
                Open tool <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
