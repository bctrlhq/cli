import { CLI_OPENAPI_ROUTES } from '../../generated/openapi-routes.js';
import type {
  CliOperationId,
  CliOperationJsonBody,
  CliOperationPathParams,
  CliOperationQuery,
} from '../../openapi.js';
import { Command } from 'commander';
import type { BctrlApiClient } from '../../api/client.js';
import type { IOStreams } from '../../io/streams.js';
import { readJsonFile } from './io.js';
import { parsePositiveInteger } from './options.js';
import { addOutputFlags, outputData, type OutputFlags } from './output.js';
import { CliError } from '../../runtime/errors.js';
import { addCliOperationHelp } from './help.js';

export type ApiDeps = {
  io: IOStreams;
  apiClient: () => Promise<BctrlApiClient>;
};

type UploadFileInput<OperationId extends CliOperationId> = OperationPathInput<OperationId> &
  OperationQueryInput<OperationId> & {
    file: Blob;
    fileName: string;
    fields?: Record<string, string>;
    actingSubaccountId?: string;
  };

type DownloadInput<OperationId extends CliOperationId> = OperationPathInput<OperationId>;

type StreamInput<OperationId extends CliOperationId> = OperationPathInput<OperationId> &
  OperationQueryInput<OperationId> & {
    actingSubaccountId?: string;
  };

type OperationPathInput<OperationId extends CliOperationId> = [
  CliOperationPathParams<OperationId>,
] extends [never]
  ? { pathParams?: never }
  : { pathParams: CliOperationPathParams<OperationId> };

type OperationQueryInput<OperationId extends CliOperationId> = [
  CliOperationQuery<OperationId>,
] extends [never]
  ? { query?: never }
  : { query?: CliOperationQuery<OperationId> };

type OperationBodyInput<OperationId extends CliOperationId> = [
  CliOperationJsonBody<OperationId>,
] extends [never]
  ? { body?: never }
  : { body?: CliOperationJsonBody<OperationId> };

export type OperationRequestInput<OperationId extends CliOperationId> =
  OperationPathInput<OperationId> &
    OperationQueryInput<OperationId> &
    OperationBodyInput<OperationId> & {
      idempotencyKey?: string;
      actingSubaccountId?: string;
      output?: OutputFlags;
    };

export function optionString(options: Record<string, unknown>, name: string): string | undefined {
  return typeof options[name] === 'string' ? options[name] : undefined;
}

export function actingSubaccountOption(name = 'subaccountId') {
  return (options: Record<string, unknown>): string | undefined => optionString(options, name);
}

export function addPaginationFlags(command: Command): Command {
  return command
    .option('-L, --limit <number>', 'Maximum number of results to return', parsePositiveInteger)
    .option('--cursor <cursor>', 'Pagination cursor');
}

/**
 * Generic request-override flags every operation command accepts, so the FULL
 * request surface is reachable without curated per-field flags:
 *  --params  path + query parameters as one JSON object
 *  --body    the request body as JSON (POST/PUT/PATCH)
 * Each accepts inline JSON, `@file`, or `-` for stdin. (`--json` is taken by the
 * output formatter, so the body flag is `--body`.)
 */
export function addRequestOverrideFlags(command: Command, opts: { body?: boolean } = {}): Command {
  command = command.option(
    '--params <json>',
    'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
  );
  if (opts.body) {
    command = command.option(
      '--body <json>',
      'Request body as JSON (inline, @file, or - for stdin)'
    );
  }
  return command;
}

/** Parse a JSON argument: inline JSON, `@path` for a file, or `-` for stdin. */
async function parseJsonArg(value: string, label: string): Promise<unknown> {
  const trimmed = value.trim();
  if (trimmed === '-') return readJsonFile('-', label);
  if (trimmed.startsWith('@')) return readJsonFile(trimmed.slice(1), label);
  try {
    return JSON.parse(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`Invalid JSON in ${label}: ${reason}`);
  }
}

function pathParamNames(operationId: CliOperationId): Set<string> {
  const names = new Set<string>();
  CLI_OPENAPI_ROUTES[operationId].path.replace(/\{([^}]+)\}/g, (_m, key: string) => {
    names.add(key);
    return '';
  });
  return names;
}

/**
 * Turn the generic `--params` / `--body` flags into request-input
 * overrides. `--params` keys that match the route's `{placeholders}` become path
 * params; the rest become query params. `--body` becomes the body.
 */
