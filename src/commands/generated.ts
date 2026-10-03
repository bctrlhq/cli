import { Command, Option } from 'commander';
import { z } from 'zod';
import descriptors from '../generated/commands.json' with { type: 'json' };
import type { Factory } from '../factory.js';
import type { JsonRequestOptions } from '../api/client.js';
import { CliError } from '../runtime/errors.js';
import { addOutputFlags, outputData, type OutputFlags } from './shared/output.js';
import { readBlob, readJsonFile, writeBinary } from './shared/io.js';
import { withoutSchemaDefaults } from './shared/schema.js';

type Schema = Record<string, any>;
type Descriptor = (typeof descriptors)[number];
type FieldFlag = { attribute: string; group: string; name: string; schema: Schema };

function resolveSchema(schema: Schema, root: Schema): Schema {
  if (typeof schema.$ref !== 'string') return schema;
  const name = schema.$ref.replace('#/$defs/', '');
  const resolved = root.$defs?.[name];
  if (!resolved) throw new Error(`Missing CLI input definition: ${schema.$ref}`);
  return resolved;
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

async function jsonArgument(value: string): Promise<unknown> {
  if (value === '-') return readJsonFile('-');
  if (value.startsWith('@')) return readJsonFile(value.slice(1));
  try { return JSON.parse(value); }
  catch { throw new CliError('Expected JSON, @file, or - for stdin'); }
}

function fieldValue(value: string, schema: Schema): unknown {
  if (schema.type === 'string') return value;
  try { return JSON.parse(value); }
  catch { throw new CliError(`Expected a JSON value for this ${schema.type ?? 'schema'} field`); }
}

function addFieldFlags(command: Command, descriptor: Descriptor): FieldFlag[] {
  const root = descriptor.inputSchema as Schema;
  const flags: FieldFlag[] = [];
  for (const group of ['query', 'headers', 'body', 'fields']) {
    const groupSchema = root.properties[group];
    if (!groupSchema) continue;
    for (const [name, unresolved] of Object.entries(resolveSchema(groupSchema, root).properties ?? {})) {
      const schema = resolveSchema(unresolved as Schema, root);
      const variants = schema.anyOf ?? schema.oneOf;
      const flagSchema = Array.isArray(variants) && variants.every((variant) => resolveSchema(variant, root).type === 'string')
        ? { ...schema, type: 'string' } : schema;
      let flag = kebab(name);
      if (command.options.some((option) => option.long === `--${flag}`)) flag = `${group}-${flag}`;
      const option = new Option(`--${flag} <value>`, schema.description ?? `${group}.${name}`);
      command.addOption(option);
      flags.push({ attribute: option.attributeName(), group, name, schema: flagSchema });
    }
  }
  return flags;
}

/** All API leaves, including future resources, come exclusively from annotations. */
export function registerGeneratedCommands(root: Command, factory: Factory): void {
  for (const descriptor of descriptors) {
    const segments = descriptor.cli.command.split(' ');
    let command = root;
    for (const segment of segments) {
      let child = command.commands.find((candidate) => candidate.name() === segment);
      if (!child) {
        child = new Command(segment);
        command.addCommand(child);
      }
      command = child;
    }
    command.description(`${descriptor.stability === 'preview' ? 'Preview. ' : ''}${descriptor.description}`);
    for (const name of descriptor.cli.positionalArgs) command.argument(`<${name}>`);
    const schema = descriptor.inputSchema as Schema;
    for (const group of ['query', 'headers', 'body', 'fields']) {
      if (schema.properties[group]) command.option(`--${group} <json>`, `${group} JSON (inline, @file, or - for stdin)`);
    }
    if ((descriptor.requestContentTypes as string[]).includes('multipart/form-data')) command.option('--file <path>', 'Upload a file (- for stdin)');
    const binary = !descriptor.stream && descriptor.responseContentTypes.length > 0
      && !descriptor.responseContentTypes.some((type) => type === 'application/json');
    if (binary) command.option('--output <path>', 'Write downloaded bytes (- for stdout)', '-');
    addOutputFlags(command);
    const flags = addFieldFlags(command, descriptor);
    const validator = z.fromJSONSchema(withoutSchemaDefaults(schema) as Parameters<typeof z.fromJSONSchema>[0]);
    command.action(async (...args: unknown[]) => {
      const options = args.at(-2) as Record<string, string | boolean>;
      const input: Record<string, any> = {};
      descriptor.cli.positionalArgs.forEach((name, index) => { input[name] = args[index]; });
      for (const group of ['query', 'headers', 'body', 'fields']) {
        if (typeof options[group] === 'string') input[group] = await jsonArgument(options[group] as string);
      }
      for (const flag of flags) {
        const value = options[flag.attribute];
        if (typeof value !== 'string') continue;
        if (input[flag.group] !== undefined && (typeof input[flag.group] !== 'object' || input[flag.group] === null || Array.isArray(input[flag.group]))) {
          throw new CliError(`--${flag.group} must be an object when field flags are used`);
        }
        (input[flag.group] ??= {})[flag.name] = fieldValue(value, flag.schema);
      }
      let upload: Awaited<ReturnType<typeof readBlob>> | undefined;
      if (typeof options.file === 'string') {
        if (input.body !== undefined) throw new CliError('Choose --file or --body for this request');
        upload = await readBlob(options.file);
        input.fileBase64 = Buffer.from(await upload.blob.arrayBuffer()).toString('base64');
      }
      const valid = validator.safeParse(input);
      if (!valid.success) throw new CliError(`Invalid request: ${valid.error.message}`);
      const path = descriptor.path.replace(/^\/v1(?=\/|$)/, '')
        .replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(input[name])));
      const client = await factory.apiClient();
      const request: JsonRequestOptions = {
        ...(input.query !== undefined ? { query: input.query } : {}),
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
      };
      if (upload) {
        await outputData(factory.io, await client.uploadFile(path, {
          ...request, file: upload.blob, fileName: upload.fileName, fields: input.fields,
        }), options as OutputFlags);
      } else if (descriptor.stream) {
        for await (const chunk of await client.streamText(path, request)) factory.io.writeOut(chunk);
      } else if (binary) {
        await writeBinary(String(options.output), await client.download(path, request));
      } else {
        const method = descriptor.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
        await outputData(factory.io, await client[method](path, request), options as OutputFlags);
      }
    });
  }
}
