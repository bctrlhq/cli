import { once } from 'node:events';
import type { Writable } from 'node:stream';

// Keep SSE frames intact across arbitrary network chunks. Heartbeats are copied
// without consuming the event budget. Returning closes the transport iterator.
export async function writeEventStream(
  stream: AsyncIterable<string>, out: Writable, signal: AbortSignal, maxEvents?: number
): Promise<void> {
  let pending = '';
  let events = 0;
  const write = async (value: string): Promise<void> => {
    if (!out.write(value)) await once(out, 'drain', { signal });
  };
  for await (const chunk of stream) {
    if (maxEvents === undefined) {
      await write(chunk);
      continue;
    }
    pending += chunk;
    for (;;) {
      const separator = /\r\n\r\n|\n\n|\r\r/.exec(pending);
      if (!separator) break;
      const frame = pending.slice(0, separator.index + separator[0].length);
      pending = pending.slice(frame.length);
      await write(frame);
      if (/(?:^|\r\n|\n|\r)data:/.test(frame) && ++events >= maxEvents) return;
    }
  }
  if (pending) await write(pending);
}
