import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import { createAuthLoginCommand } from './login.js';
import { createAuthLogoutCommand } from './logout.js';
import { createAuthStatusCommand } from './status.js';
import { createAuthTokenCommand } from './token.js';

export function createAuthCommand(factory: Factory): Command {
  const command = new Command('auth').description('Manage BCTRL authentication');
  command.addCommand(createAuthLoginCommand(factory));
  command.addCommand(createAuthLogoutCommand(factory));
  command.addCommand(createAuthStatusCommand(factory));
  command.addCommand(createAuthTokenCommand(factory));
  return command;
}
