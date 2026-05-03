# Agent Notes

This repository implements a self-hosted Markdown-backed MCP memory server.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Type check: `npm run check`
- Build: `npm run build`
- Reindex Markdown vault: `npm run reindex`
- Create client token: `npm run client:create -- --name claude --scopes memory:read,memory:propose`

## Architecture

- `src/server.ts` starts the Streamable HTTP MCP endpoint.
- `src/mcp.ts` registers MCP tools.
- `src/service.ts` performs writes to Markdown and audit logs.
- `src/indexer.ts` parses Markdown and maintains SQLite FTS.
- `src/db.ts` owns schema and client token storage.
- `memory/` is the user-facing source of truth.
- `data/memory.db` is rebuildable metadata/index state.

## Safety constraints

- Do not add shell execution tools.
- Do not add arbitrary filesystem access.
- Keep writes inside `MEMORY_VAULT_PATH`.
- Prefer pending proposals over direct writes for uncertain memory.
