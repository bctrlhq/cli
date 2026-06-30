import { Command } from 'commander';
import Handlebars from 'handlebars';
import jqPromise from 'jq-web';
import type { IOStreams } from '../../io/streams.js';
import { CliError } from '../../runtime/errors.js';

export type OutputFlags = {
  json?: boolean | string;
  jq?: string;
  template?: string;
};

type ResolvedOutput = {
  fields?: string[];
  jq?: string;
  template?: string;
};

Handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value));
Handlebars.registerHelper('newline', () => '\n');
Handlebars.registerHelper('tab', () => '\t');

export function addOutputFlags(command: Command): Command {
  return command
    .option('--json [fields]', 'Output JSON with optional comma-separated fields')
    .option('--jq <expression>', 'Filter JSON output using a jq expression')
    .option('--template <template>', 'Format JSON output using a template');
}

export async function outputData(
  io: IOStreams,
  value: unknown,
  flags: OutputFlags | undefined = {}
): Promise<void> {
  const output = resolveOutput(flags);
  const projected = projectFields(value, output.fields);

  if (output.jq) {
    const jq = await jqPromise;
    const result = jq.raw(JSON.stringify(projected), output.jq, ['-r']);
    io.writeOut(result.endsWith('\n') ? result : `${result}\n`);
    return;
  }

  if (output.template) {
    io.writeOut(renderTemplate(projected, output.template));
    return;
  }

  writeJson(io, projected);
}

export function writeJson(io: IOStreams, value: unknown): void {
  io.writeOut(`${JSON.stringify(value, null, 2)}\n`);
}

function resolveOutput(flags: OutputFlags): ResolvedOutput {
  // --jq / --template are JSON-only transforms, so their presence implies JSON
  // output; they no longer require an explicit --json. --json's remaining job is
  // field projection (`--json a,b`). Default output is already JSON either way.
  return {
    fields: parseJsonFields(flags.json),
    jq: flags.jq,
    template: flags.template,
  };
}

function parseJsonFields(value: boolean | string | undefined): string[] | undefined {
  if (value === undefined || value === true || value === false) return undefined;
  return value
    .split(',')
    .map((field: string) => field.trim())
    .filter(Boolean);
}

function projectFields(value: unknown, fields: string[] | undefined): unknown {
  if (!fields || fields.length === 0) return value;

  if (Array.isArray(value)) {
    return value.map((item) => projectObject(item, fields));
  }

  if (isRecord(value)) {
    if (Array.isArray(value.data)) {
      return {
        ...value,
        data: value.data.map((item) => projectObject(item, fields)),
      };
    }
    if (isRecord(value.data)) {
      return {
        ...value,
        data: projectObject(value.data, fields),
      };
    }
    return projectObject(value, fields);
  }

  return value;
}

function projectObject(value: unknown, fields: string[]): unknown {
  if (!isRecord(value)) return value;

  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    projected[field] = getPath(value, field);
  }
  return projected;
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function renderTemplate(value: unknown, template: string): string {
  try {
    return Handlebars.compile(template, { noEscape: true })(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`Template rendering failed: ${reason}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