export async function resolveRequestOverrides(
  operationId: CliOperationId,
  options: Record<string, unknown>
): Promise<{ pathParams?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }> {
  const overrides: {
    pathParams?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  } = {};

  if (typeof options.params === 'string') {
    const parsed = await parseJsonArg(options.params, '--params');
    if (!isRecord(parsed)) {
      throw new CliError('--params must be a JSON object, e.g. \'{"limit":50}\'');
    }
    const pathNames = pathParamNames(operationId);
    const pathParams: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (pathNames.has(key)) pathParams[key] = value;
      else query[key] = value;
    }
    if (Object.keys(pathParams).length > 0) overrides.pathParams = pathParams;
    if (Object.keys(query).length > 0) overrides.query = query;
  }

  if (typeof options.body === 'string') {
    overrides.body = await parseJsonArg(options.body, '--body');
  }

  return overrides;
}

/**
 * Merge the generic `--params` / `--body` overrides into a hand-written
 * command's curated request input. Use this in any command whose `.action` calls
 * `requestOperationAndPrint` directly (not via createOperation*Command), so it gains
 * full `--params`/`--body` coverage with one wrap:
 *
 *   await requestOperationAndPrint(factory, 'op.id',
 *     await buildOperationInput('op.id', options, {
 *       pathParams: { id }, body, query, idempotencyKey, output: outputFlags(options),
 *     }));
 *
 * Precedence: `--body` replaces the curated body; `--params` keys fill the
 * route's path placeholders / query, with curated path+query values overlaid on top.
 */
export async function buildOperationInput<OperationId extends CliOperationId>(
  operationId: OperationId,
  options: Record<string, unknown>,
  curated: OperationRequestInput<OperationId>
): Promise<OperationRequestInput<OperationId>> {
  const overrides = await resolveRequestOverrides(operationId, options);
  const c = curated as {
    pathParams?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    idempotencyKey?: string;
    actingSubaccountId?: string;
    output?: OutputFlags;
  };
  const merged: Record<string, unknown> = {};
  const pathParams = overlayDefined(overrides.pathParams, c.pathParams);
  if (pathParams) merged.pathParams = pathParams;
  const query = overlayDefined(overrides.query, c.query);
  if (query) merged.query = query;
  const body = overrides.body !== undefined ? overrides.body : c.body;
  if (body !== undefined) merged.body = body;
  if (c.idempotencyKey) merged.idempotencyKey = c.idempotencyKey;
  if (c.actingSubaccountId) merged.actingSubaccountId = c.actingSubaccountId;
  if (c.output) merged.output = c.output;
  return merged as OperationRequestInput<OperationId>;
}

/** Overlay only the defined keys of `overlay` onto `base` (curated values win). */
function overlayDefined(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!base) return overlay;
  if (!overlay) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

export function outputFlags(options: Record<string, unknown>): OutputFlags {
  return {
    ...(typeof options.json === 'string' || typeof options.json === 'boolean'
      ? { json: options.json }
      : {}),
    ...(typeof options.jq === 'string' ? { jq: options.jq } : {}),
    ...(typeof options.template === 'string' ? { template: options.template } : {}),
  };
}

export function operationPath<OperationId extends CliOperationId>(
  operationId: OperationId,
  pathParams?: CliOperationPathParams<OperationId>
): string {
  const route = CLI_OPENAPI_ROUTES[operationId];
  return route.path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = (pathParams as Record<string, string | number | boolean> | undefined)?.[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${key}" for ${operationId}`);
    }
    return encodeURIComponent(String(value));
  });
}

export async function requestOperationAndPrint<OperationId extends CliOperationId>(
  deps: ApiDeps,
  operationId: OperationId,
  input: OperationRequestInput<OperationId>
): Promise<void> {
  const result = await requestOperation(deps, operationId, input);
  await outputData(deps.io, result, input.output);
}

export async function requestOperation<OperationId extends CliOperationId>(
  deps: ApiDeps,
  operationId: OperationId,
  input: OperationRequestInput<OperationId>
): Promise<unknown> {
  const route = CLI_OPENAPI_ROUTES[operationId];
  const client = await deps.apiClient();
  const path = operationPath(operationId, input.pathParams as CliOperationPathParams<OperationId>);
  const requestOptions = {
    ...('query' in input && input.query !== undefined ? { query: input.query } : {}),
    ...('body' in input && input.body !== undefined ? { body: input.body } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.actingSubaccountId ? { actingSubaccountId: input.actingSubaccountId } : {}),
  };
  const options = Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
  const result =
    route.method === 'get'
      ? await client.get(path, options)
      : route.method === 'post'
        ? await client.post(path, options)
        : route.method === 'patch'
          ? await client.patch(path, options)
          : route.method === 'put'
            ? await client.put(path, options)
            : await client.delete(path, options);
  return result;
}

