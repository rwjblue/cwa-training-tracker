import {
  type ReactNode,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { buildMorseTrack, MorsePlayer, morseTimeline, type MorseTrack } from './audio';
import MorseTranscript from './MorseTranscript';
import { buildSpokenWordTrack } from './morse-track';
import { loadWordSpeech } from './word-speech';
import QsoCopy from './QsoCopy';
import type { PracticePreferences } from './practice-preferences';
import { WORD_LISTS, wordPracticeRound, type WordList } from './word-content';
import { generateQso, QSO_TEMPLATES, type PracticeQso } from './qso-content';

export interface ListeningTrainerHandle {
  play: () => Promise<void>;
  stop: () => void;
  pauseForInspection: () => void;
}

/** One native media track keeps words, seeking, and background playback in sync. */
export default forwardRef<
  ListeningTrainerHandle,
  {
    preferences: PracticePreferences;
    active?: boolean;
    onChange: (changes: Partial<PracticePreferences>) => void;
    soundSettings?: ReactNode;
    onPlaying: (playing: boolean) => void;
    onError: (message: string) => void;
  }
>(function ListeningTrainer(
  {
    preferences: p,
    active: visible = true,
    onChange,
    soundSettings,
    onPlaying: onPlayingChange,
    onError: onErrorMessage,
  },
  ref,
) {
  const visibleOwner = useRef(visible);
  visibleOwner.current = visible;
  const inspecting = useRef(!visible);
  const canPlay = () => visibleOwner.current && !inspecting.current;
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
  const index = useRef(0);
  const round = useRef<string[]>([]);
  const [speech, setSpeech] = useState<{
    words: string[];
    clips?: Map<string, Float32Array>;
    error?: string;
  } | null>(null);
  const [speechAttempt, setSpeechAttempt] = useState(0);
  const isWords = p.tool === 'words';
  const checkingCopy = !isWords && copyMode;
  // Object identity prevents a newly generated contact revealing old answers for one frame.
  const copyRevealed = revealedQso === qso;
  const hideTranscript = checkingCopy ? !copyRevealed : p.hideTrainerText && !answer;
  const listTitle = p.wordList === 'custom' ? 'Your word list' : WORD_LISTS[p.wordList].title;
  const stop = () => {
    player.current.pause();
    setActive(false);
    onPlaying(false);
  };
  const pauseForInspection = () => {
    inspecting.current = true;
    stop();
  };
  useEffect(() => {
    if (visible) inspecting.current = false;
    else if (!inspecting.current) pauseForInspection();
  }, [visible]);
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
  useEffect(() => () => player.current.dispose(), []);
  useEffect(() => {
    if (!isWords || !p.spokenAnswers || !words.length) {
      setSpeech(null);
      return;
    }
    let cancelled = false;
    setSpeech(null);
    void loadWordSpeech(words).then(
      (clips) => {
        if (!cancelled) setSpeech({ words, clips });
      },
      (error: Error) => {
        if (!cancelled) setSpeech({ words, error: error.message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [words, isWords, p.spokenAnswers, speechAttempt]);

  const trackResult = useMemo(() => {
    const items = isWords ? words : qso.lines;
    if (!items.length) return { track: null, error: '' };
    try {
      if (isWords && p.spokenAnswers) {
        if (speech?.words !== words || !speech.clips)
          return { track: null, error: speech?.words === words ? (speech.error ?? '') : '' };
        return {
          track: buildSpokenWordTrack(words, speech.clips, {
            characterWpm: p.characterWpm,
            effectiveWpm: p.effectiveWpm,
            frequency: p.tone,
            volume: p.volume / 100,
            extraWordGap: p.wordGap,
          }),
          error: '',
        };
      }
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
  }, [
    words,
    qso,
    isWords,
    speech,
    p.spokenAnswers,
    p.characterWpm,
    p.effectiveWpm,
    p.tone,
    p.volume,
    p.wordGap,
  ]);
  const { track } = trackResult;
  const prepare = () => {
    if (!track) {
      if (isWords && p.spokenAnswers && words.length) {
        if (speech?.error) setSpeechAttempt((attempt) => attempt + 1);
        throw new Error(
          trackResult.error ||
            'Spoken answers are loading. Press Play when the recording is ready.',
        );
      }
      throw new Error(roundError || trackResult.error || 'Add some words to play.');
    }
    if (prepared.current === track) return;
    // Preparing reports position zero synchronously; preserve the requested item first.
    const start = track.items[index.current]?.start ?? 0;
    player.current.prepare(track, {
      title: isWords ? listTitle : qso.title,
      canPlay,
      loop: isWords && p.repeatList,
      onProgress: (progress) => {
        setActiveWord(progress.wordIndex);
        const answerStart = track.words[progress.wordIndex]?.answerStart;
        setAnswer(answerStart !== undefined && progress.position >= answerStart);
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
        if (!canPlay()) return;
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
    if (!canPlay()) return;
    prepare();
    setAnswer(false);
    await player.current.resume();
  };
  const replayQso = async () => {
    if (!canPlay()) return;
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
    if (!canPlay()) return;
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
  }, [
    track,
    p.characterWpm,
    p.effectiveWpm,
    p.tone,
    p.volume,
    p.wordGap,
    p.repeatList,
    p.spokenAnswers,
  ]);
  useImperativeHandle(ref, () => ({ play, stop, pauseForInspection }));
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
              onChange={(e) => onChange({ spokenAnswers: e.target.checked })}
            />{' '}
            Three repeats + spoken answer
          </label>
        </div>
      )}
      {isWords && p.spokenAnswers && (
        <p className="field-hint">
          Each word plays three times, followed by a prerecorded answer. The whole round uses the
          native audio player, including repeats and pauses, for background listening. Custom lists
          can use words from either built-in list.
        </p>
      )}
      {isWords && p.spokenAnswers && words.length > 0 && !track && !trackResult.error && (
        <p role="status">Loading prerecorded answers…</p>
      )}
      {trackResult.error && <p role="alert">{trackResult.error}</p>}
      {soundSettings}
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
          ) : track ? (
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
      <div className="native-morse-player" hidden={!mediaReady}>
        <audio ref={audio} controls preload="metadata" aria-label="Practice audio" />
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
