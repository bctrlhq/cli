import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import descriptors from '../generated/commands.json' with { type: 'json' };
import type { Factory } from '../factory.js';
import { CliError } from '../runtime/errors.js';

type Browser = { id?: string; status?: string; currentRun?: {
  status?: string; connections?: { liveViewUrl?: string } | null;
} | null };

export async function openExternalUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new CliError('Expected an HTTP live view URL');
  const program = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url.href] : [url.href];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(program, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new CliError(`Could not open the live view (exit ${code})`)));
  });
}

/** Convenience layered on generated browser operations, keeping the created ID visible on failure. */
export async function openBrowserLiveView(factory: Factory, created: unknown): Promise<void> {
  let browser = created as Browser;
  if (typeof browser?.id !== 'string') throw new CliError('Created browser has no ID');
  const get = descriptors.find((descriptor) => descriptor.operationId === 'browsers.get');
  if (!get) throw new CliError('Generated browser lookup is missing; regenerate the CLI');
  const client = await factory.apiClient();
  const path = get.path.replace(/^\/v1(?=\/|$)/, '').replace(/\{[^}]+\}/g, encodeURIComponent(browser.id));
  const deadline = Date.now() + 120_000;
  while (!browser.currentRun?.connections?.liveViewUrl) {
    if (['failed', 'ended', 'stopped', 'expired'].includes(browser.currentRun?.status ?? browser.status ?? '')) {
      throw new CliError(`Browser ${browser.id} has no active live view`);
    }
    if (Date.now() >= deadline) throw new CliError(`Timed out waiting for browser ${browser.id} live view`);
    await delay(500);
    browser = await client.get<Browser>(path);
  }
  await (factory.openUrl ?? openExternalUrl)(browser.currentRun.connections.liveViewUrl);
}