export async function uploadOperationFile<OperationId extends CliOperationId>(
  deps: ApiDeps,
  operationId: OperationId,
  input: UploadFileInput<OperationId>
): Promise<unknown> {
  const client = await deps.apiClient();
  return client.uploadFile(
    operationPath(operationId, input.pathParams as CliOperationPathParams<OperationId>),
    {
      file: input.file,
      fileName: input.fileName,
      ...('query' in input && input.query !== undefined ? { query: input.query } : {}),
      ...(input.fields ? { fields: input.fields } : {}),
      ...(input.actingSubaccountId ? { actingSubaccountId: input.actingSubaccountId } : {}),
    }
  );
}

export async function downloadOperation<OperationId extends CliOperationId>(
  deps: ApiDeps,
  operationId: OperationId,
  input: DownloadInput<OperationId>
): Promise<Uint8Array> {
  const client = await deps.apiClient();
  return client.download(
    operationPath(operationId, input.pathParams as CliOperationPathParams<OperationId>)
  );
}

export async function streamOperationText<OperationId extends CliOperationId>(
  deps: ApiDeps,
  operationId: OperationId,
  input: StreamInput<OperationId>
): Promise<AsyncIterable<string>> {
  const client = await deps.apiClient();
  return client.streamText(
    operationPath(operationId, input.pathParams as CliOperationPathParams<OperationId>),
    {
      ...('query' in input && input.query !== undefined ? { query: input.query } : {}),
      ...(input.actingSubaccountId ? { actingSubaccountId: input.actingSubaccountId } : {}),
    }
  );
}

export function createOperationListCommand<OperationId extends CliOperationId>(
  factory: ApiDeps,
  config: {
    operationId: OperationId;
    name?: string;
    description: string;
    configure?: (command: Command) => Command;
    query?: (options: Record<string, unknown>) => CliOperationQuery<OperationId>;
    actingSubaccountId?: (options: Record<string, unknown>) => string | undefined;
  }
): Command {
  let command = new Command(config.name ?? 'list').description(config.description);
  command = addCliOperationHelp(command, config.operationId);
  command = config.configure ? config.configure(command) : addPaginationFlags(command);
  command = addRequestOverrideFlags(command);
  command = addOutputFlags(command);
  return command.action(async (options: Record<string, unknown>) => {
    const overrides = await resolveRequestOverrides(config.operationId, options);
    const curatedQuery = config.query ? config.query(options) : defaultListQuery(options);
    const actingSubaccountId = config.actingSubaccountId?.(options);
    await requestOperationAndPrint(factory, config.operationId, {
      ...(overrides.pathParams ? { pathParams: overrides.pathParams } : {}),
      query: overlayDefined(overrides.query, curatedQuery as Record<string, unknown>),
      ...(actingSubaccountId ? { actingSubaccountId } : {}),
      output: outputFlags(options),
    } as unknown as OperationRequestInput<OperationId>);
  });
}

export function createOperationViewCommand<OperationId extends CliOperationId>(
  factory: ApiDeps,
  config: {
    operationId: OperationId;
    name?: string;
    description: string;
    argName?: string;
    configure?: (command: Command) => Command;
    query?: (id: string, options: Record<string, unknown>) => CliOperationQuery<OperationId>;
  }
): Command {
  const argName = config.argName ?? 'id';
  let command = new Command(config.name ?? 'view')
    .description(config.description)
    .argument(`<${argName}>`);
  command = addCliOperationHelp(command, config.operationId);
  command = config.configure ? config.configure(command) : command;
  command = addRequestOverrideFlags(command);
  command = addOutputFlags(command);
  return command.action(async (id: string, options: Record<string, unknown>) => {
    const overrides = await resolveRequestOverrides(config.operationId, options);
    const curatedQuery = config.query ? config.query(id, options) : undefined;
    await requestOperationAndPrint(factory, config.operationId, {
      pathParams: overlayDefined(overrides.pathParams, { [argName]: id, id }),
      query: overlayDefined(overrides.query, curatedQuery as Record<string, unknown> | undefined),
      output: outputFlags(options),
    } as unknown as OperationRequestInput<OperationId>);
  });
}

