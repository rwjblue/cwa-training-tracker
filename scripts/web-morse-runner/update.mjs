import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repository = "https://github.com/fritzsche/WebMorseRunner";
export const sourceFiles = [
  "LICENSE", "call.js", "config.js", "contest-definition.js", "contest-processor.js",
  "contest.js", "defaults.js", "dxoperator.js", "dxstation.js", "expert.js", "index.html",
  "keyer.js", "log.js", "main.js", "modulator.js", "movavg.js", "mystation.js",
  "qrmstation.js", "qrnstation.js", "qsb.js", "quickavg.js", "random.js", "recording.js",
  "station.js", "style.css", "transcript.js", "view.js", "volume.js",
];
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const vendorRoot = join(projectRoot, "public/vendor/web-morse-runner");
const approvalPath = new URL("./approved.json", import.meta.url);
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const upstreamPath = (path) => `upstream/${path === "index.html" ? "index.html.txt" : path}`;

export function validateRevision(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) {
    throw new Error("An explicit full, lowercase 40-character upstream commit SHA is required.");
  }
  return revision;
}

export function replaceOnce(source, anchor, replacement, label) {
  if (source.split(anchor).length !== 2) {
    throw new Error(`Incompatible upstream: expected exactly one ${label} anchor.`);
  }
  return source.replace(anchor, replacement);
}

/** Original generated practice strings, not a copied callsign registry. */
export function syntheticCalls() {
  const prefixes = ["K1", "N2", "W3", "AA4", "AB5", "AC6", "K7", "N8", "W9", "AA0"];
  const calls = new Set();
  for (let index = 0; calls.size < 512; index++) {
    const bytes = createHash("sha256").update(`cwa-training-calls-v1:${index}`).digest();
    const suffix = [...bytes.subarray(1, 4)].map((byte) => String.fromCharCode(65 + byte % 26)).join("");
    calls.add(prefixes[bytes[0] % prefixes.length] + suffix);
  }
  return [
    "# Original deterministic synthetic calls for offline simulation only.",
    "# Not a callsign registry; any match to a real station is coincidental.",
    "# Generator: scripts/web-morse-runner/update.mjs (syntheticCalls v1).",
    ...calls,
    "",
  ].join("\n");
}

export function sourceHashes(sources) {
  return Object.fromEntries(sourceFiles.map((path) => [path, sha256(sources[path])]));
}

export function verifyApproval(revision, sources, approval) {
  validateRevision(revision);
  if (approval.revision !== revision) {
    throw new Error("Unreviewed revision. Run --inspect SHA, review compatibility and licensing, then update approved.json explicitly.");
  }
  if (Object.keys(approval.sha256 ?? {}).sort().join("\n") !== [...sourceFiles].sort().join("\n")) {
    throw new Error("Approval file inventory does not match the reviewed runtime inventory.");
  }
  for (const path of sourceFiles) {
    if (typeof sources[path] !== "string" || sha256(sources[path]) !== approval.sha256[path]) {
      throw new Error(`Upstream integrity check failed: ${path}`);
    }
  }
}

/** The raw upstream copy stays untouched; only the generated runtime is patched. */
export function makeBundle(revision, sources) {
  validateRevision(revision);
  const output = {};
  for (const path of sourceFiles) {
    if (typeof sources[path] !== "string") throw new Error(`Missing upstream file: ${path}`);
    output[upstreamPath(path)] = sources[path];
    if (path.endsWith(".js") || path === "style.css") output[`runtime/${path}`] = sources[path];
  }
  output["runtime/view.js"] = replaceOnce(sources["view.js"],
    'this.ctx.audioWorklet.addModule("contest-processor.js")',
    'this.ctx.audioWorklet.addModule(new URL("./contest-processor.js", import.meta.url))', "AudioWorklet URL");
  output["runtime/call.js"] = replaceOnce(sources["call.js"],
    "fetch('calls.txt')", 'fetch(new URL("../data/synthetic-calls.txt", import.meta.url))', "calls URL");
  output["runtime/call.js"] = replaceOnce(output["runtime/call.js"],
    "static store_key = 'web_morse_runner_calls'", "static store_key = 'cwa_runner_synthetic_calls_v1'", "calls storage key");
  output["runtime/config.js"] = replaceOnce(sources["config.js"],
    'static store_key = "_WebMorseKey";', 'static store_key = "cwa_runner_config_v1";', "settings storage key");

  // These entry points are the deliberately small contract used by our adapter.
  for (const anchor of ["async startContest() {", "stopContest() {", "updateTimer() {", "onLoad() {"]) {
    replaceOnce(sources["view.js"], anchor, anchor, `View.${anchor}`);
  }
  for (const path of sourceFiles.filter((path) => path.endsWith(".js"))) {
    for (const match of sources[path].matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
      if (!match[1].startsWith("./") || !sourceFiles.includes(match[1].slice(2))) {
        throw new Error(`Unreviewed module dependency in ${path}: ${match[1]}`);
      }
    }
  }
  let page = replaceOnce(sources["index.html"],
    '<link rel="stylesheet" href="style.css" type="text/css" media="screen" />',
    '<link rel="stylesheet" href="./runtime/style.css" type="text/css" media="screen" />\n  <link rel="stylesheet" href="./integration/theme.css" />', "stylesheet");
  page = replaceOnce(page, '<script type="module" src="main.js"></script>',
    '<script type="module" src="./integration/main.js"></script>', "bootstrap");
  page = replaceOnce(page, '<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="robots" content="noindex, nofollow">', "charset");
  page = replaceOnce(page, '<html>', '<html lang="en">', "document language");
  page = replaceOnce(page, '<textarea id="transcript_content"', '<textarea aria-label="Contact transcript" id="transcript_content"', "transcript label");
  page = replaceOnce(page, '<button id="close_expert"', '<button aria-label="Close expert configuration" id="close_expert"', "expert close label");
  page = replaceOnce(page, '<div class="block" id="log">', '<div class="block" id="log" tabindex="0" role="region" aria-label="Contact log">', "keyboard-accessible contact log");
  page = replaceOnce(page, "<body>", '<body data-pagefind-ignore>\n  <aside class="runner-provenance">Adapted from Web Morse Runner by DJ1TF. <a href="./LICENSE">Unlicense</a>. Synthetic practice calls; not real contacts.</aside>', "body");
  output["index.html"] = page;
  output["LICENSE"] = sources.LICENSE;
  output["data/synthetic-calls.txt"] = syntheticCalls();
  output["UPSTREAM.json"] = JSON.stringify({
    repository, revision, license: "Unlicense", sourceSha256: sourceHashes(sources),
    generatedSha256: Object.fromEntries(Object.entries(output).map(([path, text]) => [path, sha256(text)])),
    patches: ["module-relative AudioWorklet URL", "local synthetic calls URL", "namespaced storage keys", "local bootstrap, theme, and attribution", "document language and accessible control labels"],
    excluded: ["upstream calls.txt (unverified provenance)", "Example_Calls/ (not required; third-party data)", "tests and documentation"],
  }, null, 2) + "\n";
  return output;
}

