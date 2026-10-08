// Private run diagnostics. Commands describe intent; receive boundaries come
// from the AudioWorklet's actual Morse samples, never transcript receipt time.
const MAX_EVENTS = 256;
const MAX_COUNT = 1000000;
const validCall = call => typeof call === "string" && /^[A-Z0-9/]{1,32}$/.test(call);
const validTypedCall = call => typeof call === "string" && /^[A-Z0-9/?]{1,32}$/.test(call);
const finite = value => Number.isFinite(value) && value >= 0;
const delay = () => ({ count: 0, totalSeconds: 0, maxSeconds: 0 });

export function createRunnerTelemetry() {
  const data = {
    version: 1, incomplete: false, events: [], eventCount: 0, droppedEventCount: 0,
    questionMarkCount: 0, callSendCount: 0, callRepeatRequestCount: 0,
    exchangeRepeatRequestCount: 0, repeatedCallSendCount: 0,
    receivedCallCount: 0, receivedExchangeCount: 0, repeatedReceiveCount: 0,
    responseDelay: delay(), callResponseDelay: delay(),
    overlappingResponseCount: 0, unmatchedCallResponseCount: 0,
  };
  let phase = "call";
  let callsInContact = 0;
  let contactEpoch = 0;
  const stations = new Map();
  const heardParts = new Set();
  const pendingReceives = [];
  const add = event => {
    if (data.eventCount >= MAX_COUNT) { data.incomplete = true; return; }
    data.eventCount++;
    data.events.push(event);
    // Worklet receipt can lag a UI command. Keep the most recent audio times,
    // rather than depending on delivery order, and serialize in that order.
    data.events.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    if (data.events.length > MAX_EVENTS) data.events.shift();
    data.droppedEventCount = data.eventCount - data.events.length;
  };
  const countDelay = (aggregate, seconds) => {
    aggregate.count++;
    aggregate.totalSeconds += seconds;
    aggregate.maxSeconds = Math.max(aggregate.maxSeconds, seconds);
  };
  const advance = elapsedSeconds => {
    pendingReceives.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    while (pendingReceives.length && pendingReceives[0].elapsedSeconds <= elapsedSeconds) {
      const event = pendingReceives.shift();
      const key = `${event.stationId}:${event.part}`;
      if (heardParts.has(key)) data.repeatedReceiveCount++;
      heardParts.add(key);
      if (event.part === "call") data.receivedCallCount++;
      if (event.part === "exchange") data.receivedExchangeCount++;
      add(event);
    }
  };
  const resetContact = elapsedSeconds => {
    if (!finite(elapsedSeconds)) { data.incomplete = true; return; }
    contactEpoch = elapsedSeconds;
    phase = "call";
    callsInContact = 0;
    stations.clear();
  };
  return {
    markIncomplete: () => { data.incomplete = true; },
    resetContact,
    receive(kind, value, startTime) {
      if (kind === "cwa_telemetry_error") { data.incomplete = true; return; }
      if (!["cwa_receive_start", "cwa_receive"].includes(kind)) return;
      const { stationId, call, part, startTime: begin, endTime: end } = value ?? {};
      const startSeconds = begin - startTime;
      const endSeconds = end - startTime;
      if (!Number.isSafeInteger(stationId) || stationId < 1 || stationId > MAX_COUNT
        || !validCall(call) || !["call", "exchange", "other"].includes(part)
        || !finite(startSeconds) || !finite(endSeconds) || endSeconds < startSeconds) {
        data.incomplete = true;
        return;
      }
      // Keep the previous reply when the engine announces a new source block
      // ahead of playback. A command before its scheduled start still belongs
      // to the previous reply. Late prior-contact boundaries remain observable
      // events but cannot become matches in the learner's new contact.
      if (startSeconds >= contactEpoch) {
        if (!stations.has(stationId) && stations.size >= 10000) { data.incomplete = true; return; }
        const history = stations.get(stationId) ?? [];
        const previous = history.findIndex(station => station.startSeconds === startSeconds);
        const station = { call, part, startSeconds, endSeconds,
          responseMeasured: previous >= 0 && history[previous].responseMeasured };
        if (previous >= 0) history[previous] = station;
        else history.push(station);
        history.sort((a, b) => a.startSeconds - b.startSeconds);
        stations.set(stationId, history.slice(-2));
      }
      if (kind === "cwa_receive_start") return;
      if (pendingReceives.length >= 10000) { data.incomplete = true; return; }
      pendingReceives.push({ kind: "receive", elapsedSeconds: endSeconds, stationId, call, part, startSeconds });
    },
    send(message, elapsedSeconds) {
      if (!finite(elapsedSeconds) || data.eventCount >= MAX_COUNT) { data.incomplete = true; return; }
      advance(elapsedSeconds);
      if (data.eventCount >= MAX_COUNT) { data.incomplete = true; return; }
      let action;
      let call;
      if (message.type === "send_his") {
        action = "call";
        if (validTypedCall(message.data)) call = message.data;
      } else if (message.type === "send_exchange") action = "exchange";
      else if (message.type === "send_msg") {
        action = ({ Qm: "question", NrQm: "question", Agn: "question", NR: "exchange",
          CQ: "cq", LongCQ: "cq", TU: "tu" })[message.data] ?? "other";
      } else return;
      if (action === "question") {
        data.questionMarkCount += message.data === "Qm" ? 1 : 0;
        if (phase === "call") data.callRepeatRequestCount++;
        else data.exchangeRepeatRequestCount++;
      }
      if (action === "call") {
        data.callSendCount++;
        if (callsInContact++) data.repeatedCallSendCount++;
        const matches = [...stations.values()].map(history => history.findLast(station =>
          station.startSeconds >= contactEpoch && station.startSeconds <= elapsedSeconds))
          .filter(station => station?.call === call);
        if (matches.length === 1) {
          const station = matches[0];
          if (station.responseMeasured) data.unmatchedCallResponseCount++;
          else {
          station.responseMeasured = true;
          const gap = Math.max(0, elapsedSeconds - station.endSeconds);
          if (elapsedSeconds < station.endSeconds) data.overlappingResponseCount++;
          countDelay(data.responseDelay, gap);
          if (station.part === "call") countDelay(data.callResponseDelay, gap);
          }
        } else data.unmatchedCallResponseCount++;
      }
      add({ kind: "send", elapsedSeconds, action, phase, ...(call ? { call } : {}) });
      if (action === "call") phase = "exchange";
      if (action === "cq" || action === "tu" || (message.type === "send_msg" && message.data === "Nil")) {
        resetContact(elapsedSeconds);
      }
    },
    snapshot(elapsedSeconds) {
      advance(elapsedSeconds);
      // A completed source buffer can precede playback by a few milliseconds.
      // A stop midway through that buffer must not retain a future boundary.
      const snapshot = structuredClone(data);
      snapshot.events = snapshot.events.filter(event => event.elapsedSeconds <= elapsedSeconds);
      snapshot.droppedEventCount = snapshot.eventCount - snapshot.events.length;
      return snapshot;
    },
  };
}
