import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const SERVER_VERSION = '0.1.0';

export function registerPingTool(server: McpServer) {
	server.registerTool(
		'swarm_tools_ping',
		{
			description: 'Health check for the swarm-tools MCP server.',
			inputSchema: {},
			outputSchema: {
				ok: z.literal(true),
				version: z.string()
			}
		},
		async () => {
			const structuredContent = { ok: true as const, version: SERVER_VERSION };
			return {
				content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
				structuredContent
			};
		}
	);
}
