/** Saved progress and this block stay separate from the learner's completion decision. */
export default function ListeningPassProgress({
  savedPasses,
  currentPasses,
  importedPasses = 0,
  minimumPasses,
  extraReview = false,
  compact = false,
}: {
  savedPasses: number;
  currentPasses?: number;
  importedPasses?: number;
  minimumPasses?: number;
  extraReview?: boolean;
  compact?: boolean;
}) {
  const remaining =
    minimumPasses === undefined
      ? undefined
      : Math.max(0, minimumPasses - savedPasses - (extraReview ? 0 : (currentPasses ?? 0)));
  if (compact || currentPasses === undefined)
    return (
      <p className="field-hint">
        {savedPasses} listening {savedPasses === 1 ? 'pass' : 'passes'} saved
        {currentPasses !== undefined && currentPasses > 0 && (
          <>
            {' · '}
            {currentPasses} {extraReview ? 'extra review ' : ''}
            {currentPasses === 1 ? 'listen' : 'listens'} this session ·{' '}
            <strong>Not saved yet</strong>
          </>
        )}
        {remaining !== undefined ? ` · ${remaining} minimum remaining` : ''}
        {importedPasses > 0 ? ` · includes ${importedPasses} imported` : ''}
      </p>
    );
  return (
    <section className="listening-pass-progress" aria-label="Listening passes">
      <h3>Listening passes</h3>
      <dl className="listening-pass-totals">
        <div>
          <dt>Previously saved</dt>
          <dd>{savedPasses}</dd>
        </div>
        <div>
          <dt>This session</dt>
          <dd>{currentPasses}</dd>
        </div>
        {!extraReview && remaining !== undefined && (
          <div>
            <dt>Minimum remaining</dt>
            <dd>{remaining}</dd>
          </div>
        )}
      </dl>
      {currentPasses > 0 && (
        <p className="field-hint listening-pass-save-status">
          {currentPasses} {currentPasses === 1 ? 'listen' : 'listens'} this session ·{' '}
          <strong>Not saved yet.</strong> Use Save or Finish practice to keep your listens and time.
        </p>
      )}
      {importedPasses > 0 && (
        <p className="field-hint">
          Previously saved includes {importedPasses} imported source passes.
        </p>
      )}
      <p className="field-hint">
        {extraReview
          ? 'Extra review keeps its own time and passes, without required assignment credit.'
          : remaining === 0
            ? 'The minimum is met. Complete the exercise when you are ready, or listen again.'
            : 'A pass is about a recording’s worth of listening time. Rehearing counts too. Complete the exercise when you are ready.'}
      </p>
    </section>
  );
}
