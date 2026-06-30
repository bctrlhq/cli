import { PassThrough } from 'node:stream';
import { createIOStreams, type IOStreams } from '../../src/io/streams.js';

export type MemoryIO = IOStreams & {
  stdout: () => string;
  stderr: () => string;
};

export function createMemoryIO(input = ''): MemoryIO {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];

  stdout.on('data', (chunk: Buffer | string) => {
    outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  stderr.on('data', (chunk: Buffer | string) => {
    errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  stdin.end(input);

  const io = createIOStreams({
    in: stdin,
    out: stdout,
    err: stderr,
    env: { NO_COLOR: '1' },
  }) as MemoryIO;

  io.stdout = () => Buffer.concat(outChunks).toString('utf8');
  io.stderr = () => Buffer.concat(errChunks).toString('utf8');

  return io;
}
