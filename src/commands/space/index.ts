import { Command } from "commander";
import type { Factory } from "../../factory.js";
import {
  buildOperationInput,
  outputFlags,
  requestOperationAndPrint,
} from "../shared/operation.js";
import { addOutputFlags, type OutputFlags } from "../shared/output.js";
import { CliError } from "../../runtime/errors.js";
import { createSpaceListCommand } from "./list.js";

export function createSpaceCommand(factory: Factory): Command {
  const command = new Command("space").description("Manage BCTRL spaces");
  command.addCommand(createSpaceListCommand(factory));
  command.addCommand(
    addOutputFlags(
      new Command("get")
        .description("View a space")
        .argument("<spaceId>")
        .option(
          "--params <json>",
          "Path/query parameters as a JSON object (inline, @file, or - for stdin)",
        ),
    ).action(
      async (spaceId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          "spaces.get",
          await buildOperationInput("spaces.get", options, {
            pathParams: { spaceId },
            output: outputFlags(options),
          }),
        );
      },
    ),
  );
  command.addCommand(
    addOutputFlags(
      new Command("create")
        .description("Create a space")
        .option("--name <name>", "Space name")
        .option("--subaccount-id <id>", "Subaccount id")
        .option(
          "--params <json>",
          "Path/query parameters as a JSON object (inline, @file, or - for stdin)",
        )
        .option(
          "--body <json>",
          "Request body as JSON (inline, @file, or - for stdin)",
        ),
    ).action(
      async (
        options: {
          name?: string;
          subaccountId?: string;
          params?: string;
          body?: string;
        } & OutputFlags,
      ) => {
        await requestOperationAndPrint(
          factory,
          "spaces.create",
          await buildOperationInput("spaces.create", options, {
            body: {
              name: options.name,
            },
            actingSubaccountId: options.subaccountId,
            output: outputFlags(options),
          }),
        );
      },
    ),
  );
  command.addCommand(
    addOutputFlags(
      new Command("patch")
        .description("Edit a space")
        .argument("<spaceId>")
        .option("--name <name>", "Space name")
        .option(
          "--params <json>",
          "Path/query parameters as a JSON object (inline, @file, or - for stdin)",
        )
        .option(
          "--body <json>",
          "Request body as JSON (inline, @file, or - for stdin)",
        ),
    ).action(
      async (
        spaceId: string,
        options: {
          name?: string;
          params?: string;
          body?: string;
        } & OutputFlags,
      ) => {
        await requestOperationAndPrint(
          factory,
          "spaces.update",
          await buildOperationInput("spaces.update", options, {
            pathParams: { spaceId },
            body: { name: options.name },
            output: outputFlags(options),
          }),
        );
      },
    ),
  );
  command.addCommand(
    addOutputFlags(
      new Command("delete")
        .description("Delete a space")
        .argument("<spaceId>")
        .option("-y, --yes", "Confirm deletion")
        .option(
          "--params <json>",
          "Path/query parameters as a JSON object (inline, @file, or - for stdin)",
        ),
    ).action(
      async (
        spaceId: string,
        options: { yes?: boolean; params?: string } & OutputFlags,
      ) => {
        if (options.yes !== true) {
          throw new CliError("Refusing to delete without --yes");
        }
        await requestOperationAndPrint(
          factory,
          "spaces.delete",
          await buildOperationInput("spaces.delete", options, {
            pathParams: { spaceId },
            output: outputFlags(options),
          }),
        );
      },
    ),
  );
  command.addCommand(createSpaceEnvironmentCommand(factory));
  return command;
}

function createSpaceEnvironmentCommand(factory: Factory): Command {
  const command = new Command("env").description("Manage a space environment");
  command.addCommand(
    addOutputFlags(
      new Command("get")
        .description("Get a space environment")
        .argument("<spaceId>")
        .option(
          "--params <json>",
          "Path/query parameters as a JSON object (inline, @file, or - for stdin)",
        ),
    ).action(
      async (spaceId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          "spaces.environment.get",
          await buildOperationInput("spaces.environment.get", options, {
            pathParams: { spaceId },
            output: outputFlags(options),
          }),
        );
      },
    ),
  );
  command.addCommand(
    addOutputFlags(
      new Command("patch")
        .description("Update a space environment")
        .argument("<spaceId>")
        .option(
          "--params <json>",
          "Path/query parameters as a JSON object (inline, @file, or - for stdin)",
        )
        .option(
          "--body <json>",
          "Request body as JSON (inline, @file, or - for stdin)",
        ),
    ).action(
      async (
        spaceId: string,
        options: { params?: string; body?: string } & OutputFlags,
      ) => {
        await requestOperationAndPrint(
          factory,
          "spaces.environment.update",
          await buildOperationInput("spaces.environment.update", options, {
            pathParams: { spaceId },
            body: {},
            output: outputFlags(options),
          }),
        );
      },
    ),
  );
  return command;
}
