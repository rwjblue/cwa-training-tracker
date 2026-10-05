import PreciseRange from './PreciseRange';
import { PRACTICE_STORIES, practiceStory, type StoryId } from '../shared/listening-stories';
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
import { MorsePlayer, type MorseTrack } from './audio';
import MorseTranscript from './MorseTranscript';
import ListeningSeekControls from './ListeningSeekControls';
import { buildSpokenWordTrack } from './morse-track';
import { loadWordSpeech } from './word-speech';
import QsoCopy from './QsoCopy';
import {
  nextWordRetimeItem,
  retimedOccurrencePosition,
  retimeWordTrack,
} from './listening-retiming';
import type { GeneratedListeningSummary } from '../shared/generated-listening';
import {
  listeningWordRound,
  qsoListeningTrack,
  storyListeningSummary,
  storyListeningTrack,
  wordListeningSummary,
  wordListeningTrack,
  wordListeningFrequencies,
  type ListeningWordRound,
} from './listening-configuration';
import type { PracticePreferences } from './practice-preferences';
import { MAX_CUSTOM_WORD_CHARACTERS, WORD_LISTS, type WordList } from './word-content';
import type { WordContentEditor } from './useWordContent';
import { generateQso, QSO_TEMPLATES, type PracticeQso } from './qso-content';

interface AppliedListeningTrack {
  readonly track: MorseTrack;
  readonly material: object;
  readonly resetKey: string;
  readonly configurations: readonly { at: number; summary: GeneratedListeningSummary }[];
  readonly mixed?: boolean;
  readonly summary: GeneratedListeningSummary;
  readonly title: string;
  readonly loop: boolean;
}
const EMPTY_WORDS: readonly string[] = [];
const matchesWordSource = (
  round: ListeningWordRound | null,
  preferences: PracticePreferences,
  custom: string,
) =>
  round?.listId === preferences.wordList &&
  round.shuffle === preferences.shuffleWords &&
  (round.listId !== 'custom' || round.sourceText === custom);

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
    wordContent: WordContentEditor;
    wordScopeLabel: string;
    onWordSourceChange: (text: string) => void;
    onClearSavedWords: () => void;
    active?: boolean;
    onChange: (changes: Partial<PracticePreferences>) => void;
    soundSettings?: ReactNode;
    playbackControls?: ReactNode;
    practiceWorkspace?: ReactNode;
    onPlaying: (playing: boolean) => void;
    onPlayed?: (summary: GeneratedListeningSummary) => void;
    onBeforeReplace?: () => void;
    onBeforeSeek?: () => void;
    onError: (message: string) => void;
    onRetry?: () => void;
  }
