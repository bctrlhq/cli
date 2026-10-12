import commands from '../../generated/commands.json' with { type: 'json' };
import type { CliOperationId } from '../../openapi.js';
import type { HttpMethod } from '../../api/client.js';
import { CLI_OPENAPI_ROUTES } from '../../generated/openapi-routes.js';

export type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  [key: string]: unknown;
};

export type ApiOperation = {
  operationId: CliOperationId;
  method: HttpMethod;
  description: string;
  cli: { command: string; positionalArgs: string[] };
  mcp: { destructiveHint: boolean };
  stream: boolean;
  requestContentTypes: string[];
  responseContentTypes: string[];
  inputSchema: Schema;
};

export const API_OPERATIONS = commands as unknown as ApiOperation[];

export function multipartOperation(operation: ApiOperation): boolean {
  return operation.requestContentTypes.includes('multipart/form-data');
}

export function operationPath(operation: ApiOperation, input: Record<string, unknown>): string {
  const route = CLI_OPENAPI_ROUTES[operation.operationId];
  return route.path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = String(input[key]);
    const wildcard = 'wildcard' in route && route.wildcard === key;
    return wildcard ? value.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(value);
  });
}
