import { hostname } from 'node:os';
import {
  startDeviceAuth as defaultStartDeviceAuth,
  type DeviceStartResponse,
} from '../../api/device-auth.js';

export type DeviceLoginStartDeps = {
  apiBaseUrl: string;
  startDeviceAuth?: typeof defaultStartDeviceAuth;
};

export async function startDeviceLoginSession(
  deps: DeviceLoginStartDeps
): Promise<DeviceStartResponse> {
  const start = deps.startDeviceAuth ?? defaultStartDeviceAuth;
  return start(deps.apiBaseUrl, {
    clientName: 'BCTRL CLI',
    clientKind: 'cli',
    deviceName: safeHostname(),
  });
}

function safeHostname(): string {
  try {
    const name = hostname().trim();
    return name.length > 0 ? name.slice(0, 80) : 'cli';
  } catch {
    return 'cli';
  }
}
