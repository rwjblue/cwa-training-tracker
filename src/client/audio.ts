export const MORSE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  '/': '-..-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  '@': '.--.-.',
  ':': '---...',
  "'": '.----.',
  '(': '-.--.',
  ')': '-.--.-',
  '"': '.-..-.',
  '!': '-.-.--',
  '&': '.-...',
  ';': '-.-.-.',
  _: '..--.-',
  $: '...-..-',
};
export function cleanMorseText(text: string) {
  return text
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .split('')
    .filter((c) => c === ' ' || c === '\n' || MORSE[c])
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
export function generatePractice(mode: string, length = 12): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const random = (max: number) => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  };
  const choose = (str: string) => str[random(str.length)];
  if (mode === 'callsigns')
    return Array.from(
      { length },
      () =>
        `${['K', 'N', 'W', 'VE', 'G', 'DL', 'JA', 'VK'][random(8)]}${random(10)}${choose(letters)}${choose(letters)}${random(2) ? choose(letters) : ''}`,
    ).join(' ');
  if (mode === 'words') {
    const words = [
      'RADIO',
      'SIGNAL',
      'HELLO',
      'THANKS',
      'ANTENNA',
      'MORNING',
      'COFFEE',
      'FRIEND',
      'LISTEN',
      'PRACTICE',
      'WEATHER',
      'TODAY',
      'GARDEN',
      'STATION',
      'GOOD',
      'SOLID',
      'COPY',
      'BEAUTIFUL',
      'WEEKEND',
      'SUNSHINE',
      'FREQUENCY',
      'POWER',
    ];
    return Array.from({ length }, () => words[random(words.length)]).join(' ');
  }
  return Array.from({ length }, () =>
    Array.from({ length: 5 }, () => choose(mode === 'numbers' ? '0123456789' : letters)).join(''),
  ).join(' ');
}
export class MorsePlayer {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private playbackToken = 0;
  async play(
    text: string,
    characterWpm: number,
    effectiveWpm: number,
    frequency: number,
    volume: number,
    onFinish: () => void,
  ): Promise<number> {
    this.stop();
    const token = this.playbackToken;
    const cleaned = cleanMorseText(text);
    if (!cleaned) throw new Error('Add some letters or numbers to play.');
    this.context ??= new AudioContext();
    await this.context.resume();
    if (token !== this.playbackToken) return 0;
    const dit = 1.2 / characterWpm;
    // PARIS has 31 fixed element units and 19 spacing units. Stretch only the latter.
    const gapUnit = Math.max(dit, (60 / Math.min(characterWpm, effectiveWpm) - 31 * dit) / 19);
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    this.oscillator = this.context.createOscillator();
    this.oscillator.frequency.value = frequency;
    this.oscillator.type = 'sine';
    this.oscillator.connect(this.gain);
    let time = this.context.currentTime + 0.06;
    const start = time;
    for (let wi = 0; wi < cleaned.split(' ').length; wi++) {
      const word = cleaned.split(' ')[wi];
      for (let ci = 0; ci < word.length; ci++) {
        const symbols = MORSE[word[ci]];
        for (let si = 0; si < symbols.length; si++) {
          const duration = (symbols[si] === '.' ? 1 : 3) * dit;
          const ramp = Math.min(0.004, dit / 8);
          this.gain.gain.setValueAtTime(0, time);
          this.gain.gain.linearRampToValueAtTime(volume * 0.2, time + ramp);
          this.gain.gain.setValueAtTime(volume * 0.2, time + duration - ramp);
          this.gain.gain.linearRampToValueAtTime(0, time + duration);
          time += duration + (si < symbols.length - 1 ? dit : 0);
        }
        if (ci < word.length - 1) time += 3 * gapUnit;
      }
      if (wi < cleaned.split(' ').length - 1) time += 7 * gapUnit;
    }
    this.oscillator.onended = () => {
      if (token === this.playbackToken) {
        this.stop();
        onFinish();
      }
    };
    this.oscillator.start(start);
    this.oscillator.stop(time + 0.03);
    return time - start;
  }
  stop() {
    this.playbackToken++;
    if (this.oscillator) {
      this.oscillator.onended = null;
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
        /* Already stopped. */
      }
    }
    this.oscillator = null;
    this.gain?.disconnect();
    this.gain = null;
  }
}
