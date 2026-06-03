# Personal Memory MCP

A self-hosted, Markdown-backed MCP memory server for sharing durable context across AI apps.

This project implements the MVP from the PRD:

- Remote MCP endpoint at `/mcp`
- Web admin console for settings and memory review
- Markdown memory vault as the source of truth
- SQLite metadata, audit log, and FTS search index
- Bearer-token auth with per-client scopes
- Read tools and write tools separated
- Pending-memory proposal flow
- Project-specific memory and decision logs
- Docker Compose deployment

## Current status

This is an MVP implementation. It intentionally does **not** include daily/weekly synthesis, background dreaming, browser capture, or automatic transcript ingestion.

## Architecture

```text
Claude / ChatGPT / Cursor / Claude Code / other MCP clients
        │
        │ POST /mcp
        ▼
Next.js app on :3000
        ▲
        │ Browser admin console
        │ /login, /clients, /pending, /memory, /audit, /system
        ▼
Markdown vault + SQLite metadata/index/audit/session DB
```

The app is a single Next.js service. App Router route handlers serve the Streamable HTTP MCP endpoint, admin APIs, and health checks. The browser admin console uses the same SQLite database and Markdown vault as the MCP tools.

## Memory vault structure

```text
memory/
  MEMORY.md
  profile.md
  preferences/
  projects/
  decisions/
  people/
  inbox/
    pending.md
  archive/
```

Markdown files are human-readable and editable. SQLite can be rebuilt from Markdown with `pnpm reindex`.

## Tools exposed

### Read tools

- `search_memory`: searches durable memory and returns matching chunk previews with metadata, not full Markdown file contents.
- `get_memory`: fetches a full memory item or Markdown file by id or file path.
- `list_memory_files`: lists memory files with metadata only.

### Write/proposal tools

- `save_memory`
- `propose_memory_update`
- `append_project_context`
- `record_decision`

### Admin tools

- `reindex_memory`

## Scopes

- `memory:read`
- `memory:write`
- `memory:propose`
- `memory:admin`

Suggested clients:

```text
chatgpt: memory:read,memory:propose
claude: memory:read,memory:propose,memory:write
local-agent: memory:read,memory:write,memory:propose,memory:admin
```

## Local setup

This project uses `pnpm`.

### 1. Copy env file

```bash
cp .env.example .env
```

Edit `.env` and set a strong `MEMORY_ADMIN_TOKEN`.

Important environment variables:

```env
PORT=3000
PUBLIC_URL=http://localhost:3000
MEMORY_VAULT_PATH=./memory
DATABASE_PATH=./data/memory.db
MEMORY_ADMIN_TOKEN=change-me
GIT_ENABLED=false
DEFAULT_SEARCH_LIMIT=8
CORS_ORIGIN=*
# Optional: use a narrower client token for stdio instead of MEMORY_ADMIN_TOKEN.
# MEMORY_STDIO_TOKEN=
```

### 2. Install dependencies

```bash
corepack enable
pnpm install
```

### 3. Run dev server

```bash
pnpm dev
```

The app listens at:

```text
http://localhost:3000/mcp
```

The admin console is available at:

```text
http://localhost:3000
```

Sign in with a client token that has `memory:admin`; the initial admin token is `MEMORY_ADMIN_TOKEN`.

Health check:

```bash
curl http://localhost:3000/health
```

## Docker setup

```bash
cp .env.example .env
# edit MEMORY_ADMIN_TOKEN

docker compose up --build
```

Docker Compose runs one service on port `3000` and mounts:

- `./memory:/app/memory`
- `./data:/app/data`

Use `PUBLIC_URL` and `CORS_ORIGIN` to match the URL and browser origins exposed by your deployment.

## Admin console

Open `http://localhost:3000` and sign in with any client token that has `memory:admin`.

Admin pages:

- `/system` shows runtime configuration, counts, and a reindex action.
- `/clients` creates clients, edits names/scopes, rotates tokens, and deletes clients.
- `/pending` approves or dismisses pending memory proposals from `memory/inbox/pending.md`.
- `/memory` browses and searches indexed Markdown files read-only.
- `/audit` shows recent MCP and admin write activity.

Client tokens are shown only when created or rotated. Token hashes are stored in SQLite. The UI prevents deleting the current admin client and prevents removing the last `memory:admin` client.

## Create client tokens

