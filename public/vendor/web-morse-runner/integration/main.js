import { View } from "../runtime/view.js";
import { Calls } from "../runtime/call.js";
import { ContestDefinition } from "../runtime/contest-definition.js";
import { installRunnerBridge } from "./bridge.js";

// Configuration changes recreate these fields. Apply names at their creation
// boundary so changing mode or speed cannot discard the accessible labels.
const updateExchangeFields = ContestDefinition.prototype.updateExchangeFields;
ContestDefinition.prototype.updateExchangeFields = function (...args) {
  const result = updateExchangeFields.apply(this, args);
  for (const [id, label] of [["rst", "Received signal report"], ["nr", "Received exchange"]]) {
    document.getElementById(id)?.setAttribute("aria-label", label);
  }
  return result;
};

// View starts this load in its constructor without retaining its promise.
// Preserve it locally so readiness means both configuration and calls loaded.
const fetchCalls = Calls.prototype.fetch_calls;
Calls.prototype.fetch_calls = function () {
  const pending = fetchCalls.call(this);
  this.trainingCallsReady = pending;
  void pending.catch(() => {});
  return pending;
};

const initialize = () => {
  const view = new View();
  view.onLoad();
  installRunnerBridge(view, { window, document, callsReady: view.calls.trainingCallsReady });
  // Move the existing controls; retained nodes keep upstream listeners and refs.
  const launchBar = document.getElementById("run").parentElement;
  launchBar.classList.add("runner-launch-bar");
  launchBar.setAttribute("role", "group");
  launchBar.setAttribute("aria-label", "Run controls");
  document.getElementById("main").before(launchBar);
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else initialize();
