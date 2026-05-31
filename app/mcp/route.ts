import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authFromBearerHeader } from '@/src/auth';
import { corsPreflight, withCors } from '@/src/cors';
import { createMemoryMcpServer } from '@/src/mcp';
import { getRuntime } from '@/src/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { db, service } = getRuntime();
  const auth = authFromBearerHeader(db, request.headers.get('authorization'));
  if (!auth) return withCors(Response.json({ error: 'Invalid or missing bearer token' }, { status: 401 }));

  const server = createMemoryMcpServer(auth, service);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } catch (error) {
    console.error('Error handling MCP request:', error);
    return withCors(Response.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null },
      { status: 500 }
    ));
  } finally {
    await transport.close();
    await server.close();
  }
}

export async function GET() {
  return withCors(Response.json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'GET is disabled in stateless JSON mode. Use POST /mcp.' },
    id: null
  }, { status: 405 }));
}

export async function DELETE() {
  return withCors(Response.json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'DELETE is disabled in stateless JSON mode.' },
    id: null
  }, { status: 405 }));
}

export async function OPTIONS() {
  return corsPreflight();
}
