import { z } from 'zod';
import { CliError } from '../runtime/errors.js';
import { apiErrorFromResponse } from './errors.js';

const AuthEffectiveScopeSchema = z
  .object({
    scope: z.enum(['organization', 'subaccount']),
    organizationId: z.string().min(1),
    subaccountId: z.string().min(1).nullable(),
    defaultSpaceId: z.string().min(1).nullable(),
  })
  .strict();

export const AuthWhoamiSchema = z
  .object({
    email: z.string().email().nullable().optional(),
    scope: z.enum(['organization', 'subaccount']),
    organizationId: z.string().min(1),
    subaccountId: z.string().min(1).nullable(),
    defaultSpaceId: z.string().min(1).nullable(),
    effectiveScope: AuthEffectiveScopeSchema,
    keyId: z.string().min(1),
    plan: z.string().min(1),
  })
  .strict();

export type AuthWhoami = z.infer<typeof AuthWhoamiSchema>;

export async function validateAuthToken(apiBaseUrl: string, token: string): Promise<AuthWhoami> {
  const response = await fetch(new URL(`${apiBaseUrl.replace(/\/+$/, '')}/auth/whoami`), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': 'BCTRL CLI',
    },
  });

  if (!response.ok) {
    throw await apiErrorFromResponse(response, 'BCTRL auth validation');
  }

  const body = AuthWhoamiSchema.safeParse(await response.json());
  if (!body.success) {
    throw new CliError(`BCTRL auth validation returned an unexpected response: ${body.error.message}`);
  }

  return body.data;
}
