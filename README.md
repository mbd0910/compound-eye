# compound-eye

A capture-and-review tool for engineering workflow observations. Record things you notice — repeated manual steps, flaky tests, slow processes — and track them from first sighting through to automation.

## Quick start

```bash
bun install
bun run dev
```

Open http://localhost:4141 in your browser.

## How it works

Observations move through four statuses:

**observed** → **pattern confirmed** → **solution designed** → **automated**

You capture observations through the web UI or the CLI. Click a status badge to advance it to the next stage. Select observations and hit "Copy for Claude" to export them as markdown for use in conversations with Claude.

### Web UI

Type an observation, optionally add comma-separated tags and a project name, then press Enter.

Filter by status, tag, or project using the controls above the list.

### CLI

The CLI posts to the running server, so start the server first.

```bash
# Basic capture
bun run src/cli.ts add "flaky test retries always happen in CI" --tag testing --project motd-analyser

# Multiple tags
bun run src/cli.ts add "manual deploy steps could be scripted" --tag automation --tag deploys

# Custom port
bun run src/cli.ts add "observation text" --port 8080
```

## API

All data flows through a JSON API:

```
POST   /api/observations          Create an observation
GET    /api/observations          List observations (?status=&tag=&project=)
PATCH  /api/observations/:id      Update fields
DELETE /api/observations/:id      Delete
POST   /api/observations/export   Export selected observations as markdown
```

## Stack

- **Runtime**: Bun
- **Server**: Hono
- **Database**: SQLite (via `bun:sqlite`, WAL mode)
- **Frontend**: Single HTML file, no build step, no dependencies
