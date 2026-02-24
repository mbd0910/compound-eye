# compound-eye

A capture-and-review tool for engineering workflow observations. Record things you notice — repeated manual steps, flaky tests, slow processes — and track what gets done about them.

## Quick start

```bash
bun install
bun run dev
```

Open http://localhost:4141 in your browser.

## How it works

Observations are durable records of things you noticed. Each has a **disposition** representing your judgment on whether it needs attention:

**open** · **addressed** · **won't fix** · **deferred**

As work gets done — by you or by agents in other repos — **actions** are logged against observations, building an audit trail of what happened.

You capture observations through the web UI or the CLI. Click a disposition badge to change it. Select observations and hit "Copy for Claude" to export them as markdown.

### Web UI

Type an observation, select a project, then press Enter.

Filter by disposition, source, or project using the controls above the list. Click "actions" on any observation to see the action log.

### CLI

The CLI posts to the running server, so start the server first.

```bash
# Basic capture
bun run src/cli.ts add "flaky test retries always happen in CI" --project owner/repo

# Agent-originated capture
bun run src/cli.ts add "build cache misses on type changes" --source claude --project owner/repo

# Scan a directory and register projects
bun run src/cli.ts scan ~/code
```

## API

All data flows through a JSON API:

```
POST   /api/observations              Create an observation
GET    /api/observations              List (?disposition=&source=&project=)
PATCH  /api/observations/:id          Update fields
DELETE /api/observations/:id          Delete
GET    /api/observations/:id/actions  Actions for an observation
POST   /api/observations/export       Export as markdown

POST   /api/actions                   Log an action ({description, observation_ids, ...})
GET    /api/actions                   List actions (?project=&observation_id=)

GET    /api/projects                  List registered projects
POST   /api/projects                  Register project(s)
DELETE /api/projects/:id              Delete project
POST   /api/projects/scan             Scan directory for git repos
```

## Stack

- **Runtime**: Bun
- **Server**: Hono
- **Database**: SQLite (via `bun:sqlite`, WAL mode)
- **Frontend**: Single HTML file, no build step, no dependencies
