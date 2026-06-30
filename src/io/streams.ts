import type { Readable, Writable } from 'node:stream';
import { isatty } from 'node:tty';

export type IOStreams = {
  in: Readable;
  out: Writable;
  err: Writable;
  isStdinTTY: () => boolean;
  isStdoutTTY: () => boolean;
  isStderrTTY: () => boolean;
  canPrompt: () => boolean;
  colorEnabled: () => boolean;
  writeOut: (text: string) => void;
  writeErr: (text: string) => void;
};

type IOStreamsOptions = {
  in: Readable;
  out: Writable;
  err: Writable;
  env?: NodeJS.ProcessEnv;
};

function streamIsTTY(stream: unknown, fallbackFd?: number): boolean {
  if (typeof (stream as { isTTY?: unknown }).isTTY === 'boolean') {
    return Boolean((stream as { isTTY: boolean }).isTTY);
  }
  return fallbackFd === undefined ? false : isatty(fallbackFd);
}

export function createIOStreams(options: IOStreamsOptions): IOStreams {
  const env = options.env ?? process.env;

  const io: IOStreams = {
    in: options.in,
    out: options.out,
    err: options.err,
    isStdinTTY: () => streamIsTTY(options.in, 0),
    isStdoutTTY: () => streamIsTTY(options.out, 1),
    isStderrTTY: () => streamIsTTY(options.err, 2),
    canPrompt: () =>
      io.isStdinTTY() && io.isStdoutTTY() && env.BCTRL_PROMPT_DISABLED !== '1',
    colorEnabled: () => {
      if (env.NO_COLOR !== undefined) return false;
      if (env.CLICOLOR_FORCE && env.CLICOLOR_FORCE !== '0') return true;
      if (env.CLICOLOR === '0') return false;
      return io.isStdoutTTY();
    },
    writeOut: (text: string) => {
      options.out.write(text);
    },
    writeErr: (text: string) => {
      options.err.write(text);
    },
  };

  return io;
}

export function createSystemIOStreams(): IOStreams {
  return createIOStreams({
    in: process.stdin,
    out: process.stdout,
    err: process.stderr,
  });
}
