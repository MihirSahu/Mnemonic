import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authFromBearerHeader } from './auth';
import { config } from './config';
import { bootstrapAdminClient, openDatabase } from './db';
import { createMemoryMcpServer } from './mcp';
import { MemoryService } from './service';

const token = process.env.MEMORY_STDIO_TOKEN ?? config.adminToken;

if (!token) {
  console.error('Set MEMORY_STDIO_TOKEN or MEMORY_ADMIN_TOKEN before starting stdio MCP.');
  process.exit(1);
}

const db = openDatabase(config.databasePath);
bootstrapAdminClient(db, config.adminToken);

const auth = authFromBearerHeader(db, `Bearer ${token}`);
if (!auth) {
  console.error('The configured stdio token does not match any MCP client.');
  db.close();
  process.exit(1);
}

const service = new MemoryService(db, {
  vaultPath: config.vaultPath,
  gitEnabled: config.gitEnabled,
  defaultSearchLimit: config.defaultSearchLimit
});
service.init();

const server = createMemoryMcpServer(auth, service);
const transport = new StdioServerTransport();

const shutdown = async () => {
  await server.close();
  db.close();
};

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

await server.connect(transport);
console.error(`Personal Memory MCP stdio running as ${auth.clientName}`);
