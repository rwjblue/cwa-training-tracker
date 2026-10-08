import { installEngineTelemetry } from "./telemetry-engine.js";
import { Tst } from "../runtime/contest.js";
import { Station } from "../runtime/station.js";
import { DxStation } from "../runtime/dxstation.js";
import { DEFAULT } from "../runtime/defaults.js";
import "../runtime/contest-processor.js";

// The processor is registered by upstream; hooks install before any instance is
// constructed and preserve the original signal generation and contest behavior.
installEngineTelemetry({ contest: Tst, Station, DxStation, bufferSize: DEFAULT.BUFSIZE,
  clock: () => currentTime, sampleRate: () => sampleRate });
