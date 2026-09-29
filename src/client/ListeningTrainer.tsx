import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { MorsePlayer, morseTimeline } from './audio';
import type { PracticePreferences } from './practice-preferences';
import { WORD_LISTS, wordPracticeRound, type WordList } from './word-content';
import { generateQso, QSO_TEMPLATES } from './qso-content';

export interface ListeningTrainerHandle {
  play: () => Promise<void>;
  stop: () => void;
}

/** One word or transmission at a time, with a bounded audio schedule and resumable position. */
export default forwardRef<
  ListeningTrainerHandle,
  {
    preferences: PracticePreferences;
    onChange: (changes: Partial<PracticePreferences>) => void;
    onPlaying: (playing: boolean) => void;
    onError: (message: string) => void;
  }
>(function ListeningTrainer({ preferences: p, onChange, onPlaying, onError }, ref) {
  const [custom, setCustom] = useState('');
  const [qso, setQso] = useState(() => generateQso(p.qsoScenario));
  const [words, setWords] = useState<string[]>([]);
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState(false);
  const [active, setActive] = useState(false);
  const [complete, setComplete] = useState(false);
  const player = useRef(new MorsePlayer());
  const generation = useRef(0);
  const waiting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const index = useRef(0);
  const round = useRef<string[]>([]);
  const speaking = useRef(false);
  const isWords = p.tool === 'words';
  const listTitle = p.wordList === 'custom' ? 'Your word list' : WORD_LISTS[p.wordList].title;
  const stop = () => {
    generation.current++;
    clearTimeout(waiting.current);
    player.current.stop();
    if (speaking.current) {
      window.speechSynthesis?.cancel();
      speaking.current = false;
    }
    setActive(false);
    onPlaying(false);
  };
  const reset = () => {
    stop();
    round.current = [];
    index.current = 0;
    setPosition(0);
    setWords([]);
    setAnswer(false);
    setComplete(false);
  };
  useEffect(() => {
    reset();
    if (!isWords) setQso(generateQso(p.qsoScenario));
  }, [p.tool, p.wordList, p.qsoScenario, p.shuffleWords, custom]);
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(waiting.current);
      player.current.dispose();
      if (speaking.current) window.speechSynthesis?.cancel();
    },
    [],
  );

  const play = async () => {
    stop();
    const token = generation.current;
    const valid = () => generation.current === token;
    if (!round.current.length) {
      round.current = isWords ? wordPracticeRound(p.wordList, custom, p.shuffleWords) : qso.lines;
      if (isWords) setWords(round.current);
    }
    if (index.current >= round.current.length) index.current = 0;
    setComplete(false);
    setActive(true);
    onPlaying(true);
    const fail = (error: unknown) => {
      if (!valid()) return;
      stop();
      onError(
        error instanceof Error ? error.message : 'Audio was interrupted. Press Play to retry.',
      );
    };
    const later = (fn: () => void, seconds: number) => {
      if (valid())
        waiting.current = setTimeout(() => {
          if (valid()) fn();
        }, seconds * 1000);
    };
    const send = async (repeat = 0): Promise<void> => {
      if (!valid()) return;
      const word = round.current[index.current];
      setPosition(index.current);
      setAnswer(false);
      const gap = isWords
        ? morseTimeline(word, p.characterWpm, p.effectiveWpm).wordGap + p.wordGap
        : 2;
      const advance = () => {
        if (!valid()) return;
        index.current++;
        if (index.current >= round.current.length) {
          if (isWords && p.repeatList) {
            round.current = wordPracticeRound(p.wordList, custom, p.shuffleWords);
            setWords(round.current);
            index.current = 0;
          } else {
            setComplete(true);
            setActive(false);
            onPlaying(false);
            return;
          }
        }
        void send().catch(fail);
      };
      const finish = () => {
        if (!valid()) return;
        if (isWords && p.spokenAnswers && repeat < 2) {
          later(() => {
            void send(repeat + 1).catch(fail);
          }, gap);
          return;
        }
        if (isWords && p.spokenAnswers) {
          setAnswer(true);
          const voice = window.speechSynthesis
            ?.getVoices()
            .find((voice) => voice.localService && /^en(?:-|_|$)/i.test(voice.lang));
          if (!voice) {
            fail(
              new Error(
                'No local English voice is available. Turn spoken answers off to continue in Morse.',
              ),
            );
            return;
          }
          const utterance = new SpeechSynthesisUtterance(word);
          utterance.voice = voice;
          utterance.lang = 'en-US';
          utterance.volume = p.volume / 100;
          utterance.onend = () => {
            if (!valid()) return;
            speaking.current = false;
            later(advance, gap);
          };
          utterance.onerror = () => {
            if (!valid()) return;
            speaking.current = false;
            fail(new Error('Spoken answers are unavailable. Turn them off to continue in Morse.'));
          };
          later(
            () => {
              speaking.current = true;
              window.speechSynthesis.speak(utterance);
            },
            morseTimeline(word, p.characterWpm, p.effectiveWpm).wordGap,
          );
        } else later(advance, gap);
      };
      // Alternating station pitches help distinguish turns while keeping your preferred sidetone.
      const pitch = !isWords && index.current % 2 ? Math.min(1000, p.tone + 50) : p.tone;
      await player.current.play(
        word,
        p.characterWpm,
        p.effectiveWpm,
        pitch,
        p.volume / 100,
        finish,
      );
    };
    try {
      await send();
    } catch (error) {
      fail(error);
      throw error;
    }
  };
  useImperativeHandle(ref, () => ({ play, stop }));
  const step = (delta: number) => {
    stop();
    const length = isWords ? round.current.length : qso.lines.length;
    index.current = Math.min(Math.max(0, index.current + delta), Math.max(0, length - 1));
    setPosition(index.current);
    setComplete(false);
    setAnswer(false);
  };
  const total = isWords
    ? words.length ||
      (p.wordList === 'custom'
        ? custom.trim().split(/\s+/).filter(Boolean).length
        : WORD_LISTS[p.wordList].words.length)
    : qso.lines.length;
  const current = isWords ? words[position] : qso.lines[position];
  return (
    <div className="listening-trainer">
      <div className="practice-generator-controls">
        {isWords ? (
          <label>
            Word list
            <select
              value={p.wordList}
              onChange={(e) => onChange({ wordList: e.target.value as WordList })}
            >
              {Object.entries(WORD_LISTS).map(([id, list]) => (
                <option key={id} value={id}>
                  {list.title} · {list.words.length} words
                </option>
              ))}
              <option value="custom">Your own words</option>
            </select>
          </label>
        ) : (
          <label>
            QSO scenario
            <select
              value={p.qsoScenario}
              onChange={(e) => onChange({ qsoScenario: e.target.value })}
            >
              {QSO_TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <p>
          {isWords
            ? 'Hear each word as a whole sound. Replay the current word or move at your own pace.'
            : 'Generated two-station contacts. Details are fictional; callsigns may coincide with real operators.'}
        </p>
      </div>
      {isWords && p.wordList === 'custom' && (
        <label className="field">
          Your word list
          <textarea
            rows={3}
            maxLength={8200}
            value={custom}
            onChange={(e) => {
              reset();
              setCustom(e.target.value);
            }}
            placeholder="Add words separated by spaces…"
          />
          <span className="field-hint">
            Up to 200 words. Custom text is kept only while this studio is open.
          </span>
        </label>
      )}
      {isWords && (
        <div className="word-options">
          <label>
            Extra word pause
            <select
              value={p.wordGap}
              onChange={(e) => onChange({ wordGap: Number(e.target.value) })}
            >
              {[0, 0.5, 1, 2, 3, 4, 5].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} {seconds === 1 ? 'second' : 'seconds'}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.shuffleWords}
              onChange={(e) => onChange({ shuffleWords: e.target.checked })}
            />{' '}
            Shuffle list
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.repeatList}
              onChange={(e) => onChange({ repeatList: e.target.checked })}
            />{' '}
            Repeat list
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.spokenAnswers}
              disabled={typeof window.speechSynthesis === 'undefined'}
              onChange={(e) => onChange({ spokenAnswers: e.target.checked })}
            />{' '}
            Three repeats + spoken answer
          </label>
        </div>
      )}
      {isWords && p.spokenAnswers && (
        <p className="field-hint">
          Uses a local English voice on your device when available. Each word plays three times
          before the answer.
        </p>
      )}
      <div className="transmission-panel trainer-transmission">
        <div className="transmission-label">
          <span>
            {complete
              ? 'ROUND COMPLETE'
              : `${isWords ? 'WORD' : 'TRANSMISSION'} ${Math.min(position + 1, total)} OF ${total}`}
            {active ? ' · LISTENING' : ''}
          </span>
          <button onClick={() => onChange({ hideTrainerText: !p.hideTrainerText })}>
            {p.hideTrainerText ? 'Reveal text' : 'Hide text'}
          </button>
        </div>
        <div className="trainer-current" aria-live="off">
          {p.hideTrainerText && !answer ? (
            <p>Listen first. Reveal when you’re ready.</p>
          ) : (
            <p className="trainer-morse-text">{current ?? 'Press Play to begin.'}</p>
          )}
        </div>
        <div className="trainer-step-controls">
          <button className="text-button" disabled={position === 0} onClick={() => step(-1)}>
            <ChevronLeft size={15} /> Previous
          </button>
          <span>{isWords ? listTitle : qso.title}</span>
          <button
            className="text-button"
            disabled={position >= total - 1 || (isWords && !words.length)}
            onClick={() => step(1)}
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="trainer-round-actions">
        <button
          className="text-button"
          onClick={() => {
            reset();
            if (!isWords) setQso(generateQso(p.qsoScenario, Math.random, qso.stations));
          }}
        >
          <Shuffle size={14} /> {isWords ? 'New round' : 'New QSO'}
        </button>
        <span className="field-hint">
          {complete
            ? 'Round complete. Play to listen again.'
            : 'Stop and Play replays the current item.'}
        </span>
      </div>
      <details className="trainer-catalog">
        <summary>{isWords ? 'View word list' : 'View full conversation'}</summary>
        <p className="trainer-morse-text" tabIndex={0}>
          {isWords
            ? p.wordList === 'custom'
              ? custom
              : WORD_LISTS[p.wordList].words.join(' ')
            : qso.lines.join('\n\n')}
        </p>
      </details>
    </div>
  );
});
