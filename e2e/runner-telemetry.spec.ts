import { expect, type FrameLocator, type Page } from '@playwright/test';
import { test } from './fixtures';
import { expectResponsive, openPracticeTool, signIn } from './helpers';
import type { PracticeSession } from '../src/shared/training';
import type { RunnerTelemetry } from '../src/shared/runner-telemetry';

interface ReceivedTransmission {
  stationId: number;
  call: string;
  part: 'call' | 'exchange' | 'other';
  startTime: number;
  endTime: number;
}

interface ObservedRunnerWindow extends Window {
  observedRunnerReceives?: ReceivedTransmission[];
  observedRunnerAudioTime?: () => number;
}

// At 60 WPM the standard DX operator uses at least 30 WPM. Its final
// two keyer units and one padded source block must drain before the upstream
// station leaves Sending and can copy our response. Diagnostics still measure
// from the last audible sample, so this real engine delay remains in the result.
const receiverSettleSeconds = 2 * (1.2 / 30) + 512 / 11025;

async function received(frame: FrameLocator): Promise<ReceivedTransmission[]> {
  return frame.locator('body').evaluate((element, settleSeconds) => {
    const win = element.ownerDocument.defaultView as ObservedRunnerWindow;
    const currentTime = win.observedRunnerAudioTime?.() ?? 0;
    return (win.observedRunnerReceives ?? []).filter(
      (event) => event.endTime + settleSeconds <= currentTime,
    );
  }, receiverSettleSeconds);
}

async function nextReceive(frame: FrameLocator, after: number) {
  await expect
    .poll(async () => (await received(frame)).length, {
      timeout: 15_000,
      message: 'A real DX transmission should finish playing through the AudioWorklet',
    })
    .toBeGreaterThan(after);
  return (await received(frame))[after]!;
}

async function terminalResult(page: Page, scope: string): Promise<PracticeSession> {
  const prefix = `cwa:runner:result:v1:${encodeURIComponent(scope)}:`;
  await expect
    .poll(() =>
      page.evaluate(
        (prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)).length,
        prefix,
      ),
    )
    .toBe(1);
  return page.evaluate(
    (prefix) =>
      JSON.parse(Object.entries(localStorage).find(([key]) => key.startsWith(prefix))![1]).entry,
    prefix,
  );
}

test.use({ hasTouch: true });