The first admin client is bootstrapped from `MEMORY_ADMIN_TOKEN`. Additional clients can be created with hashed tokens stored in SQLite.

```bash
pnpm client:create -- --name claude --id claude --scopes memory:read,memory:propose,memory:write
```

Output includes the token once. Store it securely.

For a read/propose-only client:

```bash
pnpm client:create -- --name chatgpt --id chatgpt --scopes memory:read,memory:propose
```

You can also create, edit, rotate, and delete clients from the admin console.

## Recommended client prompts

MCP tool descriptions help the model understand each tool, but the strongest way to shape memory behavior is to add a short instruction to each MCP client's system or custom prompt.

For trusted clients with `memory:read,memory:write,memory:propose`:

```text
You have access to a shared memory MCP server.

Use search_memory when the answer may depend on the user's durable preferences, projects, decisions, constraints, recurring workflows, or prior context.

When you learn stable, low-risk information that is likely to be useful in future sessions, save it with save_memory. Good candidates include explicit user preferences, project facts, durable decisions, constraints, corrections, and recurring workflows.

Use propose_memory_update only when you are very unsure, the memory is ambiguous, the memory may be sensitive, or it should receive explicit human review before becoming canonical.

Do not save secrets, credentials, private keys, raw transcripts, one-time details, or sensitive personal information. Keep memory entries concise, specific, and include a clear reason.
```

For lower-trust clients with only `memory:read,memory:propose`:

```text
You have access to a shared memory MCP server.

Use search_memory when the answer may depend on the user's durable preferences, projects, decisions, constraints, recurring workflows, or prior context.

You do not have permission to save canonical memory directly. When you learn something durable that may be useful in future sessions, use propose_memory_update. Only propose memories that are stable and specific; do not propose secrets, credentials, private keys, raw transcripts, one-time details, or sensitive personal information.
```

## Scripts

```bash
pnpm dev            # Start the Next.js dev server
pnpm check          # Type check
pnpm test           # Run focused tests
pnpm build          # Production build
pnpm start          # Start the built Next.js app
pnpm stdio          # Start a local stdio MCP server
pnpm reindex        # Rebuild SQLite index from Markdown
pnpm client:create  # Create a client token from the CLI
```

## Test the MCP endpoint manually

Initialize request:

```bash
curl -s http://localhost:3000/mcp \
  -H "Authorization: Bearer $MEMORY_ADMIN_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-06-18",
      "capabilities":{},
      "clientInfo":{"name":"curl","version":"0.1"}
    }
  }'
```

List tools:

```bash
curl -s http://localhost:3000/mcp \
  -H "Authorization: Bearer $MEMORY_ADMIN_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Search memory:

```bash
curl -s http://localhost:3000/mcp \
  -H "Authorization: Bearer $MEMORY_ADMIN_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"search_memory",
      "arguments":{"query":"self hosted memory", "limit":5}
    }
  }'
```

Save memory:

```bash
curl -s http://localhost:3000/mcp \
  -H "Authorization: Bearer $MEMORY_ADMIN_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":4,
    "method":"tools/call",
    "params":{
      "name":"save_memory",
      "arguments":{
        "type":"preference",
        "title":"Markdown source of truth",
        "content":"The user prefers AI memory to be inspectable and stored in Markdown files.",
        "tags":["memory","markdown"],
        "source_app":"curl",
        "reason":"The user explicitly wants inspectable, portable memory."
      }
    }
  }'
```

## Connect from Claude / ChatGPT

Use the remote MCP URL:

```text
https://memory.example.com/mcp
```

Use a bearer token generated by this server.

For public remote access, put the server behind HTTPS, for example:

- Cloudflare Tunnel + Cloudflare Access
- Caddy reverse proxy on a VPS
- Tailscale Funnel

## Local stdio MCP

The Next.js app serves MCP over HTTP at `/mcp`. For local tools that only support stdio MCP, use the stdio entrypoint:

```bash
pnpm stdio
```

The stdio process uses `MEMORY_STDIO_TOKEN` when set. If it is not set, it falls back to `MEMORY_ADMIN_TOKEN`. `MEMORY_STDIO_TOKEN` can be any client token stored in SQLite, so you can create a narrower local token:

```bash
pnpm client:create -- --name local-stdio --id local-stdio --scopes memory:read,memory:propose
```

Then put the generated token in `.env`:

```env
MEMORY_STDIO_TOKEN=<generated-token>
```

Example stdio MCP client config:

```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "sfw",
      "args": ["pnpm", "stdio"],
      "cwd": "/Users/mihirsahu/Developer/Mnemonic"
    }
  }
}
```

For tools that support remote/HTTP MCP, keep the Next app running and connect to `http://localhost:3000/mcp` instead.

