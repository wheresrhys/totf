import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPingTool } from './tools/ping';
import { registerSwarmStateTools } from './tools/swarm-state';
import { registerDeriveBranchNameTool } from './tools/derive-branch-name';
import { registerCreateTicketTool } from './tools/create-ticket';
import { registerResolveMigrationDmlTool } from './tools/resolve-migration-dml';
import { registerResolveWorkItemTool } from './tools/resolve-work-item';
import { registerSwarmPlanBatchTool } from './tools/swarm-plan-batch';
import { registerLinkTicketDependenciesTool } from './tools/link-ticket-dependencies';
import { registerApplySchemaMigrationTool } from './tools/apply-schema-migration';

const server = new McpServer({
	name: 'swarm-tools',
	version: '0.1.0'
});

registerPingTool(server);
registerSwarmStateTools(server);
registerDeriveBranchNameTool(server);
registerCreateTicketTool(server);
registerResolveMigrationDmlTool(server);
registerResolveWorkItemTool(server);
registerSwarmPlanBatchTool(server);
registerLinkTicketDependenciesTool(server);
registerApplySchemaMigrationTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
