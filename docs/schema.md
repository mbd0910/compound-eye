# Database Schema

SQLite database (`compound-eye.db`) with WAL mode enabled.

```mermaid
erDiagram
    projects {
        INTEGER id PK "AUTOINCREMENT"
        TEXT name "NOT NULL, UNIQUE, owner/repo format"
        TEXT created_at "NOT NULL, ISO 8601 UTC"
    }
    observations {
        INTEGER id PK "AUTOINCREMENT"
        TEXT text "NOT NULL"
        TEXT tags "JSON array, nullable (reserved for auto-classification)"
        TEXT source "NOT NULL, default 'human'"
        TEXT disposition "NOT NULL, default 'open'"
        TEXT project "nullable, matches projects.name by convention"
        TEXT created_at "NOT NULL, ISO 8601 UTC"
        TEXT updated_at "NOT NULL, ISO 8601 UTC"
    }
    actions {
        INTEGER id PK "AUTOINCREMENT"
        TEXT description "NOT NULL"
        TEXT source "NOT NULL, default 'human'"
        TEXT reference "nullable, free-text URL or identifier"
        TEXT project "nullable, where the action was taken"
        TEXT created_at "NOT NULL, ISO 8601 UTC"
    }
    action_observations {
        INTEGER action_id FK "NOT NULL"
        INTEGER observation_id FK "NOT NULL"
    }
    projects ||--o{ observations : "name"
    actions ||--o{ action_observations : "action_id"
    observations ||--o{ action_observations : "observation_id"
```

## Notes

- **Dispositions** represent human judgment on whether an observation needs attention: `open` (default), `addressed`, `wont_fix`, `deferred`
- **Actions** are an append-only log of what was done about observations. Each action can link to multiple observations via the `action_observations` junction table
- **Source** tracks who originated the observation or action (`human`, `claude`, or other agent identifiers)
- **Reference** on actions is a free-text field for linking to artifacts (PR URLs, commit SHAs, etc.) without coupling to any specific platform
- **Tags** column is reserved for future auto-classification; not currently populated
- **Projects** use `owner/repo` format (e.g. `anthropics/claude-code`). The `observations.project` column references `projects.name` by convention, not by foreign key — the projects table serves as a registry for the UI dropdown
- **Timestamps** use ISO 8601 UTC format, set automatically by SQLite `strftime()`
