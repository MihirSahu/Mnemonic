import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { authMiddleware, type AuthedRequest } from './auth.js';
import { bootstrapAdminClient, openDatabase } from './db.js';
import { MemoryService } from './service.js';
import { createMemoryMcpServer } from './mcp.js';

const db = openDatabase(config.databasePath);
bootstrapAdminClient(db, config.adminToken);

const service = new MemoryService(db, {
  vaultPath: config.vaultPath,
  gitEnabled: config.gitEnabled,
  defaultSearchLimit: config.defaultSearchLimit
});
service.init();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: config.corsOrigin,
    exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'Last-Event-Id', 'Mcp-Protocol-Version']
  })
);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, name: 'personal-memory-mcp', public_url: config.publicUrl });
});

app.post('/mcp', authMiddleware(db), async (req: AuthedRequest, res: Response) => {
  const auth = req.authContext;
  if (!auth) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const server = createMemoryMcpServer(auth, service);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

app.get('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'GET is disabled in stateless JSON mode. Use POST /mcp.' },
    id: null
  });
});

app.delete('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'DELETE is disabled in stateless JSON mode.' },
    id: null
  });
});

app.listen(config.port, (error?: Error) => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`Personal Memory MCP listening on ${config.publicUrl}/mcp`);
  console.log(`Vault: ${config.vaultPath}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down Personal Memory MCP...');
  db.close();
  process.exit(0);
});
