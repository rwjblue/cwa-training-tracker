import worker from '../src/worker/index';
import { lcwoFixtureResponse } from './lcwo-fixture';

// Only the isolated browser harness points to this entrypoint. Production keeps
// src/worker/index.ts; it has no fixture binding, test endpoint or fetch override.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  return url.origin === 'https://lcwo.net'
    ? lcwoFixtureResponse(input, init)
    : nativeFetch(input, init);
};
export default worker;
