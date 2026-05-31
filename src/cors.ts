import { config } from './config';

const exposedHeaders = ['WWW-Authenticate', 'Mcp-Session-Id', 'Last-Event-Id', 'Mcp-Protocol-Version'];
const allowedHeaders = ['Authorization', 'Content-Type', 'Accept', 'Mcp-Protocol-Version', 'Mcp-Session-Id', 'Last-Event-Id'];

export const applyCorsHeaders = (headers: Headers): void => {
  headers.set('Access-Control-Allow-Origin', config.corsOrigin);
  headers.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  headers.set('Access-Control-Expose-Headers', exposedHeaders.join(', '));
};

export const withCors = (response: Response): Response => {
  applyCorsHeaders(response.headers);
  return response;
};

export const corsPreflight = (): Response => {
  const response = new Response(null, { status: 204 });
  applyCorsHeaders(response.headers);
  return response;
};
