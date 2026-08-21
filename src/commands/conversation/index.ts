import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import {
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  streamOperationText,
} from '../shared/operation.js';

export function createConversationCommand(factory: Factory): Command {
  const command = new Command('conversations').description('Converse with runtime agents');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'conversations.list',
      description: 'List conversations',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'conversations.create',
      name: 'create',
      description: 'Create a conversation',
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'conversations.get',
      name: 'get',
      description: 'Get a conversation and its messages',
      argName: 'conversationId',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'conversations.update',
      name: 'patch',
      description: 'Update the model, toolset, or title',
      argNames: ['conversationId'],
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'conversations.messages.create',
      name: 'message',
      description: 'Send a message and start an agent turn',
      argNames: ['conversationId'],
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'conversations.cancel',
      name: 'cancel',
      description: 'Cancel the active agent turn',
      argNames: ['conversationId'],
    })
  );
  command.addCommand(
    new Command('stream')
      .description('Stream normalized conversation events')
      .argument('<conversationId>')
      .option('--after <cursor>', 'Resume after a stream cursor')
      .action(async (conversationId: string, options: { after?: string }) => {
        const stream = await streamOperationText(factory, 'conversations.stream', {
          pathParams: { conversationId },
          query: { after: options.after },
        });
        for await (const chunk of stream) factory.io.writeOut(chunk);
      })
  );
  return command;
}
