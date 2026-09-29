import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import type { Readable } from 'node:stream';
import { Command, Option } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { CliError } from '../../runtime/errors.js';
import { readText } from '../shared/io.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  addPaginationFlags,
  buildOperationInput,
  optionString,
  outputFlags,
  requestOperation,
  requestOperationAndPrint,
} from '../shared/operation.js';

/**
 * `bctrl secrets` (plan 039 §3, plan 043 A2.13). Values are never taken from
 * argv, where `ps` would show them: `put` reads the value from stdin, and
 * `import` reads a .env file.
 */
export function createSecretsCommand(factory: Factory): Command {
  const command = new Command('secrets').description('Store Secrets that agents use by reference');

  command.addCommand(
    addOutputFlags(
      addPaginationFlags(
        new Command('ls')
          .description('List Secrets and / folders under a prefix (metadata only)')
          .argument('[prefix]', 'Path prefix, for example prod/github/')
          .option('--type <type>', 'login or value')
          .option('--recursive', 'List every Secret under the prefix instead of one folder level')
          .option('--subaccount-id <id>', 'Act as this subaccount')
      )
    ).action(async (prefix: string | undefined, options: Record<string, unknown>) => {
      await requestOperationAndPrint(
        factory,
        'secrets.list',
        await buildOperationInput('secrets.list', options, {
          query: {
            ...(prefix ? { prefix } : {}),
            ...(options.recursive ? {} : { delimiter: '/' }),
            ...(optionString(options, 'type') ? { type: optionString(options, 'type') } : {}),
            ...(options.limit !== undefined ? { limit: options.limit } : {}),
            ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
          } as CliOperationQuery<'secrets.list'>,
          actingSubaccountId: optionString(options, 'subaccountId'),
          output: outputFlags(options),
        })
      );
    })
  );

  command.addCommand(
    addOutputFlags(
      new Command('get')
        .description('Get one Secret (metadata only)')
        .argument('<path>')
        .option('--subaccount-id <id>', 'Act as this subaccount')
    ).action(async (path: string, options: Record<string, unknown>) => {
      await requestOperationAndPrint(factory, 'secrets.get', {
        pathParams: { path },
        actingSubaccountId: optionString(options, 'subaccountId'),
        output: outputFlags(options),
      });
    })
  );

  command.addCommand(
    addOutputFlags(
      new Command('put')
        .description('Store a Secret; its value (the password, for a login) is read from stdin')
        .argument('<path>')
        .addOption(new Option('--type <type>', 'login or value').choices(['login', 'value']).default('value'))
        .option('--label <label>')
        .option('--username <username>', 'Login username (not secret)')
        .option('--origin <origin...>', 'Origins a login may be filled into, for example https://github.com')
        .option('--if-match <version>', 'Write only if the current version is this one')
        .option('--subaccount-id <id>', 'Act as this subaccount')
    ).action(async (path: string, options: Record<string, unknown>) => {
      const secret = trimNewline(await readStream(factory.io.in));
      if (!secret) throw new CliError('Pipe the value on stdin, for example: printf %s "$TOKEN" | bctrl secrets put api/key');
      const type = options.type as 'login' | 'value';
      const body =
        type === 'login'
          ? {
              type,
              password: secret,
              ...(optionString(options, 'username') ? { username: optionString(options, 'username') } : {}),
              ...(Array.isArray(options.origin) ? { origins: options.origin as string[] } : {}),
              ...(optionString(options, 'label') ? { label: optionString(options, 'label') } : {}),
            }
          : { type, value: secret, ...(optionString(options, 'label') ? { label: optionString(options, 'label') } : {}) };
      await requestOperationAndPrint(factory, 'secrets.put', {
        pathParams: { path },
        body: body as CliOperationJsonBody<'secrets.put'>,
        ...ifMatch(options),
        actingSubaccountId: optionString(options, 'subaccountId'),
        output: outputFlags(options),
      });
    })
  );

  command.addCommand(
    addOutputFlags(
      new Command('rm')
        .description('Delete a Secret and all its versions')
        .argument('<path>')
        .option('--if-match <version>', 'Delete only if the current version is this one')
        .option('--subaccount-id <id>', 'Act as this subaccount')
    ).action(async (path: string, options: Record<string, unknown>) => {
      await requestOperationAndPrint(factory, 'secrets.delete', {
        pathParams: { path },
        ...ifMatch(options),
        actingSubaccountId: optionString(options, 'subaccountId'),
        output: outputFlags(options),
      });
    })
  );

  command.addCommand(
    addOutputFlags(
      new Command('reveal')
        .description("Print a Secret's values (audited)")
        .argument('<path>')
        .option('--version <version>', 'An earlier version')
        .option('--subaccount-id <id>', 'Act as this subaccount')
    ).action(async (path: string, options: Record<string, unknown>) => {
      await requestOperationAndPrint(factory, 'secrets.reveal', {
        body: {
          path,
          ...(optionString(options, 'version') ? { version: Number(optionString(options, 'version')) } : {}),
        } as CliOperationJsonBody<'secrets.reveal'>,
        actingSubaccountId: optionString(options, 'subaccountId'),
        output: outputFlags(options),
      });
    })
  );

  command.addCommand(
    addOutputFlags(
      new Command('import')
        .description('Store each KEY=VALUE of a .env file as the value Secret <prefix>/KEY')
        .argument('<file>', '.env file, or - for stdin')
        .requiredOption('--prefix <prefix>', 'Path prefix, for example prod/app')
        .option('--subaccount-id <id>', 'Act as this subaccount')
    ).action(async (file: string, options: Record<string, unknown> & OutputFlags) => {
      const prefix = String(options.prefix).replace(/\/+$/, '');
      const entries = parseDotenv(file === '-' ? await readStream(factory.io.in) : await readText(file));
      if (entries.length === 0) throw new CliError(`No KEY=VALUE lines in ${file}`);
      const stored: { path: string; version: number }[] = [];
      for (const [key, value] of entries) {
        const saved = (await requestOperation(factory, 'secrets.put', {
          pathParams: { path: `${prefix}/${key}` },
          body: { type: 'value', value } as CliOperationJsonBody<'secrets.put'>,
          actingSubaccountId: optionString(options, 'subaccountId'),
        })) as { id: string; version: number };
        stored.push({ path: saved.id, version: saved.version });
      }
      factory.io.writeErr(`Imported ${stored.length} secrets under ${prefix}/\n`);
      if (outputFlags(options).json !== undefined) {
        factory.io.writeOut(`${JSON.stringify(stored)}\n`);
      }
    })
  );

  return command;
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
    })) as { data: { id: string; type: 'login' | 'value' }[]; nextCursor: string | null };
    for (const secret of page.data) {
      const revealed = (await requestOperation(factory, 'secrets.reveal', {
        body: { path: secret.id } as CliOperationJsonBody<'secrets.reveal'>,
        actingSubaccountId,
      })) as { username: string | null; password?: string; value?: string };
      const name = envName(secret.id.slice(prefix.length + 1));
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
