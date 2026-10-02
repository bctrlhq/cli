import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import { createOperationListCommand } from '../shared/operation.js';

export function createLocationsCommand(factory: Factory): Command {
  const command = new Command('locations').description('Discover compute locations');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'locations.list',
      description: 'List compute locations and availability',
    })
  );
  return command;
}
