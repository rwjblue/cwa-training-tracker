import React from 'react';

/** Keep drag previews local; native change marks release or a keyboard step. */
export default function PreciseRange({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  hint,
  continuous = false,
  disabled = false,
  showExact = true,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  hint: string;
  continuous?: boolean;
  disabled?: boolean;
  showExact?: boolean;
}) {
  const id = React.useId();
  const slider = React.useRef<HTMLInputElement>(null);
  const committed = React.useRef(value);
  const callback = React.useRef(onChange);
  callback.current = onChange;
  const [preview, setPreview] = React.useState(value);
  const [draft, setDraft] = React.useState(String(value));
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    committed.current = value;
    setPreview(value);
    setDraft(String(value));
    setError('');
  }, [value]);
  const commit = React.useCallback((next: number) => {
    setPreview(next);
    setDraft(String(next));
    setError('');
    if (next === committed.current) return;
    committed.current = next;
    callback.current(next);
  }, []);
  React.useEffect(() => {
    const input = slider.current!;
    const change = () => {
      if (!input.disabled) commit(Number(input.value));
    };
    input.addEventListener('change', change);
    return () => input.removeEventListener('change', change);
  }, [commit]);
  const cancel = () => {
    if (slider.current) slider.current.value = String(value);
    setPreview(value);
    setDraft(String(value));
    setError('');
  };
  const commitDraft = () => {
    const next = Number(draft);
    if (
      !draft.trim() ||
      !Number.isFinite(next) ||
      next < min ||
      next > max ||
      Math.abs(next / step - Math.round(next / step)) > 1e-7
    ) {
      setError(
        `Enter ${min}–${max} ${unit} in steps of ${step}. The active value stays ${value} ${unit}.`,
      );
      return;
    }
    commit(next);
  };
  return (
    <div className="range-control precise-range">
      <div>
        <label htmlFor={id}>{label}</label>
        <span>
          {preview} <small>{unit}</small>
        </span>
      </div>
      <input
        ref={slider}
        id={id}
        type="range"
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        aria-valuetext={`${preview} ${unit === '%' ? 'percent' : unit}`}
        aria-describedby={`${id}-hint`}
        value={preview}
        onChange={(event) => {
          const next = Number(event.target.value);
          setPreview(next);
          if (continuous) commit(next);
        }}
        onBlur={(event) => {
          if (!event.target.disabled) commit(Number(event.target.value));
        }}
        onPointerCancel={cancel}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      />
      {!continuous && showExact && (
        <>
          <label htmlFor={`${id}-exact`}>Exact value ({unit})</label>
          <input
            id={`${id}-exact`}
            className="precise-number"
            type="number"
            disabled={disabled}
            aria-label={`${label} exact (${unit})`}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
            aria-invalid={Boolean(error)}
            min={min}
            max={max}
            step={step}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError('');
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
            }}
          />
        </>
      )}
      <p id={`${id}-hint`}>
        {hint}{' '}
        {!continuous &&
          !disabled &&
          (preview !== value
            ? `Preview only. Release to apply; active ${value} ${unit}.`
            : showExact
              ? 'Release the slider, or enter an exact value and press Enter or leave the field, to apply.'
              : 'Release the slider to apply.')}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
