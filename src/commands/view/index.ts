import { Command } from "commander";
import type { Factory } from "../../factory.js";
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
} from "../shared/operation.js";

export function createViewsCommand(factory: Factory): Command {
  const command = new Command("view").description(
    "Manage expiring human-facing views",
  );

  command.addCommand(
    createOperationListCommand(factory, {
      operationId: "views.list",
      description: "List active views",
    }),
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: "views.create",
      name: "create",
      description:
        "Create a hosted link or origin-restricted website embed (pass scope, components, presentation, and TTL with --body)",
    }),
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: "views.get",
      name: "get",
      description: "Get a view",
      argName: "viewId",
    }),
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: "views.delete",
      description: "Revoke a view",
      argNames: ["viewId"],
    }),
  );

  return command;
}
