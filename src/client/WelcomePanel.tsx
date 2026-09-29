import { ArrowRight, BookOpen, Headphones, Radio, ShieldCheck, Signal } from 'lucide-react';
import './welcome-panel.css';

interface WelcomePanelProps {
  onPractice: (tool?: 'words' | 'qso' | 'free') => void;
  onSignIn: () => void;
  onGuide: () => void;
}

export default function WelcomePanel({ onPractice, onSignIn, onGuide }: WelcomePanelProps) {
  return (
    <div className="welcome-panel">
      <section className="welcome-intro" aria-labelledby="welcome-title">
        <span className="eyebrow">CW ACADEMY COMPANION</span>
        <h1 id="welcome-title">
          Practice Morse.
          <br />
          Keep your progress.
        </h1>
        <p>Word drills, QSO practice, and a daily training log for CW Academy students.</p>
        <div className="welcome-actions">
          <button className="button cream" onClick={() => onPractice()}>
            <Headphones size={17} /> Try practice <ArrowRight size={16} />
          </button>
          <button className="button welcome-sign-in" onClick={onSignIn}>
            Start private log
          </button>
        </div>
        <span className="welcome-access-note">All practice tools work without an account.</span>
      </section>

      <section className="welcome-tools" aria-labelledby="welcome-tools-title">
        <div className="welcome-section-heading">
          <h2 id="welcome-tools-title">Choose your practice</h2>
          <span>No sign-in needed</span>
        </div>
        <div className="welcome-tool-grid">
          <button className="welcome-tool" onClick={() => onPractice('words')}>
            <span className="welcome-tool-icon">
              <Signal size={23} />
            </span>
            <h3>Word trainer</h3>
            <p>Build recognition with common QSO words, one word at a time.</p>
            <span className="welcome-tool-action">
              Train words <ArrowRight size={15} />
            </span>
          </button>
          <button className="welcome-tool" onClick={() => onPractice('qso')}>
            <span className="welcome-tool-icon welcome-tool-orange">
              <Radio size={23} />
            </span>
            <h3>QSO practice</h3>
            <p>Hear generated contacts and get comfortable with the flow of a conversation.</p>
            <span className="welcome-tool-action">
              Practice a QSO <ArrowRight size={15} />
            </span>
          </button>
          <button className="welcome-tool" onClick={() => onPractice('free')}>
            <span className="welcome-tool-icon welcome-tool-blue">
              <Headphones size={23} />
            </span>
            <h3>Free practice</h3>
            <p>Listen to words, character groups, callsigns, or your own text at your pace.</p>
            <span className="welcome-tool-action">
              Open listening room <ArrowRight size={15} />
            </span>
          </button>
        </div>
      </section>

      <section className="welcome-private" aria-labelledby="welcome-private-title">
        <span className="welcome-private-icon">
          <ShieldCheck size={23} />
        </span>
        <div>
          <h2 id="welcome-private-title">Your homework and progress, together.</h2>
          <p>
            Sign in to plan today’s exercises, save practice time, and follow your daily goal. Your
            training log stays private.
          </p>
        </div>
        <button className="text-button" onClick={onSignIn}>
          Start private log <ArrowRight size={15} />
        </button>
      </section>

      <div className="welcome-guide">
        <button className="text-button" onClick={onGuide}>
          <BookOpen size={16} /> Explore the Academy guide <ArrowRight size={14} />
        </button>
        <p>
          An independent companion, not an official CWops service. Follow your advisor and the{' '}
          <a
            href="https://cwops.org/cw-academy/cw-academy-student-resources/"
            target="_blank"
            rel="noreferrer"
          >
            official curriculum
          </a>
          .
        </p>
      </div>
    </div>
  );
}
