# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Compound Eye is a capture-and-review tool for engineering observations — a practice called Compound Engineering where engineers systematically record patterns, friction points, and improvement opportunities across their projects. Observations accumulate an action log over time as agents and humans work to address them.

## Commands

```bash
bun install                                                  # Install dependencies
bun run dev                                                  # Dev mode with hot reload (port 4141)
bun run dev -- --port 8080                                   # Dev mode on custom port
bun run start                                                # Production start
bunx tsc --noEmit                                            # Type-check (no lint or test suite yet)
bun run src/cli.ts add "observation text" --project o/r              # CLI capture
bun run src/cli.ts add "text" --source claude --project o/r          # CLI capture (agent source)
bun run src/cli.ts scan ~/code                                   # Scan & register projects
```

## Architecture

Two data paths, both through the HTTP API:

- **Browser**: `public/index.html → fetch() → server.ts → db.ts → SQLite`
- **CLI**: `cli.ts → fetch() → server.ts → db.ts → SQLite`

The CLI is a standalone HTTP client — it does not import internal modules or access the database directly. The server must be running for CLI capture to work.

### API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serves `public/index.html` |
| POST | `/api/observations` | Create observation (`{text, source?, project}`) |
| GET | `/api/observations` | List observations (query: `?disposition=&source=&project=`) |
| PATCH | `/api/observations/:id` | Update observation fields |
| DELETE | `/api/observations/:id` | Delete observation |
| GET | `/api/observations/:id/actions` | Get actions linked to an observation |
| POST | `/api/observations/export` | Export as markdown (`{ids: number[]}`) |
| POST | `/api/actions` | Create action (`{description, source?, reference?, project?, observation_ids}`) |
| GET | `/api/actions` | List actions (query: `?project=&observation_id=`) |
| GET | `/api/projects` | List all registered projects |
| POST | `/api/projects` | Create project(s) (`{name}` or `{names: string[]}`) |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/scan` | Scan directory for git repos (`{path}`) |

- **`src/db.ts`** — Data layer. All types (`Observation`, `ObservationCreate`, `Action`, `ActionCreate`, etc.) and SQLite queries. Uses `bun:sqlite` synchronous API. Every function takes `db: Database` as its first parameter. Observations have a `source` field (default `'human'`) to track who originated the observation.

- **`src/server.ts`** — Hono app with CRUD routes for observations, actions, and an export endpoint. `createApp(db)` returns `{ app, start }`. Static frontend served via `Bun.file()`.

- **`src/index.ts`** — Entry point. Parses `--port`, initializes database, starts server, handles SIGINT/SIGTERM.

- **`src/scan.ts`** — Filesystem scanner. Walks directories for `.git` repos, extracts `owner/repo` from GitHub remotes via `git remote get-url origin`. Used by the scan API endpoint.

- **`src/cli.ts`** — CLI for quick capture and project scanning. Parses args, calls the local API.

- **`public/index.html`** — Single-file frontend with inline CSS/JS. Dark theme, no framework, no build step, no CDN dependencies.

## Conventions

- TypeScript strict mode, no classes — functions and plain objects/interfaces only
- Explicit return type annotations on exported functions
- `null` for absence (not `undefined`)
- `node:` prefix for Node.js stdlib imports
- Relative imports with `.ts` extension
- `Bun.serve()` for the HTTP server, `Bun.file()` for file reads
- Frontend is vanilla HTML/CSS/JS, dark mode, monospace font

## Data model

See [docs/schema.md](docs/schema.md) for the full ER diagram.

Observations have a `disposition` field: `open` (default), `addressed`, `wont_fix`, or `deferred`. This represents human judgment on whether an observation needs attention, not a process step.

Actions are an append-only log of what was done about observations. Each action has a description, source, optional reference (URL/commit/identifier), and links to one or more observations via the `action_observations` junction table. Actions are created by agents in other repos calling back to the compound-eye API.

Each observation has a `source` field (default `'human'`) indicating who originated it — `'human'` for engineer observations, or an agent identifier (e.g. `'claude'`) for AI-originated feedback. Tags column exists but is reserved for future auto-classification. Projects use `owner/repo` format and are registered in a separate `projects` table (auto-registered when used via API/CLI).

SQLite database file (`compound-eye.db`) is created in the working directory with WAL mode enabled.
