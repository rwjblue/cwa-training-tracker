// Local adapter for the pinned upstream runtime. Keep this wire schema aligned
// with src/shared/runner.ts; no lesson text or identity crosses it.
import { createRunnerTelemetry } from "./telemetry.js";
export const CHANNEL = "cw-training-runner";
export const VERSION = 3;
const conditionKeys = ["qrm", "qrn", "qsb", "flutter", "lids"];
const setupIds = ["mode", "time", "activity", ...conditionKeys];
const record = value => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value, keys) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

const validSettings = settings => record(settings) && exact(settings, ["mode", "wpm", "durationSeconds", "activity", "conditions"])
  && ["SingleCall", "WPX"].includes(settings.mode) && integer(settings.wpm, 10, 60)
  && integer(settings.durationSeconds, 60, 6000) && integer(settings.activity, 1, 9)
  && record(settings.conditions) && exact(settings.conditions, conditionKeys)
  && conditionKeys.every(key => typeof settings.conditions[key] === "boolean");

export function parseRunnerCommand(value) {
  if (!record(value) || value.channel !== CHANNEL || value.version !== VERSION
    || typeof value.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value.runId)) return undefined;
  const base = { channel: CHANNEL, version: VERSION, type: value.type, runId: value.runId };
  if (value.type === "stop" && exact(value, ["channel", "version", "type", "runId"])) return base;
  if (value.type !== "configure" || !exact(value, ["channel", "version", "type", "runId", "settings"])) return undefined;
  const settings = value.settings;
  if (!validSettings(settings)) return undefined;
  return { ...base, settings: { ...settings, conditions: { ...settings.conditions } } };
}

export function readRunnerSummary(log) {
  const qsoCount = log.data.length;
  const verifiedPoints = log.ConfCalls.size;
  const score = verifiedPoints * log.ConfPrefix.size;
  const nrErrors = log.data.filter(qso => qso.Check === "NR").length;
  const nilErrors = log.data.filter(qso => qso.Check === "Nil").length;
  if (!integer(qsoCount, 0, 100000) || !integer(verifiedPoints, 0, qsoCount)
    || !integer(score, 0, 10000000000) || nrErrors + nilErrors > qsoCount) throw new Error("Invalid runner summary");
  return { qsoCount, verifiedPoints, score, nrErrors, nilErrors };
}

