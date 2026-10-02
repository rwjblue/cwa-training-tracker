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
import type { GeneratedListeningSummary } from '../shared/generated-listening';
import {
  listeningWordRound,
  qsoListeningSummary,
  wordListeningSummary,
  type ListeningWordRound,
} from './listening-configuration';
import type { PracticePreferences } from './practice-preferences';
import { WORD_LISTS, type WordList } from './word-content';
import { generateQso, QSO_TEMPLATES, type PracticeQso } from './qso-content';

interface AppliedListeningTrack {
  readonly track: MorseTrack;
  readonly summary: GeneratedListeningSummary;
  readonly title: string;
  readonly loop: boolean;
}
const EMPTY_WORDS: readonly string[] = [];

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
    onPlayed?: (summary: GeneratedListeningSummary) => void;
    onError: (message: string) => void;
  }
>(function ListeningTrainer(
  {
    preferences: p,
    active: visible = true,
    onChange,
    soundSettings,
    onPlaying: onPlayingChange,
    onPlayed,
    onError: onErrorMessage,
  },
  ref,
) {
  const visibleOwner = useRef(visible);
  visibleOwner.current = visible;
  const inspecting = useRef(!visible);
  const canPlay = () => visibleOwner.current && !inspecting.current;
  const callbacks = useRef({ onPlaying: onPlayingChange, onPlayed, onError: onErrorMessage });
  callbacks.current = { onPlaying: onPlayingChange, onPlayed, onError: onErrorMessage };
  const onPlaying = (playing: boolean) => callbacks.current.onPlaying(playing);
  const onError = (message: string) => callbacks.current.onError(message);
  const [custom, setCustom] = useState('');
  const [qso, setQso] = useState(() => generateQso(p.qsoScenario));
  const [copyMode, setCopyMode] = useState(false);
  const [revealedQso, setRevealedQso] = useState<PracticeQso | null>(null);
  const [wordRound, setWordRound] = useState<ListeningWordRound | null>(null);
  const words = wordRound?.words ?? EMPTY_WORDS;
  const [roundError, setRoundError] = useState('');
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState(false);
  const [active, setActive] = useState(false);
  const [complete, setComplete] = useState(false);
  const player = useRef(new MorsePlayer());
  const audio = useRef<HTMLAudioElement>(null);
  const prepared = useRef<AppliedListeningTrack | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [activeWord, setActiveWord] = useState(-1);
  const index = useRef(0);
  const [speech, setSpeech] = useState<{
    words: readonly string[];
    clips?: Map<string, Float32Array>;
    error?: string;
  } | null>(null);
  const [speechAttempt, setSpeechAttempt] = useState(0);
  const isWords = p.tool === 'words';
  const activeWordList = isWords ? p.wordList : null;
  const activeShuffle = isWords ? p.shuffleWords : null;
  const activeCustom = isWords ? custom : null;
  const spokenAnswers = isWords && p.spokenAnswers;
  const repeatList = isWords && p.repeatList;
  const wordGap = isWords ? p.wordGap : 0;
  const content = isWords ? wordRound : qso;
  const checkingCopy = !isWords && copyMode;
  // Object identity prevents a newly generated contact revealing old answers for one frame.
  const copyRevealed = revealedQso === qso;
  const hideTranscript = checkingCopy ? !copyRevealed : p.hideTrainerText && !answer;
  const roundList = wordRound?.listId ?? p.wordList;
  const listTitle = roundList === 'custom' ? 'Your word list' : WORD_LISTS[roundList].title;
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
  const resetTransport = () => {
    stop();
    prepared.current = null;
    setMediaReady(false);
    player.current.clear();
    index.current = 0;
    setPosition(0);
    setActiveWord(-1);
    setAnswer(false);
    setComplete(false);
  };
  const resetWords = () => {
    resetTransport();
    try {
      setWordRound(listeningWordRound(p.wordList, custom, p.shuffleWords));
      setRoundError('');
    } catch (error) {
      // An empty or partially typed custom list is an ordinary editing state.
      setWordRound(null);
      setRoundError((error as Error).message);
    }
  };
  useEffect(() => {
    if (isWords) resetWords();
    else resetTransport();
  }, [isWords, activeWordList, activeShuffle, activeCustom]);
  useEffect(() => {
    if (qso.id === p.qsoScenario) return;
    if (!isWords) resetTransport();
    setQso(generateQso(p.qsoScenario));
  }, [p.qsoScenario]);
  useEffect(() => {
    if (audio.current) player.current.attach(audio.current);
  }, []);
  useEffect(
    () => () => {
      prepared.current = null;
      player.current.dispose();
    },
    [],
  );
  useEffect(() => {
    if (!spokenAnswers || !words.length) {
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
  }, [words, spokenAnswers, speechAttempt]);

  const trackResult = useMemo(() => {
    const items = isWords ? words : qso.lines;
    if (!items.length) return { applied: null, error: '' };
    try {
      const summary = isWords ? wordListeningSummary(wordRound!, p) : qsoListeningSummary(qso, p);
      const options = {
        characterWpm: summary.characterWpm,
        effectiveWpm: summary.effectiveWpm,
        frequency: p.tone,
        volume: p.volume / 100,
      };
      let track: MorseTrack;
      if (spokenAnswers) {
        if (speech?.words !== words || !speech.clips)
          return { applied: null, error: speech?.words === words ? (speech.error ?? '') : '' };
        track = buildSpokenWordTrack(words, speech.clips, {
          ...options,
          extraWordGap: wordGap,
        });
      } else {
        track = buildMorseTrack(
          items.map((text, i) => ({
            text,
            frequency: !isWords && i % 2 ? Math.min(1000, p.tone + 50) : p.tone,
            gapAfter: isWords
              ? morseTimeline(text, options.characterWpm, options.effectiveWpm).wordGap + wordGap
              : 2,
          })),
          options,
        );
      }
      const applied: AppliedListeningTrack = Object.freeze({
        track,
        summary,
        title: isWords ? listTitle : qso.title,
        loop: repeatList,
      });
      return { applied, error: '' };
    } catch (error) {
      return { applied: null, error: (error as Error).message };
    }
  }, [
    content,
    isWords,
    speech,
    spokenAnswers,
    repeatList,
    p.characterWpm,
    p.effectiveWpm,
    p.tone,
    p.volume,
    wordGap,
  ]);
  const { applied } = trackResult;
  const track = applied?.track ?? null;
  const available = useRef(applied);
  available.current = applied;
  const prepare = () => {
    if (!applied) {
      if (spokenAnswers && words.length) {
        if (speech?.error) setSpeechAttempt((attempt) => attempt + 1);
        throw new Error(
          trackResult.error ||
            'Spoken answers are loading. Press Play when the recording is ready.',
        );
      }
      throw new Error(roundError || trackResult.error || 'Add some words to play.');
    }
    if (prepared.current === applied) return;
    const { track, summary } = applied;
    const ownsPrepared = () =>
      prepared.current === applied &&
      available.current === applied &&
      player.current.track === track;
    const acceptsPlayback = () => canPlay() && ownsPrepared();
    // Preparing reports position zero synchronously; preserve the requested item first.
    const start = track.items[index.current]?.start ?? 0;
    prepared.current = applied;
    try {
      // Capture the applied source before native playing, never selected controls.
      if (audio.current) audio.current.dataset.wordListening = String(summary.mode === 'words');
      player.current.prepare(track, {
        title: applied.title,
        canPlay: acceptsPlayback,
        loop: applied.loop,
        onProgress: (progress) => {
          if (!ownsPrepared()) return;
          setActiveWord(progress.wordIndex);
          const answerStart = track.words[progress.wordIndex]?.answerStart;
          setAnswer(answerStart !== undefined && progress.position >= answerStart);
          if (progress.itemIndex >= 0) {
            index.current = progress.itemIndex;
            setPosition(progress.itemIndex);
          }
        },
        onState: (state) => {
          if (!ownsPrepared()) return;
          const playing = state === 'playing';
          if (playing && !canPlay()) return;
          setActive(playing);
          onPlaying(playing);
          if (playing) {
            setComplete(false);
            callbacks.current.onPlayed?.(summary);
          }
        },
        onFinish: () => {
          if (!acceptsPlayback()) return;
          setComplete(true);
          setActiveWord(-1);
        },
        onError,
      });
    } catch (error) {
      prepared.current = null;
      setMediaReady(false);
      throw error;
    }
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
    applied,
    p.characterWpm,
    p.effectiveWpm,
    p.tone,
    p.volume,
    wordGap,
    repeatList,
    spokenAnswers,
  ]);
  useImperativeHandle(ref, () => ({ play, stop, pauseForInspection }));
  const step = (delta: number) => {
    stop();
    const length = isWords ? words.length : qso.lines.length;
    index.current = Math.min(Math.max(0, index.current + delta), Math.max(0, length - 1));
    setPosition(index.current);
    setComplete(false);
    setAnswer(false);
    if (prepared.current === applied && track)
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
            if (isWords) resetWords();
            else {
              resetTransport();
              setQso(generateQso(p.qsoScenario, Math.random, qso.stations));
            }
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
