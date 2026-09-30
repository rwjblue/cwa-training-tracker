/** Display whole seconds while retaining the measured precision when saving unchanged. */
export function formatPracticeDuration(minutes: number | undefined): string {
  if (minutes === undefined) return '';
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Accept minutes:seconds or a plain number of minutes, up to one day. */
export function practiceMinutesFromInput(value: string, initialMinutes?: number): number | null {
  const input = value.trim();
  if (
    initialMinutes !== undefined &&
    Number.isFinite(initialMinutes) &&
    initialMinutes >= 0 &&
    initialMinutes <= 1440 &&
    input === formatPracticeDuration(initialMinutes)
  ) {
    return initialMinutes;
  }
  const clock = /^(\d+):([0-5]\d)$/.exec(input);
  const minutes = clock
    ? (Number(clock[1]) * 60 + Number(clock[2])) / 60
    : /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)
      ? Number(input)
      : NaN;
  return Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : null;
}