export function createOperationDeleteCommand<OperationId extends CliOperationId>(
  factory: ApiDeps,
  config: {
    operationId: OperationId;
    name?: string;
    description: string;
    argNames?: string[];
    configure?: (command: Command) => Command;
    query?: (
      args: Record<string, string>,
      options: Record<string, unknown>
    ) => CliOperationQuery<OperationId>;
    actingSubaccountId?: (
      args: Record<string, string>,
      options: Record<string, unknown>
    ) => string | undefined;
  }
): Command {
  const argNames = config.argNames ?? ['id'];
  let command = new Command(config.name ?? 'delete').description(config.description);
  command = addCliOperationHelp(command, config.operationId);
  for (const arg of argNames) command = command.argument(`<${arg}>`);
  command = command.option('-y, --yes', 'Confirm deletion');
  command = config.configure ? config.configure(command) : command;
  command = addRequestOverrideFlags(command);
  command = addOutputFlags(command);
  return command.action(async (...actionArgs: unknown[]) => {
    const options = getActionOptions(actionArgs);
    if (options.yes !== true) {
      throw new CliError('Refusing to delete without --yes');
    }
    const params: Record<string, string> = {};
    for (let i = 0; i < argNames.length; i += 1) params[argNames[i]!] = String(actionArgs[i]);
    const overrides = await resolveRequestOverrides(config.operationId, options);
    const curatedQuery = config.query ? config.query(params, options) : undefined;
    await requestOperationAndPrint(factory, config.operationId, {
      pathParams: overlayDefined(overrides.pathParams, params),
      query: overlayDefined(overrides.query, curatedQuery as Record<string, unknown> | undefined),
      output: outputFlags(options),
    } as unknown as OperationRequestInput<OperationId>);
  });
}

export function createOperationJsonBodyCommand<OperationId extends CliOperationId>(
  factory: ApiDeps,
  config: {
    operationId: OperationId;
    name: string;
    description: string;
    argNames?: string[];
    configure?: (command: Command) => Command;
    body?: (
      args: Record<string, string>,
      options: Record<string, unknown>
    ) => Promise<CliOperationJsonBody<OperationId>>;
    query?: (
      args: Record<string, string>,
      options: Record<string, unknown>
    ) => CliOperationQuery<OperationId>;
    actingSubaccountId?: (
      args: Record<string, string>,
      options: Record<string, unknown>
    ) => string | undefined;
  }
): Command {
  const argNames = config.argNames ?? [];
  let command = new Command(config.name).description(config.description);
  command = addCliOperationHelp(command, config.operationId);
  for (const arg of argNames) command = command.argument(`<${arg}>`);
  command = config.configure ? config.configure(command) : command;
  command = addRequestOverrideFlags(command, { body: true });
  command = addOutputFlags(command);
  return command.action(async (...actionArgs: unknown[]) => {
    const options = getActionOptions(actionArgs);
    const args: Record<string, string> = {};
    for (let i = 0; i < argNames.length; i += 1) args[argNames[i]!] = String(actionArgs[i]);
    const overrides = await resolveRequestOverrides(config.operationId, options);
    // --body (raw JSON) takes the whole body; otherwise fall back to the
    // curated per-flag body. Either way the server validates against the schema.
    const curatedBody = config.body ? await config.body(args, options) : undefined;
    const body = overrides.body !== undefined ? overrides.body : (curatedBody ?? {});
    const curatedQuery = config.query ? config.query(args, options) : undefined;
    const actingSubaccountId = config.actingSubaccountId?.(args, options);
    await requestOperationAndPrint(factory, config.operationId, {
      pathParams: overlayDefined(overrides.pathParams, args),
      body,
      query: overlayDefined(overrides.query, curatedQuery as Record<string, unknown> | undefined),
      ...(actingSubaccountId ? { actingSubaccountId } : {}),
      output: outputFlags(options),
    } as unknown as OperationRequestInput<OperationId>);
  });
}

function defaultListQuery(
  options: Record<string, unknown>
): Record<string, string | number | boolean | undefined> {
  return {
    limit: typeof options.limit === 'number' ? options.limit : undefined,
    cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
  };
}

function getActionOptions(args: unknown[]): Record<string, unknown> {
  const candidate = args.at(-2);
  return isRecord(candidate) ? candidate : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
