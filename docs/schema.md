# Database Schema

SQLite database (`compound-eye.db`) with WAL mode enabled.

```mermaid
erDiagram
    observations {
        INTEGER id PK "AUTOINCREMENT"
        TEXT text "NOT NULL"
        TEXT tags "JSON array, nullable"
        TEXT status "NOT NULL, default 'observed'"
        TEXT project "nullable"
        TEXT created_at "NOT NULL, ISO 8601 UTC"
        TEXT updated_at "NOT NULL, ISO 8601 UTC"
    }
```

## Notes

- **Statuses** progress through: `observed` → `pattern_confirmed` → `solution_designed` → `automated`
- **Tags** are stored as a JSON array in a TEXT column, queried with `json_each()`
- **Timestamps** use ISO 8601 UTC format, set automatically by SQLite `strftime()`
