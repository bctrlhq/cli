import { Command } from "commander";
import type { Factory } from "../../factory.js";
import {
  addPaginationFlags,
  buildOperationInput,
  outputFlags,
  requestOperationAndPrint,
} from "../shared/operation.js";
import { addOutputFlags, type OutputFlags } from "../shared/output.js";

export function createSpaceListCommand(factory: Factory): Command {
  return addOutputFlags(
    addPaginationFlags(
      new Command("list")
        .description("List spaces")
        .option("--subaccount <id>", "Filter by subaccount id")
        .option(
          "--params <json>",
          "Path/query parameters as a JSON object (inline, @file, or - for stdin)",
        ),
    ),
  ).action(
    async (
      options: {
        subaccount?: string;
        limit?: number;
        cursor?: string;
        params?: string;
      } & OutputFlags,
    ) => {
      await requestOperationAndPrint(
        factory,
        "spaces.list",
        await buildOperationInput("spaces.list", options, {
          query: {
            limit: options.limit,
            cursor: options.cursor,
          },
          actingSubaccountId: options.subaccount,
          output: outputFlags(options),
        }),
      );
    },
  );
}