test('Runner captures real call repeats and response delays through review and private save', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  const { user } = await (await context.request.get('/api/me')).json();

  // Pin only the synthetic caller. The real vendored engine still creates the
  // station, sends CW, consumes commands and acknowledges the terminal result.
  // Observe its receive messages and actual playback clock; do not forge events
  // or advance AudioWorklet time.
  await page.route('**/vendor/web-morse-runner/integration/main.js', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: source.replace(
        'const initialize = () => {',
        `Calls.prototype.get_random = () => ['K1TEST'];
const nativeStartContest = View.prototype.startContest;
View.prototype.startContest = async function (...args) {
  await nativeStartContest.apply(this, args);
  window.observedRunnerReceives = [];
  window.observedRunnerAudioTime = () => this.ctx.currentTime;
  this.ContestNode.port.addEventListener('message', (event) => {
    if (event.data.type === 'cwa_receive') window.observedRunnerReceives.push(event.data.data);
  });
};
const initialize = () => {`,
      ),
    });
  });

  await openPracticeTool(page, 'Morse Runner');
  const frame = page.frameLocator('iframe[title="Web Morse Runner practice simulator"]');
  await frame.getByLabel('Mode', { exact: true }).selectOption('single');
  await frame.getByLabel('min.', { exact: true }).fill('1');
  await frame.getByLabel('CW Speed', { exact: true }).fill('60');
  await frame.getByLabel('CW Speed', { exact: true }).press('Tab');
  await frame.locator('#my_call').fill('K1A');
  await frame.locator('#my_call').press('Tab');
  for (const label of ['QRM', 'QRN', 'QSB', 'Flutter', "LID's"])
    await frame.getByLabel(label, { exact: true }).uncheck();
  await frame.getByRole('button', { name: /Run$/ }).focus();
  await page.keyboard.press('Enter');
  const firstCall = await nextReceive(frame, 0);
  expect(firstCall).toMatchObject({ call: 'K1TEST', part: 'call' });

  // Ask for the callsign before sending it, then copy the real repeated call.
  await frame.locator('#call').focus();
  await page.keyboard.press('F7');
  const repeatedCall = await nextReceive(frame, 1);
  expect(repeatedCall).toMatchObject({
    stationId: firstCall.stationId,
    call: 'K1TEST',
    part: 'call',
  });
  await frame.locator('#call').fill('K1TEST');
  await frame.locator('#call').press('Enter');

  // The upstream operator can ask for our number again. Honor that native
  // interaction without changing its random decisions or clock.
  let observedCount = 2;
  let exchange = await nextReceive(frame, observedCount++);
  for (let attempt = 0; exchange.part === 'other' && attempt < 3; attempt++) {
    await frame.getByRole('button', { name: 'F2 <#>', exact: true }).click();
    exchange = await nextReceive(frame, observedCount++);
  }
  expect(exchange).toMatchObject({ call: 'K1TEST', part: 'exchange' });

  // Continue the same run with touch controls at mobile width.
  await page.setViewportSize({ width: 390, height: 844 });
  await frame.getByRole('button', { name: 'F7 ?', exact: true }).tap();
  const repeatedExchange = await nextReceive(frame, observedCount++);
  expect(repeatedExchange).toMatchObject({
    stationId: firstCall.stationId,
    call: 'K1TEST',
    part: 'exchange',
  });
  await frame.getByRole('button', { name: 'F5 <his>', exact: true }).tap();
  await page.getByRole('button', { name: 'Stop run', exact: true }).tap();

  const retained = await terminalResult(page, user.id);
  const telemetry = (retained.metadata!.runner as { telemetry: RunnerTelemetry }).telemetry;
  expect(telemetry).toMatchObject({
    version: 1,
    incomplete: false,
    questionMarkCount: 2,
    callRepeatRequestCount: 1,
    exchangeRepeatRequestCount: 1,
    callSendCount: 2,
    repeatedCallSendCount: 1,
    receivedCallCount: 2,
    receivedExchangeCount: 2,
    overlappingResponseCount: 0,
    unmatchedCallResponseCount: 0,
    droppedEventCount: 0,
  });
  // Extra native NR? requests can repeat too; both deliberate caller repeats
  // must always be counted without constraining that upstream randomness.
  expect(telemetry.repeatedReceiveCount).toBeGreaterThanOrEqual(2);
  expect(telemetry.callResponseDelay.count).toBe(1);
  expect(telemetry.callResponseDelay.totalSeconds).toBeGreaterThan(0);
  expect(telemetry.responseDelay.count).toBe(2);
  expect(telemetry.responseDelay.totalSeconds).toBeGreaterThanOrEqual(
    telemetry.callResponseDelay.totalSeconds,
  );
  expect(
    telemetry.events.filter((event) => event.kind === 'receive' && event.part === 'call'),
  ).toHaveLength(2);
  expect(
    telemetry.events.filter((event) => event.kind === 'receive' && event.part === 'exchange'),
  ).toHaveLength(2);
  expect(
    telemetry.events
      .filter((event) => event.kind === 'send')
      .filter((event) => event.action === 'question')
      .map((event) => event.phase),
  ).toEqual(['call', 'exchange']);
  expect(telemetry.eventCount).toBe(telemetry.events.length);

  await page.getByText('Run diagnostics', { exact: true }).click();
  await expect(
    page.getByText(
      /Question marks: 2; Repeat requests before a call send: 1; Repeat requests after a call send: 1\./,
    ),
  ).toBeVisible();
  await expectResponsive(page, 'runner-diagnostics');
  await page.getByRole('button', { name: 'Review & save run', exact: true }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Save practice', exact: true }).tap();

  await expect
    .poll(async () =>
      (await (await context.request.get('/api/entries')).json()).entries.find(
        (entry: PracticeSession) => entry.id === retained.id,
      ),
    )
    .toMatchObject({ id: retained.id, metadata: { runner: { telemetry } } });
});
