import type { Readable } from 'node:stream';
import type { IOStreams } from '../../io/streams.js';
import { CliError } from '../../runtime/errors.js';

type RawReadable = Readable & {
  setRawMode?: (mode: boolean) => void;
};

export async function readHiddenInput(io: IOStreams, prompt: string): Promise<string> {
  if (!io.canPrompt()) {
    throw new CliError('Cannot prompt for an API key in this terminal. Use: bctrl auth login --with-token');
  }

  const input = io.in as RawReadable;
  if (typeof input.setRawMode !== 'function') {
    throw new CliError('This terminal does not support hidden input. Use: bctrl auth login --with-token');
  }
  const setRawMode = input.setRawMode.bind(input);

  io.writeErr(prompt);

  return new Promise((resolve, reject) => {
    let value = '';
    let settled = false;
    let onData: (chunk: Buffer | string) => void;

    const cleanup = () => {
      input.off('data', onData);
      setRawMode(false);
      input.pause();
      io.writeErr('\n');
    };

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    onData = (chunk: Buffer | string) => {
      const text = chunk.toString('utf8');
      for (const char of text) {
        if (char === '\u0003') {
          fail(new CliError('Authentication cancelled'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish(value.trim());
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') {
          value += char;
        }
      }
    };

    setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}
