import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPingTool } from './tools/ping';

const server = new McpServer({
	name: 'swarm-tools',
	version: '0.1.0'
});

registerPingTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
