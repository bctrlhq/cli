import { z } from 'zod';
import { CliError } from '../runtime/errors.js';
import { apiErrorFromResponse } from './errors.js';

// Hand-written client for the OAuth 2.0 device-authorization endpoints (RFC 8628).
// These are unauthenticated (the CLI has no credential yet) and intentionally kept
// out of the generated public OpenAPI/SDK (docs-hidden).

const DeviceStartResponseSchema = z
  .object({
    deviceCode: z.string().min(1),
    userCode: z.string().min(1),
    verificationUri: z.string().min(1),
    verificationUriComplete: z.string().min(1),
    expiresIn: z.number().int().positive(),
    interval: z.number().int().positive(),
  })
  .strict();

const DeviceTokenResponseSchema = z
  .object({
    status: z.enum(['authorization_pending', 'access_denied', 'expired_token', 'complete']),
    token: z.string().optional(),
  })
  .strict();

const DeviceSessionRevokeResponseSchema = z.object({ revoked: z.boolean() }).strict();

export type DeviceStartResponse = z.infer<typeof DeviceStartResponseSchema>;
type DeviceSessionRevokeResponse = z.infer<typeof DeviceSessionRevokeResponseSchema>;

/**
 * Poll outcome. The control-plane returns the RFC 8628 polling states as a 200
 * status union; a 429 (rate limiter) is surfaced as `rate_limited` so the poll
 * loop can back off rather than treating it as a hard failure.
 */
export type DevicePollResult =
  | { status: 'authorization_pending' }
  | { status: 'access_denied' }
  | { status: 'expired_token' }
  | { status: 'rate_limited' }
  | { status: 'complete'; token: string };

function deviceEndpoint(apiBaseUrl: string, path: string): URL {
  return new URL(`${apiBaseUrl.replace(/\/+$/, '')}${path}`);
}

export async function startDeviceAuth(
  apiBaseUrl: string,
  body: { clientName?: string; clientKind?: 'cli' | 'mcp'; deviceName?: string } = {}
): Promise<DeviceStartResponse> {
  const response = await fetch(deviceEndpoint(apiBaseUrl, '/auth/device'), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'BCTRL CLI',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await apiErrorFromResponse(response, 'BCTRL device login');
  }

  const parsed = DeviceStartResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new CliError(`BCTRL device login returned an unexpected response: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function pollDeviceAuth(
  apiBaseUrl: string,
  deviceCode: string
): Promise<DevicePollResult> {
  const response = await fetch(deviceEndpoint(apiBaseUrl, '/auth/device/token'), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'BCTRL CLI',
    },
    body: JSON.stringify({ deviceCode }),
  });

  // The poll route is rate-limited; a 429 is expected under fast polling and just
  // means "back off and keep waiting", not a terminal error.
  if (response.status === 429) {
    return { status: 'rate_limited' };
  }
  if (!response.ok) {
    throw await apiErrorFromResponse(response, 'BCTRL device login');
  }

  const parsed = DeviceTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new CliError(`BCTRL device login returned an unexpected response: ${parsed.error.message}`);
  }

  if (parsed.data.status === 'complete') {
    if (!parsed.data.token) {
      throw new CliError('BCTRL device login completed without returning a token.');
    }
    return { status: 'complete', token: parsed.data.token };
  }
  return { status: parsed.data.status };
}

export async function revokeDeviceSession(
  apiBaseUrl: string,
  token: string
): Promise<DeviceSessionRevokeResponse> {
  const response = await fetch(deviceEndpoint(apiBaseUrl, '/auth/device/session'), {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': 'BCTRL CLI',
    },
  });

  if (!response.ok) {
    throw await apiErrorFromResponse(response, 'BCTRL device logout');
  }

  const parsed = DeviceSessionRevokeResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new CliError(`BCTRL device logout returned an unexpected response: ${parsed.error.message}`);
  }
  return parsed.data;
}
