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

All asset references in the Movie (`video`/`image`/`audio` `src`) must be **URLs** — vidhook does not
generate assets. Compose or upload them on the agent side first.

## Skill: writing correct Movie JSON

This package also ships a **Claude skill** under [`skill/`](./skill). The split is intentional:

- **MCP server = hands** — it executes (`validate`, `render`, `get_status`) against the API.
- **Skill = brain** — it teaches an agent how to author a correct Movie JSON in the first place.

`skill/SKILL.md` carries the workflow (always `validate` first → draft with a `vh_test_` key →
poll `get_status` → finalize with `vh_live_`), the key/environment axes, and the schema's hard
spots. `skill/reference/schema-cheatsheet.md` is the full field-by-field reference, and
`skill/examples/*.json` are complete, valid Movie definitions (slideshow + BGM + title, Ken Burns,
transitions, and a composite of all four element types). Every example is checked against the API's
`parseMovie` in CI (`skill/examples.test.ts`), so the skill cannot drift from the live schema.

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

## Registering with an MCP client

Add to your MCP client config (example shape — keys vary by client):

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

The `test:e2e` run is the schema drift-check: each `skill/examples/*.json` is sent to the live
`/renders/validate`, so the examples cannot go stale against the real Movie schema.

## Local smoke test

`e2e/smoke.ts` runs `validate → render → get_status` once against a real API to leave an
end-to-end trace:

```bash
VIDHOOK_API_KEY=vh_test_... VIDHOOK_API_BASE_URL=https://staging-api.vidhook.app \
  pnpm exec tsx e2e/smoke.ts
```

It prints only the key prefix (never the full key).
