import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { requireScope } from './auth';
import type { AuthContext } from './types';
import { MemoryService } from './service';

const MemoryTypeSchema = z.enum(['preference', 'project_context', 'decision', 'person', 'profile', 'general']);
const ScopeSchema = z.enum(['global', 'project', 'preference', 'decision', 'person', 'profile', 'all']).optional();

const jsonResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as { [key: string]: unknown }
});

const errorResult = (error: unknown) => ({
  content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
  isError: true
});

export const createMemoryMcpServer = (auth: AuthContext, service: MemoryService): McpServer => {
  const server = new McpServer(
    {
      name: 'personal-memory-mcp',
      version: '0.1.0',
      websiteUrl: 'https://example.com/personal-memory-mcp'
    },
    {
      instructions: [
        'This server is the user-owned shared memory vault for durable AI context.',
        'Use search_memory before answering questions that may depend on the user’s preferences, projects, decisions, prior context, or personal workflows.',
        'Use save_memory for durable, low-risk context that is likely to be useful in future sessions, including stable user preferences, project facts, decisions, constraints, corrections, and recurring workflows.',
        'Use propose_memory_update only when you are very unsure, the memory is ambiguous or potentially sensitive, or it would benefit from explicit human review before becoming canonical.',
        'Do not save secrets, credentials, private keys, raw transcripts, one-time details, or sensitive personal information.',
        'Prefer project-specific tools for project-specific context so global memory stays clean.'
      ].join('\n')
    }
  );

  server.registerTool(
    'search_memory',
    {
      title: 'Search memory',
      description:
        'Search the user’s durable memory and return matching chunk previews with metadata, not full file contents. Use this before answering questions that may depend on preferences, projects, decisions, prior context, or workflows. Call get_memory when the full Markdown file is needed.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query.'),
        scope: ScopeSchema.describe('Optional scope filter.'),
        project: z.string().optional().describe('Project slug/name for project-specific search.'),
        limit: z.number().int().min(1).max(25).optional().describe('Max results, default configured by server.'),
        include_pending: z.boolean().optional().describe('Include pending memory candidates in search results.')
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async (input) => {
      try {
        requireScope(auth, 'memory:read');
        return jsonResult({ results: service.search(input) });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'get_memory',
    {
      title: 'Get memory',
      description: 'Retrieve a specific memory item or Markdown memory file by id or file_path.',
      inputSchema: z.object({
        id: z.string().optional().describe('Memory id returned by search_memory.'),
        file_path: z.string().optional().describe('Memory vault relative path such as projects/lattice.md.')
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async (input) => {
      try {
        requireScope(auth, 'memory:read');
        if (!input.id && !input.file_path) throw new Error('Provide either id or file_path.');
        const memory = service.get(input);
        if (!memory) throw new Error('Memory not found. Try search_memory or list_memory_files first.');
        return jsonResult(memory);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'list_memory_files',
    {
      title: 'List memory files',
      description: 'Return a navigable list of Markdown memory files in the vault.',
      inputSchema: z.object({
        scope: z.string().optional().describe('Optional type/status scope such as project_context, preference, decision, pending, or canonical.')
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async (input) => {
      try {
        requireScope(auth, 'memory:read');
        return jsonResult({ files: service.listFiles(input.scope) });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'save_memory',
    {
      title: 'Save memory',
      description:
        'Save durable memory directly to the canonical memory vault. Prefer this for stable, low-risk information that is likely to be useful in future sessions, such as user preferences, project facts, decisions, constraints, corrections, or recurring workflows. Do not save secrets, credentials, sensitive personal data, one-time details, or raw transcripts.',
      inputSchema: z.object({
        type: MemoryTypeSchema,
        title: z.string().min(1),
        content: z.string().min(1),
        project: z.string().optional(),
        tags: z.array(z.string()).optional(),
        source_app: z.string().default(auth.clientName),
        reason: z.string().min(1).describe('Why this is durable enough to save.')
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (input) => {
      try {
        requireScope(auth, 'memory:write');
        return jsonResult(service.saveMemory(input));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'propose_memory_update',
    {
      title: 'Propose memory update',
      description:
        'Propose a memory update by writing to inbox/pending.md. Use this only when you are very unsure, the memory is ambiguous or potentially sensitive, or it should receive explicit human review before becoming canonical. For stable, low-risk durable context, prefer save_memory.',
      inputSchema: z.object({
        type: MemoryTypeSchema,
        title: z.string().min(1),
        content: z.string().min(1),
        project: z.string().optional(),
        tags: z.array(z.string()).optional(),
        source_app: z.string().default(auth.clientName),
        reason: z.string().min(1),
        confidence: z.number().min(0).max(1).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (input) => {
      try {
        requireScope(auth, 'memory:propose');
        return jsonResult(service.proposeMemoryUpdate(input));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'append_project_context',
    {
      title: 'Append project context',
      description:
        'Append project-specific context to projects/<project>.md. Use for project-specific decisions, architecture notes, implementation details, constraints, and open questions.',
      inputSchema: z.object({
        project: z.string().min(1),
        content: z.string().min(1),
        section: z.string().optional(),
        source_app: z.string().default(auth.clientName),
        reason: z.string().min(1)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (input) => {
      try {
        requireScope(auth, 'memory:write');
        return jsonResult(service.appendProjectContext(input));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'record_decision',
    {
      title: 'Record decision',
      description: 'Record a dated, append-only decision file with rationale and consequences.',
      inputSchema: z.object({
        title: z.string().min(1),
        decision: z.string().min(1),
        rationale: z.string().min(1),
        project: z.string().optional(),
        consequences: z.array(z.string()).optional(),
        source_app: z.string().default(auth.clientName)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (input) => {
      try {
        requireScope(auth, 'memory:write');
        return jsonResult(service.recordDecision(input));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'reindex_memory',
    {
      title: 'Reindex memory',
      description: 'Admin-only tool to rebuild the SQLite search index from Markdown files.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      try {
        requireScope(auth, 'memory:admin');
        return jsonResult(service.reindex());
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
};
