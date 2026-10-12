import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeEventStream } from '../src/commands/shared/stream-output.js';
import { createMemoryIO } from './helpers/io.js';

test('event limits preserve split SSE frames, copy heartbeats, and close the iterator', async () => {
  const io = createMemoryIO();
  let closed = false;
  const stream = {
    async *[Symbol.asyncIterator]() {
      try {
        yield ': heartbeat\r\n\r\ndata: fi';
        yield 'rst\r\n\r\ndata: second\n\n';
        yield 'data: third\n\n';
      } finally { closed = true; }
    },
  };
  await writeEventStream(stream, io.out, new AbortController().signal, 1);
  assert.equal(io.stdout(), ': heartbeat\r\n\r\ndata: first\r\n\r\n');
  assert.equal(closed, true);
});

test('unlimited event output keeps exact bytes including partial frames', async () => {
  const io = createMemoryIO();
  const stream = { async *[Symbol.asyncIterator]() { yield 'data: '; yield 'false\n\npartial'; } };
  await writeEventStream(stream, io.out, new AbortController().signal);
  assert.equal(io.stdout(), 'data: false\n\npartial');
});
