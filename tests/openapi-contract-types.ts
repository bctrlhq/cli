import type {
  CliOperationId,
  CliOperationJsonBody,
  CliOperationPathParams,
  CliOperationQuery,
} from '../src/openapi.js';
import type { CLI_OPENAPI_ROUTES } from '../src/generated/openapi-routes.js';
import type { operations as OpenApiOperations } from '../src/generated/openapi-types.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

type OpenApiQuery<OperationId extends keyof OpenApiOperations> =
  OpenApiOperations[OperationId] extends { parameters: { query?: infer Query } }
    ? NonNullable<Query>
    : never;

type OpenApiPathParams<OperationId extends keyof OpenApiOperations> =
  OpenApiOperations[OperationId] extends { parameters: { path?: infer PathParams } }
    ? NonNullable<PathParams>
    : never;

type OpenApiJsonBody<OperationId extends keyof OpenApiOperations> =
  OpenApiOperations[OperationId] extends { requestBody?: infer RequestBody }
    ? NonNullable<RequestBody> extends { content: { 'application/json': infer Body } }
      ? Body
      : never
    : never;

type CliOpenApiContractPairs = [
  Assert<Equal<CliOperationId, keyof typeof CLI_OPENAPI_ROUTES & keyof OpenApiOperations>>,
  Assert<Equal<CliOperationQuery<'spaces.list'>, OpenApiQuery<'spaces.list'>>>,
  Assert<Equal<CliOperationPathParams<'spaces.get'>, OpenApiPathParams<'spaces.get'>>>,
  Assert<Equal<CliOperationJsonBody<'spaces.create'>, OpenApiJsonBody<'spaces.create'>>>,
  Assert<Equal<CliOperationJsonBody<'spaces.update'>, OpenApiJsonBody<'spaces.update'>>>,
  Assert<
    Equal<
      CliOperationJsonBody<'spaces.environment.update'>,
      OpenApiJsonBody<'spaces.environment.update'>
    >
  >,
  Assert<Equal<CliOperationQuery<'runtimes.list'>, OpenApiQuery<'runtimes.list'>>>,
  Assert<Equal<CliOperationPathParams<'runtimes.get'>, OpenApiPathParams<'runtimes.get'>>>,
  Assert<Equal<CliOperationJsonBody<'runtimes.create'>, OpenApiJsonBody<'runtimes.create'>>>,
  Assert<Equal<CliOperationJsonBody<'runtimes.update'>, OpenApiJsonBody<'runtimes.update'>>>,
  Assert<
    Equal<
      CliOperationJsonBody<'runtimes.targets.create'>,
      OpenApiJsonBody<'runtimes.targets.create'>
    >
  >,
];

export type _CliOpenApiContractPairs = CliOpenApiContractPairs;
