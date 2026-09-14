import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPingTool } from './tools/ping';
import { registerSwarmStateTools } from './tools/swarm-state';
import { registerDeriveBranchNameTool } from './tools/derive-branch-name';
import { registerCreateTicketTool } from './tools/create-ticket';
import { registerSwarmPlanBatchTool } from './tools/swarm-plan-batch';
import { registerLinkTicketDependenciesTool } from './tools/link-ticket-dependencies';
import { registerEnsureLocalMigrationsAppliedTool } from './tools/ensure-local-migrations-applied';

const server = new McpServer({
	name: 'swarm-tools',
	version: '0.1.0'
});

registerPingTool(server);
registerSwarmStateTools(server);
registerDeriveBranchNameTool(server);
registerCreateTicketTool(server);
registerSwarmPlanBatchTool(server);
registerLinkTicketDependenciesTool(server);
registerEnsureLocalMigrationsAppliedTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
