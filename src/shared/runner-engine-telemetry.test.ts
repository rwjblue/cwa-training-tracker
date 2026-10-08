import { beforeEach, describe, expect, it } from 'vitest';

// Exercise observation against the real pinned engine, using synthetic keyer
// envelopes so audio boundaries can be asserted without a real-time wait.
const enginePath = '../../public/vendor/web-morse-runner/integration/telemetry-engine.js';
const contestPath = '../../public/vendor/web-morse-runner/runtime/contest.js';
const stationPath = '../../public/vendor/web-morse-runner/runtime/station.js';
const dxPath = '../../public/vendor/web-morse-runner/runtime/dxstation.js';
const { installEngineTelemetry } = await import(enginePath);
const { Tst } = await import(contestPath);
const { Station } = await import(stationPath);
const { DxStation } = await import(dxPath);

interface ReceiveData {
  stationId: number;
  call: string;
  part: 'call' | 'exchange' | 'other';
  startTime: number;
  endTime: number;
}
interface EngineMessage {
  type: string;
  data?: ReceiveData | { code: string };
}
let messages: EngineMessage[] = [];
let audioTime = 2;
let audioRate = 11025;
Tst.processor = { port: { postMessage: (message: EngineMessage) => messages.push(message) } };
installEngineTelemetry({
  contest: Tst,
  Station,
  DxStation,
  bufferSize: 512,
  clock: () => audioTime,
  sampleRate: () => audioRate,
});

const caller = (call: string, first: number, last: number, length = 1536, part = 'MyCall') => {
  const station = new DxStation([call]);
  station._Envelope = new Float32Array(length);
  station._Envelope.fill(1, first, last + 1);
  station._SendPos = 0;
  station._Msg = [part];
  station.State = Station.State.Sending;
  Tst.Stations.push(station);
  return station;
};
const render = (length = 128) => {
  const output = new Float32Array(length);
  Tst.getBlock(output);
  audioTime += length / audioRate;
  return output;
};
const received = (type: string) =>
  messages.filter((message) => message.type === type).map((message) => message.data as ReceiveData);

beforeEach(() => {
  Tst.init();
  // No caller generation/noise conditions are needed to exercise source mixing.
  messages = [];
  audioTime = 2;
  audioRate = 11025;
});

describe('Runner AudioWorklet telemetry', () => {
  it('uses the final CW sample rather than envelope padding or message receipt time', () => {
    caller('K1ABC', 11, 900);
    render();
    const start = received('cwa_receive_start')[0];
    expect(start).toMatchObject({ stationId: 1, call: 'K1ABC', part: 'call' });
    expect(start.startTime).toBeCloseTo(2 + 11 / audioRate, 10);
    expect(start.endTime).toBeCloseTo(2 + 901 / audioRate, 10);
    expect(received('cwa_receive')).toHaveLength(0);

    // Three more renders consume the already-generated 512-sample source block.
    for (let index = 0; index < 3; index++) render();
    expect(received('cwa_receive')).toHaveLength(0);
    render();
    expect(received('cwa_receive')).toEqual([start]);
    // Completion is scheduled ahead of output, on the same AudioContext clock.
    expect(audioTime).toBeLessThan(start.endTime);
    for (let index = 0; index < 8; index++) render();
    expect(received('cwa_receive')).toEqual([start]);
  });

  it('maps a refill inside an output render using the actual AudioContext sample rate', () => {
    audioRate = 48000;
    Tst._src_pos = 400;
    caller('N2XYZ', 4, 60, 512, 'R_NR');
    render(300);
    const complete = received('cwa_receive')[0];
    expect(complete.part).toBe('exchange');
    expect(complete.startTime).toBeCloseTo(2 + (112 + 4) / audioRate, 10);
    expect(complete.endTime).toBeCloseTo(2 + (112 + 61) / audioRate, 10);
  });

  it('keeps overlapping callers distinct, including repeated transmissions of one caller', () => {
    const first = caller('K1ABC', 0, 100, 512);
    caller('N2XYZ', 0, 200, 512, 'DeMyCallNr1');
    const interference = new Station();
    interference.ProcessEvent = () => {};
    interference._Envelope = new Float32Array(512).fill(1);
    interference.State = Station.State.Sending;
    Tst.Stations.push(interference);
    render();
    expect(received('cwa_receive').map((data) => [data.stationId, data.call, data.part])).toEqual([
      [1, 'K1ABC', 'call'],
      [2, 'N2XYZ', 'call'],
    ]);
    for (let index = 0; index < 3; index++) render();
    first._Envelope = new Float32Array(512);
    first._Envelope.fill(1, 0, 50);
    first._SendPos = 0;
    first.State = Station.State.Sending;
    render();
    const later = received('cwa_receive')[2];
    expect(later.stationId).toBe(1);
    expect(later.startTime).toBeGreaterThan(received('cwa_receive')[0].endTime);
  });

  it('does not count a silent envelope or emit a start before the first CW sample', () => {
    caller('K1ABC', 600, 650, 1024);
    caller('N2XYZ', 0, -1, 512);
    render();
    expect(received('cwa_receive_start')).toHaveLength(0);
    for (let index = 0; index < 4; index++) render();
    expect(received('cwa_receive_start')).toHaveLength(1);
    expect(received('cwa_receive')).toHaveLength(1);
  });

  it('marks a failed observation without breaking the original audio engine', () => {
    caller('K1ABC', 0, 100, 512);
    audioTime = Number.NaN;
    expect(() => render()).not.toThrow();
    expect(messages.filter((message) => message.type === 'cwa_telemetry_error')).toEqual([
      { type: 'cwa_telemetry_error', data: { code: 'clock' } },
    ]);
    expect(received('cwa_receive')).toHaveLength(0);
    expect(Tst.Stations[0]._SendPos).toBe(512);
  });

  it('acknowledges a flush before the first render without dispatching an upstream command', () => {
    Tst.running = true;
    Tst.onmessage({ type: 'cwa_flush' });
    expect(messages).toEqual([{ type: 'cwa_flush', data: {} }]);
    expect(Tst.BlockNumber).toBe(0);
    expect(Tst.running).toBe(false);
  });
});
