import type { MorseTrack } from './audio';

/** The same timeline drives audio, word highlighting, and keyboard-accessible seeking. */
export default function MorseTranscript({
  track, activeWord, onSeek, itemIndex,
}: {
  track: MorseTrack;
  activeWord: number;
  onSeek: (index: number) => void;
  itemIndex?: number;
}) {
  return (
    <p className="trainer-morse-text morse-transcript" aria-live="off">
      {track.words.map((word, index) => (
        (itemIndex === undefined || word.itemIndex === itemIndex) && (
          <span key={index}>
            {itemIndex === undefined && index > 0 && word.itemIndex !== track.words[index - 1].itemIndex && <><br /><br /></>}
            <button
              type="button"
              aria-label={`Seek to word ${index + 1}: ${word.text}`}
              aria-current={activeWord === index ? 'true' : undefined}
              className={activeWord === index ? 'is-playing-word' : ''}
              onClick={() => onSeek(index)}
            >{word.text}</button>{' '}
          </span>
        )
      ))}
    </p>
  );
}
