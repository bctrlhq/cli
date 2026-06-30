import type { CLI_OPENAPI_ROUTES } from './generated/openapi-routes.js';
import type { operations } from './generated/openapi-types.js';

export type CliOperationId = keyof typeof CLI_OPENAPI_ROUTES & keyof operations;

export type CliOperationQuery<OperationId extends CliOperationId> =
  operations[OperationId] extends { parameters: { query?: infer Query } }
    ? NonNullable<Query>
    : never;

export type CliOperationPathParams<OperationId extends CliOperationId> =
  operations[OperationId] extends { parameters: { path?: infer PathParams } }
    ? NonNullable<PathParams>
    : never;

export type CliOperationJsonBody<OperationId extends CliOperationId> =
  operations[OperationId] extends { requestBody?: infer RequestBody }
    ? NonNullable<RequestBody> extends { content: { 'application/json': infer Body } }
      ? Body
      : never
    : never;
