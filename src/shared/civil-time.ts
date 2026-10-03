/** Resolve civil time using actual IANA offsets, including half-hour changes. */
export function civilTimeCandidates(date: string, time: string, zone: string): number[] {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    era: 'short',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wall = (instant: number) => {
    const parts = format.formatToParts(new Date(instant));
    const part = (key: string) => Number(parts.find((item) => item.type === key)!.value);
    const civil = new Date(0);
    const year =
      parts.find((item) => item.type === 'era')!.value === 'BC' ? 1 - part('year') : part('year');
    // Date.UTC interprets years 0–99 as 1900–1999; keep accepted dates literal.
    civil.setUTCFullYear(year, part('month') - 1, part('day'));
    civil.setUTCHours(part('hour'), part('minute'), part('second'), 0);
    return civil.getTime();
  };
  const target = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  const offsets = new Set(
    [-36, -24, -12, 0, 12, 24, 36].map((hours) => {
      const sample = target + hours * 3_600_000;
      return wall(sample) - sample;
    }),
  );
  return [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => wall(instant) === target)
    .sort((a, b) => a - b);
}
