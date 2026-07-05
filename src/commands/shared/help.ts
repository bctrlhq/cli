import type { Command } from "commander";
import {
  CLI_HELP_COMMANDS,
  type CliHelpCommandId,
} from "../../generated/help.js";

export type CommandHelpField = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  values?: string[];
};

export type CommandHelpFlag = {
  name: string;
  value?: string;
  description: string;
  mapsTo?: string;
};

export type CommandHelpDocLink = {
  title: string;
  url: string;
  markdownUrl?: string;
};

export type CommandHelpSpec = {
  purpose: string;
  docs?: CommandHelpDocLink[];
  flags?: CommandHelpFlag[];
  inputs?: {
    path?: CommandHelpField[];
    query?: CommandHelpField[];
    headers?: CommandHelpField[];
    body?: {
      schema?: string;
      fields?: CommandHelpField[];
      discriminator?: {
        property: string;
        variants: Array<{
          value: string;
          schema?: string;
          summary?: string;
        }>;
      };
    };
  };
  output?: CommandHelpField[];
  examples?: string[];
  next?: string[];
};

export function addStructuredHelp(
  command: Command,
  spec: CommandHelpSpec,
): Command {
  command.addHelpText("after", `\n${renderStructuredHelp(spec)}`);
  return command;
}

export function addCliHelp(
  command: Command,
  commandId: CliHelpCommandId,
): Command {
  return addStructuredHelp(
    command,
    toCommandHelpSpec(CLI_HELP_COMMANDS[commandId]),
  );
}

export function addCliOperationHelp(
  command: Command,
  operationId: string,
): Command {
  return isCliHelpCommandId(operationId)
    ? addCliHelp(command, operationId)
    : command;
}

function isCliHelpCommandId(value: string): value is CliHelpCommandId {
  return value in CLI_HELP_COMMANDS;
}

function toCommandHelpSpec(
  help: (typeof CLI_HELP_COMMANDS)[CliHelpCommandId],
): CommandHelpSpec {
  const raw = help as {
    summary: string;
    cli?: { flags?: readonly CommandHelpFlag[] };
    inputs?: CommandHelpSpec["inputs"];
    output?: { fields: readonly CommandHelpField[] };
    docs?: readonly CommandHelpDocLink[];
    examples?: readonly unknown[];
    next?: readonly unknown[];
  };
  return {
    purpose: raw.summary,
    docs: raw.docs?.map((doc) => ({ ...doc })),
    flags: raw.cli?.flags?.map((flag) => ({ ...flag })),
    inputs: cloneInputs(raw.inputs),
    output: raw.output?.fields.map((field) => ({ ...field })),
    examples: raw.examples
      ?.map(formatHelpItem)
      .filter((value): value is string => Boolean(value)),
    next: raw.next
      ?.map(formatHelpItem)
      .filter((value): value is string => Boolean(value)),
  };
}

function formatHelpItem(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.command === "string") return record.command;
  if (typeof record.topic === "string") return record.topic;
  return undefined;
}

function renderStructuredHelp(spec: CommandHelpSpec): string {
  const sections = [
    renderPurpose(spec.purpose),
    spec.docs && spec.docs.length > 0 ? renderDocs(spec.docs) : "",
    spec.flags && spec.flags.length > 0 ? renderFlags(spec.flags) : "",
    spec.inputs ? renderInputs(spec.inputs) : "",
    spec.output && spec.output.length > 0
      ? renderFields("Output", spec.output)
      : "",
    spec.examples && spec.examples.length > 0
      ? renderList("Examples", spec.examples)
      : "",
    spec.next && spec.next.length > 0 ? renderList("Next", spec.next) : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

function cloneInputs(inputs: CommandHelpSpec["inputs"]): CommandHelpSpec["inputs"] {
  if (!inputs) return undefined;
  return {
    path: inputs.path?.map((field) => ({ ...field })),
    query: inputs.query?.map((field) => ({ ...field })),
    headers: inputs.headers?.map((field) => ({ ...field })),
    body: inputs.body
      ? {
          schema: inputs.body.schema,
          fields: inputs.body.fields?.map((field) => ({ ...field })),
          discriminator: inputs.body.discriminator
            ? {
                property: inputs.body.discriminator.property,
                variants: inputs.body.discriminator.variants.map((variant) => ({ ...variant })),
              }
            : undefined,
        }
      : undefined,
  };
}

function renderDocs(docs: CommandHelpDocLink[]): string {
  return renderList(
    "Docs",
    docs.map((doc) => doc.markdownUrl ?? doc.url),
  );
}

function renderPurpose(purpose: string): string {
  return `Purpose:\n  ${purpose}`;
}

function renderFlags(flags: CommandHelpFlag[]): string {
  const rows = flags.map((flag) => {
    const left = [flag.name, flag.value].filter(Boolean).join(" ");
    const suffix = flag.mapsTo ? ` Maps to ${flag.mapsTo}.` : "";
    return { left, right: `${flag.description}${suffix}` };
  });
  return renderRows("Flags", rows);
}

function renderInputs(inputs: NonNullable<CommandHelpSpec["inputs"]>): string {
  const sections = [
    inputs.path && inputs.path.length > 0 ? renderFields("Path params", inputs.path) : "",
    inputs.query && inputs.query.length > 0 ? renderFields("Query params", inputs.query) : "",
    inputs.headers && inputs.headers.length > 0 ? renderFields("Headers", inputs.headers) : "",
    inputs.body ? renderBodyInput(inputs.body) : "",
  ].filter(Boolean);
  return sections.join("\n\n");
}

function renderBodyInput(body: NonNullable<NonNullable<CommandHelpSpec["inputs"]>["body"]>): string {
  const lines = [
    body.schema ? `Schema: ${body.schema}` : "",
    body.fields && body.fields.length > 0 ? renderFields("Body", body.fields) : "",
    body.discriminator ? renderDiscriminator(body.discriminator) : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function renderDiscriminator(discriminator: NonNullable<NonNullable<NonNullable<CommandHelpSpec["inputs"]>["body"]>["discriminator"]>): string {
  const rows = discriminator.variants.map((variant) => ({
    left: variant.value,
    right: [variant.schema, variant.summary].filter(Boolean).join(" "),
  }));
  return renderRows(`Body variants (${discriminator.property})`, rows);
}

function renderFields(title: string, fields: CommandHelpField[]): string {
  const rows = fields.map((field) => ({
    left: field.name,
    right: [
      field.type,
      field.required === true ? "required" : "optional",
      field.description,
    ]
      .filter(Boolean)
      .join(" "),
  }));
  return renderRows(title, rows);
}

function renderRows(
  title: string,
  rows: Array<{ left: string; right: string }>,
): string {
  const width = Math.max(...rows.map((row) => row.left.length));
  const lines = rows.map((row) => `  ${row.left.padEnd(width)}  ${row.right}`);
  return `${title}:\n${lines.join("\n")}`;
}

function renderList(title: string, lines: string[]): string {
  return `${title}:\n${lines.map((line) => `  ${line}`).join("\n")}`;
}