## Cloudflare Tunnel deployment

Cloudflare Tunnel is a good fit when this server runs on a home machine, laptop, or private VM and you want HTTPS without opening inbound firewall ports.

### 1. Run the app locally

Make sure `.env` reflects the public URL you plan to use:

```env
PUBLIC_URL=https://memory.example.com
CORS_ORIGIN=https://memory.example.com
```

Then start the app:

```bash
pnpm build
pnpm start
```

The app should be reachable locally at:

```text
http://localhost:3000
```

### 2. Create and route a tunnel

Install `cloudflared`, authenticate it, then create a tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create mnemonic-memory
cloudflared tunnel route dns mnemonic-memory memory.example.com
```

Create a Cloudflare tunnel config file:

```yaml
tunnel: mnemonic-memory
credentials-file: /path/to/<tunnel-id>.json

ingress:
  - hostname: memory.example.com
    service: http://localhost:3000
  - service: http_status:404
```

This exposes the whole app at `https://memory.example.com`, including the admin console. If you only want MCP available through the tunnel and want to keep the admin UI local-only, route just `/mcp` and return 404 for everything else:

```yaml
tunnel: mnemonic-memory
credentials-file: /path/to/<tunnel-id>.json

ingress:
  - hostname: memory.example.com
    path: ^/mcp$
    service: http://localhost:3000
  - hostname: memory.example.com
    service: http_status:404
  - service: http_status:404
```

Cloudflare Tunnel paths are regular expressions. This app's MCP endpoint is `POST /mcp`, so `^/mcp$` exposes only that endpoint and keeps the admin console local-only at `http://localhost:3000`.

Run it:

```bash
cloudflared tunnel run mnemonic-memory
```

Now the MCP endpoint is:

```text
https://memory.example.com/mcp
```

### 3. Add Cloudflare Access carefully

Recommended setup:

- Protect the browser admin console with Cloudflare Access.
- Keep `/mcp` usable by your MCP clients.

Many MCP clients can send this app's `Authorization: Bearer <client-token>` header, but cannot complete an interactive Cloudflare Access browser login. If you put Access in front of `/mcp`, make sure your MCP client can also send Cloudflare service-token headers, or create an Access policy that bypasses `/mcp` and rely on this app's bearer-token auth.

One common pattern:

- `https://memory.example.com/*`: Cloudflare Access required for browser access.
- `https://memory.example.com/mcp`: Access bypass or service-token policy, plus this app's bearer token.

Keep write/admin MCP tokens limited to clients you trust. For lower-trust clients, create tokens with only `memory:read,memory:propose`.

## Security notes

- Keep write-capable tokens limited to trusted clients.
- Give `memory:write` only to trusted clients; lower-trust clients should usually have only `memory:read,memory:propose`.
- Do not expose arbitrary filesystem or shell tools.
- The server blocks path traversal and only writes inside the memory vault.
- Memory deletion tools are intentionally not implemented in the MVP.
- Admin sessions are stored as hashed random tokens in SQLite and expire after 24 hours.
- Secrets and credentials should not be saved to memory.

## Reindexing

If you manually edit Markdown files:

```bash
pnpm reindex
```

Or call the admin MCP tool:

```text
reindex_memory
```

The admin console also exposes a reindex action on the System page.

## Git history

Set this in `.env`:

```env
GIT_ENABLED=true
```

The server will initialize a Git repo inside the memory vault and attempt to commit after write operations. If Git is unavailable or there are no changes, it silently continues.

## Notes on MCP SDK package

This project uses the official TypeScript SDK package `@modelcontextprotocol/sdk`. The server exposes stateless Streamable HTTP JSON at `/mcp` using `WebStandardStreamableHTTPServerTransport`.

## Roadmap after MVP

- Embedding search
- OAuth support
- Cloudflare Access deployment guide
- Git backup remote
- Stale memory detection
- Conflict detection
- Canonical memory editing from the admin console
- Optional OpenClaw-style consolidation later
