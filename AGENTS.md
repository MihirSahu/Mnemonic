# Agent Notes

This repository implements a self-hosted Markdown-backed MCP memory server.

## Commands

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Type check: `pnpm check`
- Build: `pnpm build`
- Test: `pnpm test`
- Stdio MCP server: `pnpm stdio`
- Reindex Markdown vault: `pnpm reindex`
- Create client token: `pnpm client:create -- --name claude --scopes memory:read,memory:propose`

## Architecture

- `app/mcp/route.ts` serves the Streamable HTTP MCP endpoint.
- `app/api/admin/` contains the web admin APIs.
- `app/(admin)/` contains the authenticated settings UI.
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
