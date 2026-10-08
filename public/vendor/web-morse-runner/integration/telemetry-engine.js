// Observe the pinned simulator inside its AudioWorklet. These timestamps describe
// the scheduled keyer samples on the AudioContext clock, before output latency.
// They never come from transcript delivery or a main-thread wall clock.
const callMessages = new Set(["MyCall", "DeMyCall1", "DeMyCall2", "DeMyCallNr1", "DeMyCallNr2", "MyCallNr2"]);
const exchangeMessages = new Set(["NR", "R_NR", "R_NR2", "Exchange1", "MyExchange"]);
const MAX_TRANSMISSIONS = 20000;

const partOf = messages => messages.some(message => callMessages.has(message)) ? "call"
  : messages.some(message => exchangeMessages.has(message)) ? "exchange" : "other";

/** Injectable engine boundaries keep synthetic tests on the actual adapter. */
export function installEngineTelemetry({ contest, Station, DxStation, bufferSize, clock, sampleRate }) {
  const originalGetBlock = contest.getBlock.bind(contest);
  const originalSourceBlock = contest._getSrcBlock.bind(contest);
  const originalStationBlock = Station.prototype.GetBlock;
  const originalInit = contest.init.bind(contest);
  const originalMessage = contest.onmessage.bind(contest);
  let stationIds = new WeakMap();
  let transmissions = new WeakMap();
  let stationSequence = 0;
  let transmissionCount = 0;
  let sourceTime;
  let nextSourceTime;
  let failed = false;

  const fail = code => {
    if (failed) return;
    failed = true;
    try { contest.post({ type: "cwa_telemetry_error", data: { code } }); } catch { /* Keep the audio engine working. */ }
  };
  const emit = (type, data) => {
    if (failed) return;
    try { contest.post({ type, data }); } catch { fail("engine"); }
  };

  contest.init = (...args) => {
    stationIds = new WeakMap();
    transmissions = new WeakMap();
    stationSequence = 0;
    transmissionCount = 0;
    failed = false;
    return originalInit(...args);
  };

  // A same-port barrier lets the bridge receive preceding diagnostics before
  // freezing the result and disconnecting the processor. It also works before
  // the first render, and never reaches upstream's unknown-message branch.
  contest.onmessage = message => {
    if (message.type === "cwa_flush") {
      // Stop generating additional source blocks before acknowledging the
      // barrier, preserving the station/log state for already-queued messages.
      contest.running = false;
      contest.post({ type: "cwa_flush", data: {} });
      return;
    }
    return originalMessage(message);
  };

  contest.getBlock = block => {
    // The upstream source buffer is 512 samples; each output render is normally
    // 128 samples. Anchor the next refill at its position within this render.
    // There is no resampling in the pinned Contest.getBlock implementation.
    try {
      const rate = sampleRate();
      const time = clock();
      if (!Number.isFinite(time) || time < 0 || !Number.isFinite(rate) || rate <= 0
        || !Number.isSafeInteger(contest._src_pos) || contest._src_pos < 0 || contest._src_pos >= bufferSize) {
        fail("clock");
      } else {
        const offset = (bufferSize - contest._src_pos) % bufferSize;
        nextSourceTime = time + offset / rate;
      }
    } catch { fail("clock"); }
    return originalGetBlock(block);
  };

  contest._getSrcBlock = (...args) => {
    try {
      sourceTime = nextSourceTime;
      nextSourceTime += bufferSize / sampleRate();
    } catch { fail("clock"); }
    return originalSourceBlock(...args);
  };

  Station.prototype.GetBlock = function (...args) {
    let measurement;
    let position;
    try {
      if (!failed && this instanceof DxStation && this._Envelope) {
        position = this._SendPos;
        const envelope = this._Envelope;
        measurement = transmissions.get(this);
        if (!measurement || measurement.envelope !== envelope) {
          const call = this.MyCall.toUpperCase();
          if (!/^[A-Z0-9/]{1,32}$/.test(call) || !Number.isFinite(sourceTime)) {
            fail("engine");
          } else {
            let first = -1;
            let last = -1;
            // Keyer.GetEnvelope includes final silence and source-block padding.
            // Exclude both when measuring the final CW sound.
            for (let index = 0; index < envelope.length; index++) {
              if (envelope[index] !== 0) { if (first < 0) first = index; last = index; }
            }
            if (last >= position && first >= 0) {
              if (!stationIds.has(this)) stationIds.set(this, ++stationSequence);
              if (++transmissionCount > MAX_TRANSMISSIONS) fail("limit");
              else {
                const rate = sampleRate();
                const startTime = position > 0 && measurement
                  ? measurement.data.startTime : sourceTime + (first - position) / rate;
                const data = { stationId: stationIds.get(this), call, part: partOf(this._Msg),
                  startTime, endTime: sourceTime + (last - position + 1) / rate };
                measurement = { envelope, first, last, data, started: false, finished: false };
                transmissions.set(this, measurement);
              }
            } else measurement = undefined;
          }
        }
      }
    } catch { fail("engine"); }

    // The observation cannot change the engine's blocks, station state or errors.
    const result = originalStationBlock.apply(this, args);
    try {
      if (!failed && measurement && result?.length) {
        if (!measurement.started && measurement.first < position + result.length) {
          measurement.started = true;
          emit("cwa_receive_start", measurement.data);
        }
        if (!measurement.finished && measurement.last < position + result.length) {
          measurement.finished = true;
          emit("cwa_receive", measurement.data);
        }
      }
    } catch { fail("engine"); }
    return result;
  };
}
