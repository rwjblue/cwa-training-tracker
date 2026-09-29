import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { buildMorseTrack, MorsePlayer, morseTimeline, type MorseTrack } from './audio';
import MorseTranscript from './MorseTranscript';
import QsoCopy from './QsoCopy';
import type { PracticePreferences } from './practice-preferences';
import { WORD_LISTS, wordPracticeRound, type WordList } from './word-content';
import { generateQso, QSO_TEMPLATES, type PracticeQso } from './qso-content';

export interface ListeningTrainerHandle {
  play: () => Promise<void>;
  stop: () => void;
}

/** One native media track keeps words, seeking, and background playback in sync. */
export default forwardRef<
  ListeningTrainerHandle,
  {
    preferences: PracticePreferences;
    onChange: (changes: Partial<PracticePreferences>) => void;
    onPlaying: (playing: boolean) => void;
    onError: (message: string) => void;
  }
>(function ListeningTrainer(
  { preferences: p, onChange, onPlaying: onPlayingChange, onError: onErrorMessage },
  ref,
) {
  const callbacks = useRef({ onPlaying: onPlayingChange, onError: onErrorMessage });
  callbacks.current = { onPlaying: onPlayingChange, onError: onErrorMessage };
  const onPlaying = (playing: boolean) => callbacks.current.onPlaying(playing);
  const onError = (message: string) => callbacks.current.onError(message);
  const [custom, setCustom] = useState('');
  const [qso, setQso] = useState(() => generateQso(p.qsoScenario));
  const [copyMode, setCopyMode] = useState(false);
  const [revealedQso, setRevealedQso] = useState<PracticeQso | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [roundError, setRoundError] = useState('');
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState(false);
  const [active, setActive] = useState(false);
  const [complete, setComplete] = useState(false);
  const player = useRef(new MorsePlayer());
  const audio = useRef<HTMLAudioElement>(null);
  const prepared = useRef<MorseTrack | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [activeWord, setActiveWord] = useState(-1);
  const generation = useRef(0);
  const waiting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const index = useRef(0);
  const round = useRef<string[]>([]);
  const speaking = useRef(false);
  const isWords = p.tool === 'words';
  const checkingCopy = !isWords && copyMode;
  // Object identity prevents a newly generated contact revealing old answers for one frame.
  const copyRevealed = revealedQso === qso;
  const hideTranscript = checkingCopy ? !copyRevealed : p.hideTrainerText && !answer;
  const listTitle = p.wordList === 'custom' ? 'Your word list' : WORD_LISTS[p.wordList].title;
  const stop = () => {
    generation.current++;
    clearTimeout(waiting.current);
    player.current.pause();
    if (speaking.current) {
      window.speechSynthesis?.cancel();
      speaking.current = false;
    }
    setActive(false);
    onPlaying(false);
  };
  const reset = () => {
    stop();
    prepared.current = null;
    setMediaReady(false);
    player.current.clear();
    try {
      round.current = isWords ? wordPracticeRound(p.wordList, custom, p.shuffleWords) : [];
      setRoundError('');
    } catch (error) {
      // An empty or partially typed custom list is an ordinary editing state.
      round.current = [];
      setRoundError((error as Error).message);
    }
    index.current = 0;
    setPosition(0);
    setWords(round.current);
    setActiveWord(-1);
    setAnswer(false);
    setComplete(false);
  };
  useEffect(() => {
    reset();
    if (!isWords) setQso(generateQso(p.qsoScenario));
  }, [p.tool, p.wordList, p.qsoScenario, p.shuffleWords, custom]);
  useEffect(() => {
    if (audio.current) player.current.attach(audio.current);
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(waiting.current);
      player.current.dispose();
      if (speaking.current) window.speechSynthesis?.cancel();
    },
    [],
  );

  const playSpoken = async () => {
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
      player.current.prepare(
        buildMorseTrack([{ text: word }], {
          characterWpm: p.characterWpm,
          effectiveWpm: p.effectiveWpm,
          frequency: pitch,
          volume: p.volume / 100,
        }),
        {
          title: listTitle,
          onFinish: finish,
          // Native/lock-screen pause must cancel the foreground speech sequence too.
          onState: (state) => {
            if (state === 'paused' && valid()) stop();
          },
          onError: (message) => fail(new Error(message)),
        },
      );
      await player.current.resume();
    };
    try {
      await send();
    } catch (error) {
      fail(error);
      throw error;
    }
  };
  const trackResult = useMemo(() => {
    const items = isWords ? words : qso.lines;
    if (!items.length) return { track: null, error: '' };
    try {
      const track = buildMorseTrack(
        items.map((text, i) => ({
          text,
          frequency: !isWords && i % 2 ? Math.min(1000, p.tone + 50) : p.tone,
          gapAfter: isWords
            ? morseTimeline(text, p.characterWpm, p.effectiveWpm).wordGap + p.wordGap
            : 2,
        })),
        {
          characterWpm: p.characterWpm,
          effectiveWpm: p.effectiveWpm,
          frequency: p.tone,
          volume: p.volume / 100,
        },
      );
      return { track, error: '' };
    } catch (error) {
      return { track: null, error: (error as Error).message };
    }
  }, [words, qso, isWords, p.characterWpm, p.effectiveWpm, p.tone, p.volume, p.wordGap]);
  const { track } = trackResult;
  const prepare = () => {
    if (!track) throw new Error(roundError || trackResult.error || 'Add some words to play.');
    if (prepared.current === track) return;
    // Preparing reports position zero synchronously; preserve the requested item first.
    const start = track.items[index.current]?.start ?? 0;
    player.current.prepare(track, {
      title: isWords ? listTitle : qso.title,
      loop: isWords && p.repeatList,
      onProgress: (progress) => {
        setActiveWord(progress.wordIndex);
        if (progress.itemIndex >= 0) {
          index.current = progress.itemIndex;
          setPosition(progress.itemIndex);
        }
      },
      onState: (state) => {
        const playing = state === 'playing';
        setActive(playing);
        onPlaying(playing);
        if (playing) setComplete(false);
      },
      onFinish: () => {
        setComplete(true);
        setActiveWord(-1);
      },
      onError,
    });
    prepared.current = track;
    setMediaReady(true);
    player.current.seek(start);
  };
  const play = async () => {
    if (isWords && p.spokenAnswers) {
      prepared.current = null;
      setMediaReady(false);
      return playSpoken();
    }
    prepare();
    setAnswer(false);
    await player.current.resume();
  };
  const replayQso = async () => {
    try {
      stop();
      prepare();
      player.current.seek(0);
      index.current = 0;
      setPosition(0);
      setComplete(false);
      await player.current.resume();
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const seekWord = (word: number) => {
    if (isWords && p.spokenAnswers) {
      stop();
      index.current = track?.words[word]?.itemIndex ?? 0;
      setPosition(index.current);
      void playSpoken().catch((error: Error) => onError(error.message));
      return;
    }
    try {
      prepare();
      player.current.seekWord(word);
      void player.current.resume().catch((error: Error) => onError(error.message));
    } catch (error) {
      onError((error as Error).message);
    }
  };
  // Never leave a native source with settings/text different from the visible transcript.
  useEffect(() => {
    stop();
    prepared.current = null;
    setMediaReady(false);
    player.current.clear();
    setActiveWord(-1);
    setAnswer(false);
    setComplete(false);
  }, [track, p.repeatList, p.spokenAnswers]);
  useEffect(() => {
    if (!(isWords && p.spokenAnswers)) return;
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [isWords, p.spokenAnswers]);
  useImperativeHandle(ref, () => ({ play, stop }));
  const step = (delta: number) => {
    stop();
    const length = isWords ? round.current.length : qso.lines.length;
    index.current = Math.min(Math.max(0, index.current + delta), Math.max(0, length - 1));
    setPosition(index.current);
    setComplete(false);
    setAnswer(false);
    if (prepared.current === track && track)
      player.current.seek(track.items[index.current]?.start ?? 0);
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
            : 'Choose a scenario, then generate as many contacts as you like. New QSO changes both stations; Play replays this contact.'}
        </p>
      </div>
      {!isWords && (
        <div className="qso-practice-mode" role="group" aria-label="QSO practice mode">
          <button type="button" aria-pressed={!copyMode} onClick={() => setCopyMode(false)}>
            Listen
          </button>
          <button
            type="button"
            aria-pressed={copyMode}
            onClick={() => {
              if (!copyMode) setRevealedQso(null);
              setCopyMode(true);
            }}
          >
            Check your copy
          </button>
        </div>
      )}
      {!isWords && (
        <p className="field-hint">
          {!checkingCopy && qso.season
            ? `A fictional ${qso.season} contact.`
            : 'Fictional station details.'}{' '}
          Callsigns may coincide with real operators.
        </p>
      )}
      {isWords && p.wordList === 'custom' && (
        <label className="field">
          Your word list
          <textarea
            rows={3}
            maxLength={8200}
            value={custom}
            onChange={(e) => {
              stop();
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
          before the answer. Keep this page open for spoken answers; Morse-only rounds use the
          native audio player for background listening.
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
          {!checkingCopy && (
            <button onClick={() => onChange({ hideTrainerText: !p.hideTrainerText })}>
              {p.hideTrainerText ? 'Reveal text' : 'Hide text'}
            </button>
          )}
        </div>
        <div className="trainer-current" aria-live="off">
          {hideTranscript ? (
            <p>
              {checkingCopy
                ? 'Listen, then fill in the station details below. Answers stay hidden until you choose Show answers.'
                : 'Listen first. Reveal when you’re ready.'}
            </p>
          ) : track && !(isWords && p.spokenAnswers) ? (
            <MorseTranscript
              track={track}
              activeWord={activeWord}
              onSeek={seekWord}
              itemIndex={position}
            />
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
            : checkingCopy && !copyRevealed
              ? 'Replay as often as you need. Your copy stays here.'
              : 'Pause keeps your place. Select any word to listen from there.'}
        </span>
      </div>
      <div className="native-morse-player" hidden={!mediaReady || (isWords && p.spokenAnswers)}>
        <audio
          ref={audio}
          controls
          hidden={isWords && p.spokenAnswers}
          preload="metadata"
          aria-label="Practice audio"
        />
      </div>
      {!isWords && (
        <section
          className="qso-copy-region"
          aria-label="Check your QSO copy"
          hidden={!checkingCopy}
        >
          <QsoCopy
            key={qso.lines.join('\n')}
            fields={qso.copyFields}
            revealed={copyRevealed}
            onReveal={(reveal) => setRevealedQso(reveal ? qso : null)}
            onCheck={stop}
            onReplay={() => void replayQso()}
          />
        </section>
      )}
      {(!checkingCopy || copyRevealed) && (
        <details className="trainer-catalog">
          <summary>{isWords ? 'View word list' : 'View full conversation'}</summary>
          {track ? (
            <MorseTranscript track={track} activeWord={activeWord} onSeek={seekWord} />
          ) : (
            <p>{roundError || trackResult.error || 'Add words to begin.'}</p>
          )}
        </details>
      )}
    </div>
  );
});
