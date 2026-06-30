import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { stdin as processStdin } from 'node:process';
import { CliError } from '../../runtime/errors.js';

export async function readText(path: string): Promise<string> {
  if (path === '-') {
    return readStdinText();
  }
  return readFile(path, 'utf8');
}

export function parseJsonString(text: string, label = 'json input'): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`Invalid JSON in ${label}: ${reason}`);
  }
}

export async function readJsonFile(path: string, label = 'json input'): Promise<unknown> {
  return parseJsonString(await readText(path), label);
}

export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of processStdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function writeBinary(path: string, data: Uint8Array): Promise<void> {
  if (path === '-') {
    process.stdout.write(data);
    return;
  }
  await writeFile(path, data);
}

export async function readBlob(path: string): Promise<{ blob: Blob; fileName: string }> {
  if (path === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of processStdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return { blob: new Blob([Buffer.concat(chunks)]), fileName: 'stdin' };
  }
  const data = await readFile(path);
  return { blob: new Blob([data]), fileName: basename(path) };
}

export function parseKeyValueList(values: string[] | undefined): Record<string, unknown> | undefined {
  if (!values || values.length === 0) return undefined;
  const result: Record<string, unknown> = {};
  for (const item of values) {
    const eq = item.indexOf('=');
    if (eq === -1) {
      throw new CliError(`Expected KEY=VALUE, got ${item}`);
    }
    result[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return result;
}
