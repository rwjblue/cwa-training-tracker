import type { MorseTrack } from './audio';

/** The same timeline drives audio, word highlighting, and keyboard-accessible seeking. */
export default function MorseTranscript({
  track,
  activeWord,
  onSeek,
  itemIndex,
}: {
  track: MorseTrack;
  activeWord: number;
  onSeek: (index: number) => void;
  itemIndex?: number;
}) {
  const selectedWord = track.words[activeWord];
  const isActive = (index: number) =>
    activeWord === index ||
    (track.words[index].repeatIndex === 0 &&
      selectedWord?.itemIndex === track.words[index].itemIndex &&
      selectedWord?.indexInItem === track.words[index].indexInItem);
  return (
    <p className="trainer-morse-text morse-transcript" aria-live="off">
      {track.words.map(
        (word, index) =>
          (itemIndex === undefined || word.itemIndex === itemIndex) &&
          (word.repeatIndex === undefined || word.repeatIndex === 0) && (
            <span key={index}>
              {itemIndex === undefined &&
                index > 0 &&
                word.itemIndex !== track.words[index - 1].itemIndex && (
                  <>
                    <br />
                    <br />
                  </>
                )}
              <button
                type="button"
                aria-label={`Seek to word ${index + 1}: ${word.text}`}
                aria-current={isActive(index) ? 'true' : undefined}
                className={isActive(index) ? 'is-playing-word' : ''}
                onClick={() => onSeek(index)}
              >
                {word.text}
              </button>{' '}
            </span>
          ),
      )}
    </p>
  );
}
