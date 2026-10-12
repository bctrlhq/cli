import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { readFile } from 'node:fs/promises';
import type { IOStreams } from '../../io/streams.js';
import { CliError } from '../../runtime/errors.js';
import type { ApiOperation, Schema } from './catalog.js';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map<string, ValidateFunction>();

export const flagName = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const optionName = (name: string): string => name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
const reservedFlags = new Set(['space', 'subaccount-id', 'api-version', 'idempotency-key', 'query', 'params',
  'headers', 'body', 'fields', 'file', 'out', 'yes', 'json', 'jq', 'template', 'timeout-ms', 'max-events', 'if-match', 'last-event-id']);
export const queryFlag = (name: string): string => {
  const flag = flagName(name);
  return reservedFlags.has(flag) ? `query-${flag}` : flag;
};

export async function readInput(value: string, io: IOStreams, label: string): Promise<unknown> {
  let text = value;
  if (value === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of io.in) chunks.push(Buffer.from(chunk));
    text = Buffer.concat(chunks).toString('utf8');
  } else if (value.startsWith('@')) {
    text = await readFile(value.slice(1), 'utf8');
  }
  try {
    return JSON.parse(text);
  } catch {
    // Never echo caller input: bodies and headers can contain credentials.
    throw new CliError(`Invalid JSON in ${label}`);
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function scalar(value: string, schema: Schema): unknown {
  if (schema.type === 'integer' || schema.type === 'number') return Number(value);
  if (schema.type === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new CliError('Boolean options require true or false');
  }
  if (schema.type === 'array' || schema.type === 'object') {
    try { return JSON.parse(value); } catch { throw new CliError('Expected a JSON option value'); }
  }
  return value;
}

export async function buildRequestInput(
  operation: ApiOperation,
  args: string[],
  options: Record<string, unknown>,
  io: IOStreams
): Promise<Record<string, unknown>> {
  const properties = operation.inputSchema.properties ?? {};
  const stdinOptions = ['query', 'params', 'headers', 'body', 'fields', 'file'].filter((name) => options[name] === '-');
  if (stdinOptions.length > 1) throw new CliError('Only one input can read stdin; use @files for the others');
  const input: Record<string, unknown> = {};
  operation.cli.positionalArgs.forEach((name, index) => {
    input[name] = scalar(args[index], properties[name]);
  });
  if (options.query && options.params) throw new CliError('Use either --query or --params');
  const queryArg = options.query ?? options.params;
  const query = typeof queryArg === 'string' ? object(await readInput(queryArg, io, '--query'), '--query') : {};
  for (const [name, schema] of Object.entries(properties.query?.properties ?? {})) {
    const value = options[optionName(queryFlag(name))];
    if (typeof value === 'string') query[name] = scalar(value, schema);
  }
  if (Object.keys(query).length || properties.query?.required?.length) input.query = query;
  const headers = typeof options.headers === 'string'
    ? object(await readInput(options.headers, io, '--headers'), '--headers') : {};
  // Pin the contract even when a key was created against an earlier release.
  input.headers = { 'BCTRL-Version': '2026-10-03', ...headers };
  for (const [option, header] of Object.entries({
    apiVersion: 'BCTRL-Version', space: 'BCTRL-Space',
    subaccountId: 'BCTRL-Subaccount-Id', idempotencyKey: 'Idempotency-Key',
    ifMatch: 'If-Match', lastEventId: 'Last-Event-ID',
  })) {
    if (typeof options[option] === 'string') (input.headers as Record<string, unknown>)[header] = options[option];
  }
  for (const name of ['body', 'fields']) {
    if (typeof options[name] === 'string') input[name] = await readInput(options[name], io, `--${name}`);
  }
  if (operation.stream) {
    if (typeof options.timeoutMs === 'string') input.timeoutMs = scalar(options.timeoutMs, properties.timeoutMs);
    if (typeof options.maxEvents === 'string') input.maxEvents = scalar(options.maxEvents, properties.maxEvents);
  }
  // Validate multipart presence without reading/duplicating potentially large files.
  if (typeof options.file === 'string' && properties.fileBase64) input.fileBase64 = '';
  validateRequest(operation, input);
  return input;
}

export function validateRequest(operation: ApiOperation, input: Record<string, unknown>): void {
  let validate = validators.get(operation.operationId);
  if (!validate) {
    validate = ajv.compile(operation.inputSchema);
    validators.set(operation.operationId, validate);
  }
  if (!validate(input)) {
    const details = (validate.errors ?? []).slice(0, 8).map((error) => {
      const property = error.params.missingProperty ?? error.params.additionalProperty;
      return `${error.instancePath || '/'}${property ? `/${property}` : ''} ${error.message}`;
    }).join('; ');
    throw new CliError(`Invalid input for ${operation.cli.command}: ${details}`);
  }
}