>(function ListeningTrainer(
  {
    preferences: p,
    wordContent,
    wordScopeLabel,
    onWordSourceChange,
    onClearSavedWords,
    active: visible = true,
    onChange,
    soundSettings,
    playbackControls,
    practiceWorkspace,
    onPlaying: onPlayingChange,
    onPlayed,
    onBeforeReplace,
    onBeforeSeek,
    onError: onErrorMessage,
    onRetry,
  },
  ref,
) {
  const visibleOwner = useRef(visible);
  visibleOwner.current = visible;
  const inspecting = useRef(!visible);
  const canPlay = () => visibleOwner.current && !inspecting.current;
  const callbacks = useRef({
    onPlaying: onPlayingChange,
    onPlayed,
    onBeforeReplace,
    onBeforeSeek,
    onError: onErrorMessage,
  });
  callbacks.current = {
    onPlaying: onPlayingChange,
    onPlayed,
    onBeforeReplace,
    onBeforeSeek,
    onError: onErrorMessage,
  };
  const onPlaying = (playing: boolean) => callbacks.current.onPlaying(playing);
  const onError = (message: string) => callbacks.current.onError(message);
  const custom = wordContent.draft;
  const [qso, setQso] = useState(() => generateQso(p.qsoScenario));
  const [copyMode, setCopyMode] = useState(false);
  const [revealedQso, setRevealedQso] = useState<PracticeQso | null>(null);
  const [wordRound, setWordRound] = useState<ListeningWordRound | null>(null);
  const words = wordRound?.words ?? EMPTY_WORDS;
  const [roundError, setRoundError] = useState('');
  const [continuationError, setContinuationError] = useState('');
  const retryRound = useRef(false);
  const pendingRound = useRef<{ round: ListeningWordRound; automatic: boolean } | null>(null);
  const preferencesOwner = useRef(p);
  preferencesOwner.current = p;
  const customOwner = useRef(custom);
  customOwner.current = custom;
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState(false);
  const [active, setActive] = useState(false);
  const [complete, setComplete] = useState(false);
  const player = useRef(new MorsePlayer());
  const audio = useRef<HTMLAudioElement>(null);
  const prepared = useRef<AppliedListeningTrack | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [playingTrack, setPlayingTrack] = useState<MorseTrack | null>(null);
  const [deviceVolume, setDeviceVolume] = useState(false);
  const [activeWord, setActiveWord] = useState(-1);
  const index = useRef(0);
  const [speech, setSpeech] = useState<{
    words: readonly string[];
    clips?: Map<string, Float32Array>;
    error?: string;
  } | null>(null);
  const [speechAttempt, setSpeechAttempt] = useState(0);
  const isWords = p.tool === 'words';
  const isStory = p.tool === 'stories';
  const story = practiceStory(p.storySettings.storyId);
  const narrative = isStory ? story : qso;
  const activeWordList = isWords ? p.wordList : null;
  const activeShuffle = isWords ? p.shuffleWords : null;
  const activeCustom = isWords ? custom : null;
  const spokenAnswers = isWords && p.spokenAnswers;
  const repeatList = isWords && p.repeatList;
  const wordGap = isWords ? p.wordGap : 0;
  const content = isWords ? wordRound : narrative;
  const resetKey = JSON.stringify([
    isWords,
    isStory,
    isWords && p.variableWordPitch ? null : p.tone,
    isWords && p.variableWordPitch,
    wordGap,
    spokenAnswers && repeatList,
    spokenAnswers,
  ]);
  const materialOwner = useRef(content);
  materialOwner.current = content;
  const settingsOwner = useRef(resetKey);
  settingsOwner.current = resetKey;
  const volumeOwner = useRef(p.volume / 100);
  volumeOwner.current = p.volume / 100;
  const checkingCopy = !isWords && !isStory && copyMode;
  // Object identity prevents a newly generated contact revealing old answers for one frame.
  const copyRevealed = revealedQso === qso;
  const hideTranscript = checkingCopy ? !copyRevealed : p.hideTrainerText && !answer;
  const roundList = wordRound?.listId ?? p.wordList;
  const listTitle = roundList === 'custom' ? 'Your word list' : WORD_LISTS[roundList].title;
  const stop = () => {
    pendingRound.current = null;
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
    retryRound.current = false;
    setContinuationError('');
    stop();
    prepared.current = null;
    setPlayingTrack(null);
    setMediaReady(false);
    player.current.clear();
    index.current = 0;
    setPosition(0);
    setActiveWord(-1);
    setAnswer(false);
    setComplete(false);
  };
  const resetWords = () => {
    const pending = pendingRound.current;
    // A deliberate Play already queued this exact source for the next commit.
    // A source change still cancels it through the ordinary reset below.
    if (
      !spokenAnswers &&
      pending &&
      !pending.automatic &&
      matchesWordSource(pending.round, p, custom)
    )
      return;
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
  }, [isWords, isStory, activeWordList, activeCustom, p.storySettings.storyId]);
  useEffect(() => {
    // A Morse-only installed round keeps its order; Shuffle chooses the next one.
    // Preserve the existing fresh-recording behavior for spoken answers.
    if (isWords && (spokenAnswers || !prepared.current)) resetWords();
  }, [activeShuffle, spokenAnswers]);
  useEffect(() => {
    if (qso.id === p.qsoScenario) return;
    if (p.tool === 'qso') resetTransport();
    setQso(generateQso(p.qsoScenario));
  }, [p.qsoScenario]);
  useEffect(() => {
    if (audio.current) player.current.attach(audio.current);
  }, []);
  useEffect(
    () => () => {
      pendingRound.current = null;
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
    const items = isWords ? words : narrative.lines;
    if (!items.length) return { applied: null, error: '' };
    try {
      const qsoResult = !isWords && !isStory ? qsoListeningTrack(qso, p) : null;
      const summary = isWords
        ? wordListeningSummary(wordRound!, p)
        : isStory
          ? storyListeningSummary(story, p)
          : qsoResult!.summary;
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
        track = buildSpokenWordTrack(
          words,
          speech.clips,
          { ...options, extraWordGap: wordGap },
          wordListeningFrequencies(wordRound!, p),
        );
      } else if (isWords) {
        track = wordListeningTrack(wordRound!, p).track;
      } else if (isStory) {
        track = storyListeningTrack(story, p);
      } else {
        track = qsoResult!.track;
      }
      const applied: AppliedListeningTrack = Object.freeze({
        track,
        summary,
        material: content!,
        resetKey,
        configurations: [{ at: 0, summary }],
        title: isWords ? listTitle : narrative.title,
        loop: spokenAnswers && repeatList,
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
    isWords && p.variableWordPitch ? null : p.tone,
    p.variableWordPitch,
    wordGap,
  ]);
  const { applied } = trackResult;
  const track = playingTrack ?? applied?.track ?? null;
  const available = useRef(applied);
  available.current = applied;
  const install = (
    next: AppliedListeningTrack,
    start: number,
    resume = false,
    replacement?: { acceptsPosition?: (at: number) => boolean; position: (at: number) => number },
  ) => {
    const { track, summary } = next;
    const ownsPrepared = () =>
      prepared.current === next &&
      player.current.track === track &&
      materialOwner.current === next.material &&
      settingsOwner.current === next.resetKey;
    const acceptsPlayback = () => canPlay() && ownsPrepared();
    let lastHeard: GeneratedListeningSummary | undefined;
    const heardConfiguration = (at: number) => {
      const configuration = next.configurations.findLast((item) => item.at <= at + 0.000001);
      if (configuration && configuration.summary !== lastHeard) {
        lastHeard = configuration.summary;
        callbacks.current.onPlayed?.(configuration.summary);
      }
    };
    let lastPosition = start;
    try {
      if (audio.current) audio.current.dataset.wordListening = String(summary.mode === 'words');
      const installed = player.current.prepare(
        track,
        {
          title: next.title,
          canPlay: acceptsPlayback,
          onBeforeSeek: () => callbacks.current.onBeforeSeek?.(),
          loop: next.loop,
          // An installed round may have a volume chosen in native controls.
          volume:
            player.current.track && player.current.supportsVolume && audio.current
              ? audio.current.volume
              : volumeOwner.current,
          onProgress: (progress) => {
            if (!ownsPrepared()) return;
            // A changed last item takes effect on the next deliberate native loop.
            // Explicit seeks still retain the old prefix and never trigger replacement.
            const wrapped =
              next.mixed &&
              next.loop &&
              player.current.playedToEnd &&
              lastPosition > track.duration - 0.5 &&
              progress.position < 0.5 &&
              progress.position < lastPosition &&
              progress.state === 'playing';
            lastPosition = progress.position;
            if (
              wrapped &&
              available.current?.material === next.material &&
              available.current.resetKey === next.resetKey
            ) {
              install(available.current, 0, true);
              return;
            }
            if (progress.state === 'playing' && !player.current.paused && !audio.current?.seeking)
              heardConfiguration(progress.position);
            if (progress.wordIndex >= 0) setComplete(false);
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
              heardConfiguration(player.current.position);
            }
          },
          onFinish: () => {
            if (!acceptsPlayback()) return;
            setComplete(true);
            setActiveWord(-1);
            const latest = preferencesOwner.current;
            if (latest.tool === 'words' && !latest.spokenAnswers && latest.repeatList)
              advanceWordRound(true);
          },
          onError,
        },
        {
          acceptsPosition: replacement?.acceptsPosition,
          beforeReplace: (at) => {
            callbacks.current.onBeforeReplace?.();
            prepared.current = next;
            return replacement ? replacement.position(at) : start;
          },
        },
      );
      if (installed === false) return false;
      lastPosition = installed;
      setDeviceVolume(!player.current.supportsVolume);
      setPlayingTrack(track);
      setMediaReady(true);
      player.current.seek(installed);
      if (resume && acceptsPlayback())
        void player.current.resume().catch((error: Error) => {
          if (acceptsPlayback()) onError(error.message);
        });
      return true;
    } catch (error) {
      prepared.current = null;
      setPlayingTrack(null);
      setMediaReady(false);
      throw error;
    }
  };
  const failNextRound = (error: Error) => {
    stop();
    retryRound.current = true;
    const message = `Next round could not play. ${error.message}`;
    setContinuationError(message);
    onError(message);
  };
  const advanceWordRound = (automatic = false) => {
    if (!canPlay()) return;
    const latest = preferencesOwner.current;
    if (latest.tool !== 'words' || latest.spokenAnswers) return;
    retryRound.current = false;
    setContinuationError('');
    try {
      const round = listeningWordRound(latest.wordList, customOwner.current, latest.shuffleWords);
      // The committed React round owns the rendered source before native Play.
      // Pause, inspection, source changes and disposal cancel this pending intent.
      pendingRound.current = { round, automatic };
      setWordRound(round);
      index.current = 0;
      setPosition(0);
      setAnswer(false);
    } catch (error) {
      failNextRound(error as Error);
    }
  };
  const prepare = (restartEnded = true) => {
    if (prepared.current?.material === content && prepared.current.resetKey === resetKey) {
      if (
        restartEnded &&
        prepared.current.mixed &&
        applied &&
        player.current.position >= prepared.current.track.duration
      )
        install(applied, 0);
      return;
    }
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
    install(applied, applied.track.items[index.current]?.start ?? 0);
  };
  const play = async () => {
    if (!canPlay()) return;
    if (retryRound.current) return advanceWordRound();
    if (
      isWords &&
      !spokenAnswers &&
      !prepared.current &&
      !matchesWordSource(wordRound, preferencesOwner.current, customOwner.current)
    )
      return advanceWordRound();
    pendingRound.current = null;
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
      prepare(false);
      player.current.seekWord(word);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const back = () => {
    if (!canPlay()) return;
    try {
      prepare(false);
      player.current.seekBy(-10);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const replayWord = async () => {
    if (!canPlay()) return;
    const word = player.current.selectedWordIndex;
    try {
      prepare(false);
      player.current.seekWord(Math.max(0, word));
      await player.current.resume();
    } catch (error) {
      onError((error as Error).message);
    }
  };
  useEffect(() => {
    const pending = pendingRound.current;
    if (pending?.round === content) {
      pendingRound.current = null;
      if (!canPlay()) return;
      if (!applied) {
        failNextRound(new Error(trackResult.error || 'This round could not be prepared.'));
        return;
      }
      try {
        install(applied, 0, !pending.automatic || preferencesOwner.current.repeatList);
        setComplete(false);
      } catch (error) {
        failNextRound(error as Error);
      }
      return;
    }
    const previous = prepared.current;
    if (!previous) return;
    if (!applied) {
      // An invalid slower edit cannot replace the last valid recording.
      if (previous.material !== content || previous.resetKey !== resetKey) resetTransport();
      else stop();
      return;
    }
    if (
      previous.material !== applied.material ||
      previous.resetKey !== applied.resetKey ||
      spokenAnswers
    ) {
      resetTransport();
      return;
    }
    if (
      previous.summary.characterWpm === applied.summary.characterWpm &&
      previous.summary.effectiveWpm === applied.summary.effectiveWpm
    )
      return;
    try {
      const playing = !player.current.paused;
      const at = player.current.position;
      if (isWords) {
        let first = nextWordRetimeItem(previous.track, at, playing);
        while (first <= previous.track.items.length) {
          const retimed = retimeWordTrack(previous.track, applied.track, first);
          const boundary = previous.track.items[first]?.start ?? previous.track.duration;
          const installed = install(
            {
              ...applied,
              track: retimed,
              mixed: true,
              configurations:
                first === previous.track.items.length
                  ? previous.configurations
                  : [
                      ...previous.configurations.filter((item) => item.at < boundary),
                      { at: boundary, summary: applied.summary },
                    ],
            },
            at,
            playing,
            {
              acceptsPosition: (current) =>
                first === previous.track.items.length || boundary >= current + (playing ? 0.02 : 0),
              position: (current) => current,
            },
          );
          if (installed) break;
          first++;
        }
      } else
        install(applied, at, playing && at < previous.track.duration, {
          position: (current) => retimedOccurrencePosition(previous.track, applied.track, current),
        });
    } catch (error) {
      stop();
      onError((error as Error).message);
    }
  }, [applied]);
  useEffect(() => {
    if (audio.current) setDeviceVolume(!player.current.setVolume(p.volume / 100));
  }, [p.volume]);
  useImperativeHandle(ref, () => ({ play, stop, pauseForInspection }));
  const step = (delta: number) => {
    if (!canPlay()) return;
    const requested = index.current + delta;
    try {
      prepare(false);
      const items = player.current.track?.items;
      if (!items?.length) return;
      const next = Math.min(Math.max(0, requested), items.length - 1);
      player.current.seek(items[next].start);
      index.current = next;
      setPosition(next);
      setComplete(false);
      setAnswer(false);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const total = isWords
    ? words.length ||
      (p.wordList === 'custom'
        ? custom.trim().split(/\s+/).filter(Boolean).length
        : WORD_LISTS[p.wordList].words.length)
    : narrative.lines.length;
  const current = isWords ? words[position] : narrative.lines[position];
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
        ) : isStory ? (
          <label>
            Story
            <select
              value={story.id}
              onChange={(e) =>
                onChange({
                  storySettings: { ...p.storySettings, storyId: e.target.value as StoryId },
                })
              }
            >
              {PRACTICE_STORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
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
      </div>
      {!isWords && !isStory && (
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
      <div className="listening-practice-workspace">
        <div className="listening-playback-workspace">
          {playbackControls}
          {isWords && p.spokenAnswers && words.length > 0 && !track && !trackResult.error && (
            <p role="status">Loading prerecorded answers…</p>
          )}
          {trackResult.error && <p role="alert">{trackResult.error}</p>}
          {continuationError && (
            <div role="alert">
              <p>{continuationError} Earned listening time is retained.</p>
              <button
                className="button outline"
                onClick={() => {
                  onRetry?.();
                  advanceWordRound();
                }}
              >
                Retry next round
              </button>
            </div>
          )}
          {mediaReady && <ListeningSeekControls onBack={back} onReplay={() => void replayWord()} />}
          <div className="native-morse-player" hidden={!mediaReady}>
            <audio ref={audio} controls preload="metadata" aria-label="Practice audio" />
          </div>
        </div>
        {practiceWorkspace}
        <div className="listening-transcript-workspace">
          <div className="transmission-panel trainer-transmission">
            <div className="transmission-label">
              <span>
                {complete
                  ? 'ROUND COMPLETE'
                  : `${isWords ? 'WORD' : isStory ? 'SENTENCE' : 'TRANSMISSION'} ${Math.min(position + 1, total)} OF ${total}`}
                {active ? ' · LISTENING' : ''}
              </span>
              {!checkingCopy && (
                <button onClick={() => onChange({ hideTrainerText: !p.hideTrainerText })}>
                  {p.hideTrainerText ? 'Reveal text' : 'Hide text'}
                </button>
              )}
            </div>
            {!isWords && !isStory && !hideTranscript && applied?.summary.mode === 'qso' && (
              <p className="field-hint" aria-label="Current QSO station">
                {applied.summary.stations[position % 2]} · {applied.summary.tonesHz[position % 2]}{' '}
                Hz
              </p>
            )}
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
              <span>{isWords ? listTitle : narrative.title}</span>
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
                else if (isStory) resetTransport();
                else {
                  resetTransport();
                  setQso(generateQso(p.qsoScenario, Math.random, qso.stations));
                }
              }}
            >
              <Shuffle size={14} />{' '}
              {isWords ? 'New round' : isStory ? 'Reset story to beginning' : 'New QSO'}
            </button>
            <span className="field-hint">
              {complete
                ? 'Round complete. Play to listen again.'
                : checkingCopy && !copyRevealed
                  ? 'Replay as often as you need. Your copy stays here.'
                  : 'Words and Previous/Next move your place while keeping playback playing or paused.'}
            </span>
          </div>
        </div>
      </div>
      {!isWords && !isStory && (
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
      {!isWords && !isStory && (
        <p className="field-hint">
          {!checkingCopy && qso.season
            ? `A fictional ${qso.season} contact.`
            : 'Fictional station details.'}{' '}
          Callsigns may coincide with real operators.
        </p>
      )}
      {!isWords && !isStory && applied?.summary.mode === 'qso' && (
        <p className="field-hint" aria-label="QSO station tones">
          {hideTranscript ? 'Station 1' : applied.summary.stations[0]}: {applied.summary.tonesHz[0]}{' '}
          Hz
          {' · '}
          {hideTranscript ? 'Station 2' : applied.summary.stations[1]}: {applied.summary.tonesHz[1]}{' '}
          Hz. Station 1 uses your preferred pitch. Station 2 is 50 Hz{' '}
          {applied.summary.tonesHz[1] > applied.summary.tonesHz[0]
            ? 'higher.'
            : 'lower to stay within the 1000 Hz limit.'}
        </p>
      )}
      {isWords && (
        <details
          className="word-source-editor studio-disclosure"
          open={
            p.wordList === 'custom' || !wordContent.remembered || Boolean(wordContent.error)
              ? true
              : undefined
          }
        >
          <summary>Word list editor</summary>
          {p.wordList !== 'custom' ? (
            <button
              type="button"
              className="button outline"
              onClick={() =>
                onWordSourceChange(
                  WORD_LISTS[p.wordList as keyof typeof WORD_LISTS].words.join(' '),
                )
              }
            >
              Edit this list
            </button>
          ) : (
            <label className="field">
              Your word list
              <textarea
                rows={3}
                maxLength={MAX_CUSTOM_WORD_CHARACTERS}
                value={custom}
                onChange={(e) => onWordSourceChange(e.target.value)}
                placeholder="Add words separated by spaces…"
              />
              <span className="field-hint">
                Up to 200 words, 40 characters per word and 8,200 characters total. Spaces, tabs and
                new lines separate entries; repeated words and prosigns are kept.
              </span>
            </label>
          )}
          <p className="field-hint" role="status">
            {wordContent.remembered
              ? `Valid words and list selection are saved for ${wordScopeLabel} on this device.`
              : `Words are active for this visit; saving for ${wordScopeLabel} needs attention.`}{' '}
            Custom text stays private on this device. Empty or invalid drafts do not replace saved
            words.
          </p>
          {wordContent.error && (
            <p className="alert error" role="alert">
              {wordContent.error}
            </p>
          )}
          <div className="device-actions">
            {custom !== wordContent.saved.customText && wordContent.saved.customText && (
              <button
                type="button"
                className="button outline"
                onClick={() => onWordSourceChange(wordContent.saved.customText)}
              >
                Use saved words
              </button>
            )}
            {!wordContent.remembered && (
              <button type="button" className="button outline" onClick={wordContent.retry}>
                Retry saving words
              </button>
            )}
            <button type="button" className="button outline" onClick={onClearSavedWords}>
              Clear saved words
            </button>
          </div>
        </details>
      )}
      {isWords && (
        <details className="studio-disclosure word-practice-options">
          <summary>Word options · pause, repeat and spoken answers</summary>
          <div className="word-options">
            <PreciseRange
              label="Extra word pause"
              value={p.wordGap}
              min={0}
              max={5}
              step={0.1}
              unit="seconds"
              onChange={(wordGap) => onChange({ wordGap })}
              hint="Additional silence between words, from 0 to 5 seconds."
            />
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
        </details>
      )}
      {isWords && p.spokenAnswers && (
        <p className="field-hint">
          Each word plays three times, followed by a prerecorded answer. The whole round uses the
          native audio player, including repeats and pauses, for background listening. Custom lists
          can use words from either built-in list.
        </p>
      )}
      {soundSettings}
      <details className="studio-disclosure">
        <summary>How playback and changes work</summary>
        <p>
          {isWords
            ? 'Hear each word as a whole sound. Replay the current word or move at your own pace.'
            : isStory
              ? 'Supplemental public stories, written for listening practice. Hear the meaning one sentence at a time; all sentences use one narrator tone.'
              : 'Choose a scenario, then generate as many contacts as you like. New QSO changes both stations; Play replays this contact.'}
        </p>

        <p className="field-hint">
          {isWords && !spokenAnswers
            ? 'Change speed while listening: the current word and pause finish at their original timing; later words use the new speed.'
            : !isWords
              ? 'Change speed to restart the same word occurrence. Playing stays playing; paused stays paused.'
              : 'Speed changes in spoken-answer mode start a fresh recording.'}{' '}
          {isStory
            ? 'Story or narrator tone changes prepare a fresh paused recording.'
            : 'List, pitch, spacing and spoken-answer changes start a fresh round.'}
          {isWords &&
            !spokenAnswers &&
            ' Shuffle applies to the next round; Repeat lets this round finish before continuing or stopping.'}
        </p>
        {deviceVolume && (
          <p className="field-hint">
            This browser uses device volume controls during native playback. The app volume is
            applied when preparing the next recording.
          </p>
        )}
      </details>
      {(!checkingCopy || copyRevealed) && (
        <details className="trainer-catalog">
          <summary>
            {isWords ? 'View word list' : isStory ? 'View full story' : 'View full conversation'}
          </summary>
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
