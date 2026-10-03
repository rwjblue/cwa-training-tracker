// Separate checkouts may run their isolated Wrangler servers on different ports.
export const e2ePort = Number(process.env.CWA_E2E_PORT ?? 8791);
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort > 65535) {
  throw new Error('CWA_E2E_PORT must be a TCP port between 1 and 65535.');
}
export const e2eOrigin = `http://localhost:${e2ePort}`;
