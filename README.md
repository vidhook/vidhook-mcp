# vidhook-mcp

An [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that lets agents
generate videos through the vidhook render API. It is a thin wrapper over the existing HTTP API
(`POST /renders/validate`, `POST /renders`, `GET /renders/{renderId}`) — it does not add a new
contract, schema, or renderer.

The server speaks **stdio** only: an MCP client (Claude Desktop, Cursor, etc.) spawns it as a child
process and communicates over stdin/stdout via JSON-RPC.

## Tools

| Tool | What it does |
| --- | --- |
| `validate` | Validate a Movie definition and estimate its credit cost. Starts no render and consumes no credits. `estimatedCredits` equals the credits `render` would reserve for the same body. |
| `render` | Start an asynchronous render. Reserves credits and returns `renderId`, `bucketName`, `reservedCredits`. |
| `get_status` | Poll a render's progress with `renderId` + `bucketName`. When `done` and not `fatalErrorEncountered`, `outputFile` holds the result video URL. |
| `get_usage` | Return the current credit balance (`paidAvailable`, `freeAvailable`, `reserved`) and recent render activity (newest first). Takes no arguments. |

All asset references in the Movie (`video`/`image`/`audio` `src`) must be **URLs** — vidhook does not
generate assets. Compose or upload them on the agent side first.

## Skill: writing correct Movie JSON

This repo also ships a **Claude skill** (`vidhook-movie`) under
[`skills/vidhook-movie/`](./skills/vidhook-movie). The split is intentional:

- **MCP server = hands** — it executes (`validate`, `render`, `get_status`, `get_usage`) against the API.
- **Skill = brain** — it teaches an agent how to author a correct Movie JSON in the first place.

`skills/vidhook-movie/SKILL.md` carries the workflow (always `validate` first → draft with a
`vh_test_` key → poll `get_status` → finalize with `vh_live_`), the key/environment axes, and the
schema's hard spots. `skills/vidhook-movie/reference/schema-cheatsheet.md` is the full
field-by-field reference, and `skills/vidhook-movie/examples/*.json` are complete, valid Movie
definitions (slideshow + BGM + title, Ken Burns, transitions, and a composite of all four element
types). Every example is checked against the API's `parseMovie` in CI
(`skills/vidhook-movie/examples.test.ts`), so the skill cannot drift from the live schema.

The skill is delivered through the [Claude Code plugin](#claude-code-recommended-skill--mcp-in-one)
below, not through the npm package — Claude loads skills from plugins (or `~/.claude/skills/`), never
from `node_modules`.

## Configuration

The server is configured **only** through environment variables. There is no way to pass an API key
as a tool argument.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VIDHOOK_API_KEY` | yes | — | Your vidhook API key. Missing/empty fails startup (fail-closed). |
| `VIDHOOK_API_BASE_URL` | no | `https://api.vidhook.app` | API base URL. |

### Two independent axes

Watermarking and the target environment are **separate** and must not be confused:

- **Key type (`VIDHOOK_API_KEY` prefix) → watermark & billing.**
  - `vh_test_…` → free tier, **watermarked** output (use for drafts/iteration).
  - `vh_live_…` → paid, **clean** output (use for final renders).
- **Base URL (`VIDHOOK_API_BASE_URL`) → environment.**
  - e.g. `https://api.vidhook.app` (production) vs. a staging base URL.

A `vh_test_` key against production still watermarks; the base URL only changes which environment you
talk to, never whether the output is watermarked.

## Installing in MCP clients

The server is published to npm and runs via `npx`, so most clients need no separate install step —
just point them at `npx -y vidhook-mcp` and set `VIDHOOK_API_KEY`. Requires **Node.js ≥ 20**.

Use a `vh_test_…` key while wiring things up (free, watermarked); swap in `vh_live_…` for clean
output once it works.

### Claude Code (recommended): skill + MCP in one

Claude Code can install this repo as a **plugin**, which bundles both the `vidhook-movie` skill (the
brain) and the MCP server declaration (the hands) in a single step. This is the only way Claude
auto-loads the skill — it is not picked up from `node_modules`.

```bash
/plugin marketplace add https://github.com/vidhook/vidhook-mcp
/plugin install vidhook@vidhook
```

The plugin declares the MCP server as `npx -y vidhook-mcp` and **prompts you for your vidhook API key
when it's enabled** (masked input, stored in your system keychain — never written to
`settings.json`). Use a `vh_test_…` key while iterating (free, watermarked); reconfigure with a
`vh_live_…` key for clean output via `/plugin` → configure.

Verify with `/plugin` (skill listed) and `claude mcp list` (server `vidhook` registered).

### Claude Code: MCP server only

If you only want the tools (no skill), add the server directly with the CLI (`-e` sets the env var,
everything after `--` is the launch command):

```bash
claude mcp add vidhook -e VIDHOOK_API_KEY=vh_test_your_key_here -- npx -y vidhook-mcp
```

By default this is scoped to the current project. Add `--scope user` to make it available across all
your projects, or `--scope project` to write a shared `.mcp.json` checked into version control.
Verify with `claude mcp list`.

### Claude Desktop

Edit the config file (Settings → Developer → Edit Config), or open it directly:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vidhook": {
      "command": "npx",
      "args": ["-y", "vidhook-mcp"],
      "env": {
        "VIDHOOK_API_KEY": "vh_test_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop for the change to take effect.

### Cursor

Create `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` to enable it globally):

```json
{
  "mcpServers": {
    "vidhook": {
      "command": "npx",
      "args": ["-y", "vidhook-mcp"],
      "env": {
        "VIDHOOK_API_KEY": "vh_test_your_key_here"
      }
    }
  }
}
```

### VS Code (GitHub Copilot / agent mode)

Create `.vscode/mcp.json` in your workspace — note the top-level key is `servers`, not `mcpServers`:

```json
{
  "servers": {
    "vidhook": {
      "command": "npx",
      "args": ["-y", "vidhook-mcp"],
      "env": {
        "VIDHOOK_API_KEY": "vh_test_your_key_here"
      }
    }
  }
}
```

Or add it from the command line: `code --add-mcp '{"name":"vidhook","command":"npx","args":["-y","vidhook-mcp"],"env":{"VIDHOOK_API_KEY":"vh_test_your_key_here"}}'`

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json` (Cascade → MCP settings → manage):

```json
{
  "mcpServers": {
    "vidhook": {
      "command": "npx",
      "args": ["-y", "vidhook-mcp"],
      "env": {
        "VIDHOOK_API_KEY": "vh_test_your_key_here"
      }
    }
  }
}
```

### Other clients

Any MCP client that spawns a stdio server works. The common shape (keys vary by client) is:

```jsonc
{
  "mcpServers": {
    "vidhook": {
      "command": "npx",
      "args": ["-y", "vidhook-mcp"],
      "env": {
        "VIDHOOK_API_KEY": "vh_test_your_key_here"
      }
    }
  }
}
```

`npx -y vidhook-mcp` fetches and runs the published package. If you install it globally
(`npm i -g vidhook-mcp`), you can instead set `"command": "vidhook-mcp"` with no `args`.

For local development, clone this repo and run the server directly from source:

```bash
mise run setup        # install deps (or: pnpm install)
pnpm dev              # stdio server (tsx src/index.ts)
pnpm build            # bundle to dist/index.js (tsup)
```

## Tests

```bash
pnpm test             # unit (HTTP boundary stubbed) + skill example structure
pnpm test:e2e         # validate every skill example against the live API (needs VIDHOOK_API_KEY)
```

The `test:e2e` run is the schema drift-check: each `skills/vidhook-movie/examples/*.json` is sent to
the live `/renders/validate`, so the examples cannot go stale against the real Movie schema.

## Local smoke test

`e2e/smoke.ts` runs `validate → render → get_status → get_usage` once against a real API to leave an
end-to-end trace:

```bash
VIDHOOK_API_KEY=vh_test_... VIDHOOK_API_BASE_URL=https://staging-api.vidhook.app \
  pnpm exec tsx e2e/smoke.ts
```

It prints only the key prefix (never the full key).