/** Install after View.onLoad. Dependencies are injectable for synthetic tests. */
export function installRunnerBridge(view, { window: win, document: doc, callsReady = Promise.resolve() }) {
  const parent = win.parent;
  const origin = win.location.origin;
  const runButton = doc.getElementById("run");
  const originalStart = view.startContest.bind(view);
  const originalToggle = view.toggleNoRunFields.bind(view);
  const originalUpdate = view._config.update.bind(view._config);
  const originalSend = view.sendMessage.bind(view);
  const originalWipe = view.wipeFields.bind(view);
  const telemetry = createRunnerTelemetry();
  let configured;
  let sequence = -1;
  let ready = false;
  let used = false;
  let started = false;
  let terminal = false;
  let runGesture = false;
  let gestureExpiry;
  let explicitStop = false;
  let elapsedSeconds = 0;
  let heartbeat;
  let audioStateChanged;
  let actualSettings;
  let lastWpm;
  let finishing = false;
  let finishFlush;
  let flushTimeout;

  const send = (type, extra = {}) => {
    if (!configured) return;
    parent.postMessage({ channel: CHANNEL, version: VERSION, runId: configured.runId,
      type, sequence: ++sequence, elapsedSeconds, ...extra }, origin);
  };
  const syncControls = () => {
    for (const id of setupIds) doc.getElementById(id).disabled = !ready || used || terminal;
    doc.getElementById("wpm").disabled = !ready || terminal || finishing || (used && !started);
    const expert = doc.getElementById("expert_config");
    expert.disabled = true;
    expert.title = "Expert timing settings are not supported by the tracker's measured runs. Use the standalone runner for these options.";
  };
  const enableSending = enabled => {
    for (const button of doc.querySelectorAll(".send button")) button.disabled = !enabled;
  };
  const engineElapsed = () => {
    if (!started) return 0;
    const elapsed = view.ctx.currentTime - view.start_time;
    if (!Number.isFinite(elapsed) || elapsed < elapsedSeconds) throw new Error("Invalid runner clock");
    return Math.min(actualSettings.durationSeconds, elapsed);
  };
  const cleanup = () => {
    win.clearTimeout(gestureExpiry);
    win.clearTimeout(flushTimeout);
    win.clearInterval(heartbeat);
    win.clearInterval(view.timer_id);
    if (audioStateChanged && view.ctx) view.ctx.removeEventListener("statechange", audioStateChanged);
    view.running = false;
    try { view.ContestNode?.disconnect(); } catch { /* Already disconnected. */ }
    try {
      if (view.ctx && view.ctx.state !== "closed") void view.ctx.close().catch(() => {});
    } catch { /* A failed audio setup may not provide a closable context. */ }
    try { view.stopTX(); } catch { /* Initial setup may not have finished. */ }
    runButton.disabled = true;
    runButton.textContent = "Run finished";
    runButton.classList.remove("stop");
    enableSending(false);
    syncControls();
  };
  const fail = code => {
    if (terminal) return;
    terminal = true;
    // Preserve the last engine reading; never fill an error gap with wall time.
    if (!finishing) try { elapsedSeconds = engineElapsed(); } catch { /* Keep last valid reading. */ }
    telemetry.markIncomplete();
    send("error", { code, ...(started ? { telemetry: telemetry.snapshot(elapsedSeconds) } : {}) });
    cleanup();
  };
  const stop = reason => {
    if (terminal || finishing || !configured) return;
    try {
      elapsedSeconds = engineElapsed();
      finishing = true;
      view.running = false;
      runButton.disabled = true;
      enableSending(false);
      syncControls();
      const finish = () => {
        if (terminal) return;
        let summary;
        try { summary = readRunnerSummary(view.log); }
        catch { fail("engine"); return; }
        terminal = true;
        send("results", { reason, summary, ...(started ? { telemetry: telemetry.snapshot(elapsedSeconds) } : {}) });
        cleanup();
        view.clock.textContent = view.formatTimer(elapsedSeconds);
      };
      if (!started) { finish(); return; }
      // Freeze credit at Stop, then drain observations emitted before the
      // worklet acknowledges the barrier. Receipt timing never adds credit.
      finishFlush = finish;
      flushTimeout = win.setTimeout(() => { telemetry.markIncomplete(); finish(); }, 250);
      view.ContestNode.port.postMessage({ type: "cwa_flush" });
    } catch { fail("engine"); }
  };
  const tick = () => {
    if (!started || terminal || finishing) return;
    try {
      elapsedSeconds = engineElapsed();
      if (elapsedSeconds >= actualSettings.durationSeconds) stop("completed");
      else send("progress");
    } catch { fail("engine"); }
  };
  const applySettings = settings => {
    Object.assign(view._config._config, {
      wpm: settings.wpm, time: settings.durationSeconds / 60,
      contest_id: settings.mode === "SingleCall" ? "single" : "wpx", activity: settings.activity,
      ...settings.conditions,
      // Reset unsupported expert options; the ordinary fields remain editable.
      min_dx: 0, max_dx: 0, dx_wpm_type: "standard", dx_min_wpm: settings.wpm,
      dx_max_wpm: settings.wpm, farnsworth: false, farnsworth_eff_wpm: null, contest_start_offset_min: 0,
    });
    view._config.update_dom();
    view._config.update();
    syncControls();
  };

  const selectedSettings = () => {
    const config = view._config._config;
    return {
      mode: config.contest_id === "single" ? "SingleCall" : config.contest_id === "wpx" ? "WPX" : undefined,
      wpm: Number(config.wpm), durationSeconds: Number(config.time) * 60, activity: Number(config.activity),
      conditions: Object.fromEntries(conditionKeys.map(key => [key, config[key]])),
    };
  };
  // These are the two modes whose results the tracker currently understands.
  for (const option of [...doc.getElementById("mode").options]) {
    if (!["single", "wpx"].includes(option.value)) option.remove();
  }
  // Preserve upstream speed changes (including keyboard shortcuts), but keep
  // mode/duration fixed after Run so one continuous run has a coherent result.
  view.toggleNoRunFields = () => { originalToggle(); syncControls(); };
  view.wipeFields = (...args) => {
    if (started && !terminal && !finishing) {
      try { telemetry.resetContact(engineElapsed()); }
      catch { telemetry.markIncomplete(); }
    }
    return originalWipe(...args);
  };
  view.sendMessage = message => {
    if (finishing || terminal) return;
    if (started && !terminal && !finishing) {
      try { telemetry.send(message, engineElapsed()); }
      catch { telemetry.markIncomplete(); }
    }
    return originalSend(message);
  };
  view._config.update = (...args) => {
    if (finishing) return;
    // Number inputs briefly become empty while typing. Do not send invalid
    // speeds to the running audio engine during that intermediate state.
    if (started && !terminal && !integer(Number(doc.getElementById("wpm").value), 10, 60)) return;
    originalUpdate(...args);
    if (!started || terminal) return;
    const wpm = Number(view._config._config.wpm);
    if (wpm === lastWpm) return;
    try {
      if (!integer(wpm, 10, 60)) throw new Error("Invalid speed");
      elapsedSeconds = engineElapsed();
      lastWpm = wpm;
      send("speed", { wpm });
    } catch { fail("engine"); }
  };
  view.startContest = async () => {
    if (view.running || !ready || used || terminal || !runGesture) return;
    runGesture = false;
    win.clearTimeout(gestureExpiry);
    view._config.read_dom();
    const selected = selectedSettings();
    if (!validSettings(selected)) {
      for (const id of ["wpm", "time", "activity"]) doc.getElementById(id).reportValidity?.();
      return;
    }
    actualSettings = selected;
    lastWpm = selected.wpm;
    used = true;
    runButton.disabled = true;
    syncControls();
    try {
      await originalStart();
      if (terminal) { cleanup(); return; }
      if (!view.ContestNode || !view.ctx || view.ctx.state !== "running" || !Number.isFinite(view.start_time)) {
        fail("audio");
        return;
      }
      started = true;
      const originalMessage = view.ContestNode.port.onmessage;
      view.ContestNode.port.onmessage = event => {
        if (event.data?.type?.startsWith("cwa_")) {
          if (event.data.type === "cwa_flush") { finishFlush?.(); return; }
          if (!terminal) telemetry.receive(event.data.type, event.data.data, view.start_time);
          return;
        }
        originalMessage.call(view.ContestNode.port, event);
      };
      send("started", { settings: actualSettings });
      runButton.disabled = false;
      syncControls();
      enableSending(true);
      audioStateChanged = () => {
        if (!terminal && !finishing && view.ctx.state !== "running") fail("interrupted");
      };
      view.ctx.addEventListener("statechange", audioStateChanged);
      view.ContestNode.addEventListener("processorerror", () => fail("engine"), { once: true });
      heartbeat = win.setInterval(tick, 500);
    } catch { if (!terminal) fail("audio"); }
  };
  view.stopContest = () => {
    if (!started) { stop("stopped"); return; }
    try { stop(!explicitStop && engineElapsed() >= actualSettings.durationSeconds ? "completed" : "stopped"); }
    catch { fail("engine"); }
  };
  const onRunClick = event => {
    // An iframe click, not a postMessage or an upstream F1 auto-start, unlocks audio.
    runGesture = event.isTrusted === true;
    explicitStop = view.running;
    // Native dispatch may drain microtasks between capture and bubble
    // listeners. Keep this single-use permit until the click task finishes.
    win.clearTimeout(gestureExpiry);
    gestureExpiry = win.setTimeout(() => { runGesture = false; }, 0);
  };
  runButton.addEventListener("click", onRunClick, true);
  runButton.disabled = true;
  enableSending(false);
  syncControls();

  const onMessage = async event => {
    if (parent === win || event.source !== parent || event.origin !== origin) return;
    const command = parseRunnerCommand(event.data);
    if (!command) return;
    if (command.type === "stop") {
      if (command.runId === configured?.runId) stop("stopped");
      return;
    }
    // One configure/run per frame. A later command cannot reset its clock or ID.
    if (configured || terminal) return;
    configured = command;
    try {
      applySettings(command.settings);
      await callsReady;
      if (terminal) return;
      if (!view.calls.calls?.length) { fail("configuration"); return; }
      ready = true;
      runButton.disabled = false;
      syncControls();
      send("ready");
    } catch { fail("configuration"); }
  };
  const onPageHide = () => { if (configured && !terminal) stop("stopped"); };
  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden" && used && !terminal) stop("stopped");
  };
  win.addEventListener("message", onMessage);
  win.addEventListener("pagehide", onPageHide);
  doc.addEventListener("visibilitychange", onVisibilityChange);
  return {
    stop: () => stop("stopped"),
    destroy: () => {
      onPageHide();
      win.removeEventListener("message", onMessage);
      win.removeEventListener("pagehide", onPageHide);
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      runButton.removeEventListener("click", onRunClick, true);
    },
  };
}
