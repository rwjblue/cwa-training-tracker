import { expect, test } from '@playwright/test';

interface SpokenAnswerHarness {
  ended: number;
  answers: { text: string; ended: number }[];
  finishAnswer: () => void;
  finishCancelledAnswer: () => void;
  reset: () => void;
}

declare global {
  interface Window {
    spokenAnswerHarness: SpokenAnswerHarness;
  }
}

test('spoken word answers follow three native plays, survive repeats, and respect stop', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'cwa.practice.preferences.v1',
      JSON.stringify({
        tool: 'words',
        wordList: 'common-qso',
        shuffleWords: false,
        spokenAnswers: true,
        repeatList: true,
        hideTrainerText: false,
        characterWpm: 50,
        effectiveWpm: 50,
        wordGap: 0,
      }),
    );
    let pending: SpeechSynthesisUtterance | undefined;
    let cancelled: SpeechSynthesisUtterance | undefined;
    const finish = (utterance: SpeechSynthesisUtterance | undefined) =>
      utterance?.onend?.call(utterance, new Event('end') as SpeechSynthesisEvent);
    const harness: SpokenAnswerHarness = {
      ended: 0,
      answers: [],
      finishAnswer() {
        const utterance = pending;
        pending = undefined;
        finish(utterance);
      },
      finishCancelledAnswer() {
        finish(cancelled);
        cancelled = undefined;
      },
      reset() {
        this.ended = 0;
        this.answers = [];
        pending = undefined;
        cancelled = undefined;
      },
    };
    window.spokenAnswerHarness = harness;
    // Device voices are unavailable on some CI machines. Keep only speech synthetic:
    // Morse uses the real audio element, media clock, decoding, and ended events.
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        constructor(public text: string) {}
      },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ localService: true, lang: 'en-US' }],
        speak(utterance: SpeechSynthesisUtterance) {
          pending = utterance;
          harness.answers.push({ text: utterance.text, ended: harness.ended });
        },
        cancel() {
          cancelled = pending;
          pending = undefined;
        },
      },
    });
    document.addEventListener(
      'ended',
      (event) => {
        if (event.target instanceof HTMLAudioElement) harness.ended++;
      },
      true,
    );
  });

  await page.goto('/#practice');
  const play = page.getByRole('button', { name: 'Play Morse', exact: true });
  const stop = page.getByRole('button', { name: 'Stop playback', exact: true });
  const word = page.locator('.trainer-current');
  const answerHistory = () => page.evaluate(() => window.spokenAnswerHarness.answers);
  const finishAnswer = () => page.evaluate(() => window.spokenAnswerHarness.finishAnswer());
  await expect(page.getByRole('combobox', { name: 'Word list', exact: true })).toHaveValue(
    'common-qso',
  );
  await play.click();
  const media = page.getByLabel('Practice audio', { exact: true });
  const firstSource = await media.getAttribute('src');
  expect(firstSource).toMatch(/^blob:/);
  await expect.poll(answerHistory, { timeout: 10_000 }).toEqual([{ text: 'VVV', ended: 3 }]);
  await expect(media).toHaveAttribute('src', firstSource!);
  await finishAnswer();
  await expect(word).toHaveText('VERT');
  await expect.poll(() => page.evaluate(() => window.spokenAnswerHarness.ended)).toBeGreaterThan(3);
  await stop.click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Word list', exact: true }).selectOption('custom');
  await page.getByRole('textbox', { name: /^Your word list/ }).fill('E T');
  await page.evaluate(() => window.spokenAnswerHarness.reset());
  await play.click();
  await expect.poll(answerHistory).toEqual([{ text: 'E', ended: 3 }]);
  await finishAnswer();
  await expect.poll(answerHistory).toEqual([
    { text: 'E', ended: 3 },
    { text: 'T', ended: 6 },
  ]);

  // A late speech callback after Stop must not advance or restart native playback.
  await stop.click();
  await expect(play).toBeVisible();
  await page.clock.install();
  await page.evaluate(() => window.spokenAnswerHarness.finishCancelledAnswer());
  await page.clock.fastForward(1000);
  await expect(word).toHaveText('T');
  expect(await page.evaluate(() => window.spokenAnswerHarness.ended)).toBe(6);
  await expect(page.getByLabel('Practice audio', { exact: true })).toHaveJSProperty('paused', true);
  await page.clock.resume();

  await play.click();
  await expect.poll(answerHistory).toEqual([
    { text: 'E', ended: 3 },
    { text: 'T', ended: 6 },
    { text: 'T', ended: 9 },
  ]);
  await finishAnswer();
  await expect.poll(answerHistory).toEqual([
    { text: 'E', ended: 3 },
    { text: 'T', ended: 6 },
    { text: 'T', ended: 9 },
    { text: 'E', ended: 12 },
  ]);
  await expect(page.getByText('WORD 1 OF 2 · LISTENING', { exact: true })).toBeVisible();
  await stop.click();

  await page.getByRole('checkbox', { name: 'Repeat list', exact: true }).uncheck();
  await page.evaluate(() => window.spokenAnswerHarness.reset());
  await play.click();
  await expect.poll(answerHistory).toEqual([{ text: 'E', ended: 3 }]);
  await finishAnswer();
  await expect.poll(answerHistory).toEqual([
    { text: 'E', ended: 3 },
    { text: 'T', ended: 6 },
  ]);
  await finishAnswer();
  await expect(page.getByText('ROUND COMPLETE', { exact: true })).toBeVisible();
  await expect(play).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