export async function downloadSources(revision, fetcher = fetch) {
  validateRevision(revision);
  const pairs = await Promise.all(sourceFiles.map(async (path) => {
    const url = `https://raw.githubusercontent.com/fritzsche/WebMorseRunner/${revision}/${path}`;
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Failed fetching ${path}: HTTP ${response.status}`);
    const source = Buffer.from(await response.arrayBuffer()).toString("utf8");
    if (Buffer.byteLength(source) > 1_000_000) throw new Error(`Unexpected upstream file size: ${path}`);
    return [path, source];
  }));
  return Object.fromEntries(pairs);
}

async function listGenerated(root, skipIntegration = true) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (skipIntegration && entry.name === "integration") continue;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected vendor symlink: ${entry.name}`);
    if (entry.isDirectory()) {
      for (const name of await listGenerated(join(root, entry.name), false)) files.push(`${entry.name}/${name}`);
    } else files.push(entry.name);
  }
  return files;
}

export async function checkBundle(root, approval) {
  const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async (path) =>
    [path, await readFile(join(root, upstreamPath(path)), "utf8")])));
  verifyApproval(approval.revision, sources, approval);
  const expected = makeBundle(approval.revision, sources);
  const inventory = (await listGenerated(root)).sort();
  if (inventory.join("\n") !== Object.keys(expected).sort().join("\n")) {
    throw new Error("Generated vendor inventory changed; updater will not remove or overwrite unknown files.");
  }
  for (const [path, contents] of Object.entries(expected)) {
    if (await readFile(join(root, path), "utf8") !== contents) {
      throw new Error(`Generated vendor file changed: ${path}. Put local changes in integration/, not generated files.`);
    }
  }
  return expected;
}

export async function updateBundle(root, revision, approval, fetcher = fetch) {
  // Check existing output against its own recorded source hashes before changing it.
  // New approval may intentionally refer to a reviewed upgrade, unlike the old bundle.
  try {
    const previous = JSON.parse(await readFile(join(root, "UPSTREAM.json"), "utf8"));
    await checkBundle(root, { revision: previous.revision, sha256: previous.sourceSha256 });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      if ((await readdir(root)).some((name) => name !== "integration")) {
        throw new Error("Partial/unmanaged vendor output exists; refusing to overwrite it.");
      }
    } catch (readError) { if (readError.code !== "ENOENT") throw readError; }
  }
  const sources = await downloadSources(revision, fetcher);
  verifyApproval(revision, sources, approval);
  const output = makeBundle(revision, sources);
  // All downloads, hashes and patch contracts are verified before the first write.
  for (const [path, contents] of Object.entries(output)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return output;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--check") {
    const approval = JSON.parse(await readFile(approvalPath, "utf8"));
    await checkBundle(vendorRoot, approval);
    console.log(`Web Morse Runner ${approval.revision}: generated files verified offline.`);
  } else if (args.length === 2 && args[0] === "--inspect") {
    const revision = validateRevision(args[1]);
    const sources = await downloadSources(revision);
    makeBundle(revision, sources);
    console.log(JSON.stringify({ revision, sha256: sourceHashes(sources) }, null, 2));
  } else if (args.length === 1) {
    const revision = validateRevision(args[0]);
    const approval = JSON.parse(await readFile(approvalPath, "utf8"));
    if (approval.revision !== revision) throw new Error("Unreviewed SHA; use --inspect SHA and review approved.json first.");
    await updateBundle(vendorRoot, revision, approval);
    console.log(`Vendored Web Morse Runner ${revision}; local integration/ files preserved.`);
  } else {
    throw new Error("Usage: update.mjs <FULL_SHA> | --check | --inspect <FULL_SHA>");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
