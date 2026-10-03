import { CLI_OPENAPI_ROUTES } from '../../generated/openapi-routes.js';
import type { CliOperationId, CliOperationJsonBody, CliOperationPathParams, CliOperationQuery } from '../../openapi.js';
import type { BctrlApiClient } from '../../api/client.js';
import type { IOStreams } from '../../io/streams.js';
import type { OutputFlags } from './output.js';

export type ApiDeps = { io: IOStreams; apiClient: () => Promise<BctrlApiClient> };

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
      runtimeId?: string;
      /** Extra request headers, for example `If-Match`. */
      headers?: Record<string, string>;
      output?: OutputFlags;
    };

export function optionString(options: Record<string, unknown>, name: string): string | undefined {
  return typeof options[name] === 'string' ? options[name] : undefined;
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
  const route: { path: string; wildcard?: string } = CLI_OPENAPI_ROUTES[operationId];
  return route.path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = (pathParams as Record<string, string | number | boolean> | undefined)?.[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${key}" for ${operationId}`);
    }
    // A wildcard parameter (a Secret path) keeps its slashes; each segment is encoded.
    if (key === route.wildcard) return String(value).split('/').map(encodeURIComponent).join('/');
    return encodeURIComponent(String(value));
  });
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
    ...(input.runtimeId ? { runtimeId: input.runtimeId } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
  const options = Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
  return client[route.method](path, options);
}
