import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
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

/** Writes a binary response as it arrives; a slow destination slows the read. */
export async function writeBinary(path: string, data: ReadableStream<Uint8Array>): Promise<void> {
  const source = Readable.fromWeb(data as WebReadableStream<Uint8Array>);
  if (path === '-') {
    for await (const chunk of source) {
      if (!process.stdout.write(chunk)) await once(process.stdout, 'drain');
    }
    return;
  }
  await pipeline(source, createWriteStream(path));
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
