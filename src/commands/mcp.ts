import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Command, Option } from 'commander';
import type { Factory } from '../factory.js';
import { CliError } from '../runtime/errors.js';

const targets = {
  'claude-code': { file: '.mcp.json', key: 'mcpServers', type: 'http' },
  cursor: { file: '.cursor/mcp.json', key: 'mcpServers', type: undefined },
  vscode: { file: '.vscode/mcp.json', key: 'servers', type: 'http' },
} as const;

type Target = keyof typeof targets;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createMcpCommand(factory: Factory): Command {
  const command = new Command('mcp').description('Configure an MCP client');
  command.command('install')
    .description('Install BCTRL in the current project; authenticate through your MCP client')
    .addOption(new Option('--target <client>', 'MCP client').choices(Object.keys(targets)).makeOptionMandatory())
    .option('--config <path>', 'Configuration file (defaults to the target project file)')
    .option('--url <url>', 'MCP server URL (defaults to the configured API origin)')
    .option('--force', 'Replace an existing BCTRL server entry')
    .action(async (options: { target: Target; config?: string; url?: string; force?: boolean }) => {
      const target = targets[options.target];
      const destination = path.resolve(options.config ?? target.file);
      const url = options.url ? new URL(options.url) : new URL('/mcp', (await factory.config()).apiBaseUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new CliError('Expected an HTTP MCP URL without embedded credentials');
      }
      let config: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(destination, 'utf8'));
        if (!object(parsed)) throw new CliError('MCP configuration must be a JSON object');
        config = parsed;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          if (error instanceof CliError) throw error;
          throw new CliError('Could not read MCP configuration as JSON');
        }
      }
      const current = config[target.key];
      if (current !== undefined && !object(current)) throw new CliError(`${target.key} must be an object`);
      const servers = { ...(current as Record<string, unknown> | undefined) };
      const entry = { ...(target.type ? { type: target.type } : {}), url: url.href };
      if (servers.bctrl !== undefined && JSON.stringify(servers.bctrl) !== JSON.stringify(entry) && !options.force) {
        throw new CliError('BCTRL is already configured differently; use --force to replace its entry');
      }
      servers.bctrl = entry;
      config[target.key] = servers;
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, destination);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      factory.io.writeOut(`Installed BCTRL for ${options.target}: ${destination}\n`);
    });
  return command;
}
