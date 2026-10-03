import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import type { Readable } from 'node:stream';
import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { CliError } from '../../runtime/errors.js';
import { readText } from '../shared/io.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import { optionString, outputFlags, requestOperation } from '../shared/operation.js';

/** Composed local workflows layered onto the annotation-generated API commands. */
export function registerSecretConveniences(root: Command, factory: Factory): void {
  const secrets = root.commands.find((command) => command.name() === 'secrets');
  if (!secrets) throw new Error('Generated secrets commands are missing');
  secrets.addCommand(addOutputFlags(new Command('import')
    .description('Create a value Secret for each KEY=VALUE in a .env file')
    .argument('<file>', '.env file, or - for stdin')
    .requiredOption('--prefix <prefix>', 'Secret path prefix')
    .option('--subaccount-id <id>', 'Act as this subaccount'))
    .action(async (file: string, options: Record<string, unknown> & OutputFlags) => {
      const prefix = String(options.prefix).replace(/\/+$/, '');
      const entries = parseDotenv(file === '-' ? await readStream(factory.io.in) : await readText(file));
      if (!entries.length) throw new CliError('No KEY=VALUE lines in the input');
      const stored: { id: string; path: string; version: number }[] = [];
      for (const [key, value] of entries) {
        stored.push(await requestOperation(factory, 'secrets.create', {
          body: { path: prefix + '/' + key, type: 'value', value } as CliOperationJsonBody<'secrets.create'>,
          actingSubaccountId: optionString(options, 'subaccountId'),
        }) as { id: string; path: string; version: number });
      }
      factory.io.writeErr('Imported ' + stored.length + ' secrets under ' + prefix + '/\n');
      if (outputFlags(options).json !== undefined) factory.io.writeOut(JSON.stringify(stored) + '\n');
    }));
  root.addCommand(createSecretsRunCommand(factory));
}

export type ChildSpawner = (
  command: string,
  args: string[],
  options: SpawnOptions
) => { on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown; on(event: 'error', listener: (error: Error) => void): unknown };

/**
 * `bctrl run --secrets <prefix> -- <cmd>`: reveal every Secret under the prefix
 * with the user's own key and run the command with them in its environment.
 * The values go to the child only; nothing is printed or written.
 */
export function createSecretsRunCommand(factory: Factory, spawnChild: ChildSpawner = nodeSpawn): Command {
  return new Command('run')
    .description('Run a command with Secrets in its environment')
    .requiredOption('--secrets <prefix>', 'Path prefix whose Secrets become environment variables')
    .option('--subaccount-id <id>', 'Act as this subaccount')
    .argument('<command...>', 'The command to run, after --')
    .action(async (argv: string[], options: Record<string, unknown>) => {
      const prefix = String(options.secrets).replace(/\/+$/, '');
      const actingSubaccountId = optionString(options, 'subaccountId');
      const env = await revealEnvironment(factory, prefix, actingSubaccountId);
      const [program, ...args] = argv;
      if (!program) throw new CliError('Give the command to run after --');
      const code = await new Promise<number>((resolve, reject) => {
        const child = spawnChild(program, args, {
          stdio: 'inherit',
          env: { ...process.env, ...env },
        });
        child.on('error', (error) => reject(new CliError(`Could not start ${program}: ${error.message}`)));
        child.on('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 128 : 1)));
      });
      process.exitCode = code;
    });
}

/** Environment variable name for a Secret below the prefix: `db/url` -> `DB_URL`. */
export function envName(relativePath: string): string {
  return relativePath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

async function revealEnvironment(
  factory: Factory,
  prefix: string,
  actingSubaccountId: string | undefined
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  let cursor: string | undefined;
  do {
    const page = (await requestOperation(factory, 'secrets.list', {
      query: { prefix: `${prefix}/`, limit: 200, ...(cursor ? { cursor } : {}) } as CliOperationQuery<'secrets.list'>,
      actingSubaccountId,
    })) as { data: { id: string; path: string; type: 'login' | 'value' }[]; nextCursor: string | null };
    for (const secret of page.data) {
      const revealed = (await requestOperation(factory, 'secrets.reveal', {
        pathParams: { secret: secret.id },
        body: {} as CliOperationJsonBody<'secrets.reveal'>,
        actingSubaccountId,
      })) as { username: string | null; password?: string; value?: string };
      const name = envName(secret.path.slice(prefix.length + 1));
      if (secret.type === 'value') {
        if (revealed.value !== undefined) env[name] = revealed.value;
      } else {
        if (revealed.username) env[`${name}_USERNAME`] = revealed.username;
        if (revealed.password !== undefined) env[`${name}_PASSWORD`] = revealed.password;
      }
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  if (Object.keys(env).length === 0) throw new CliError(`No Secrets under ${prefix}/`);
  return env;
}

/** KEY=VALUE lines; `#` comments, `export `, and single or double quotes are handled. */
export function parseDotenv(text: string): [string, string][] {
  const entries: [string, string][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new CliError(`Not a KEY=VALUE line: ${line.slice(0, 40)}`);
    let value = match[2]!;
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    entries.push([match[1]!, value]);
  }
  return entries;
}

function ifMatch(options: Record<string, unknown>): { headers?: Record<string, string> } {
  const version = optionString(options, 'ifMatch');
  return version ? { headers: { 'If-Match': `"${version}"` } } : {};
}

function trimNewline(text: string): string {
  return text.replace(/\r?\n$/, '');
}

async function readStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
