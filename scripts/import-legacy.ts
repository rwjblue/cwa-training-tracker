#!/usr/bin/env node
/** Local-only conversion: never reads Cloudflare or modifies the source tracker. */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { convertLegacyExport } from '../src/shared/training.ts';

const help =
  'Usage: node scripts/import-legacy.ts <legacy-export.json> --output <private-output.json> [--before YYYY-MM-DD] [--keep-profile]';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(help);
    return;
  }
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: 'string' },
      before: { type: 'string' },
      'keep-profile': { type: 'boolean' },
    },
  });
  if (positionals.length !== 1 || !values.output) throw new Error(help);
  const source = path.resolve(positionals[0]);
  const output = path.resolve(values.output);
  if (source === output)
    throw new Error('Choose a different output path to preserve your original export.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const relative = path.relative(root, output);
  if (
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative) &&
    !relative.startsWith(`data${path.sep}private${path.sep}`) &&
    !relative.startsWith(`.private${path.sep}`) &&
    !relative.startsWith(`.tmp${path.sep}`)
  ) {
    throw new Error(
      'Inside this repository, save personal data only under the ignored data/private/, .private/, or .tmp/ directories.',
    );
  }
  const info = await stat(source);
  if (info.size > 32 * 1024 * 1024)
    throw new Error(
      'Legacy export exceeds 32 MiB. Keep the original and split the export before converting.',
    );
  const converted = convertLegacyExport(JSON.parse(await readFile(source, 'utf8')), {
    beforeDate: values.before,
  });
  // Omitting the optional profile makes the signed-in account retain all of its
  // current preferences, including identity and privacy choices.
  if (values['keep-profile']) delete converted.profile;
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, `${JSON.stringify(converted, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  const classSessions = converted.sessions.filter((session) => session.context === 'class').length;
  console.log(
    `Converted ${converted.sessions.length} saved sessions (${classSessions} class sessions).`,
  );
  if (converted.legacy?.importedBefore)
    console.log(
      `Practice before ${converted.legacy.importedBefore.date} in ${converted.legacy.importedBefore.timezone}; later source records remain archived only.`,
    );
  const estimates = converted.sessions.filter(
    (session) => session.metadata?.estimatedMinutes,
  ).length;
  console.log(`${estimates} LCWO sessions use explicitly labeled one-minute estimates.`);
  if (values['keep-profile']) console.log('Existing account preferences will be preserved.');
  console.log(`Saved a private import file to ${output}`);
  console.log(
    'The complete original export is preserved inside this file. Import it from Settings after signing in.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Import conversion failed.');
  process.exitCode = 1;
});
