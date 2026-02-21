import { Database } from "bun:sqlite";

export interface Observation {
  id: number;
  text: string;
  tags: string | null;
  status: string;
  project: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObservationCreate {
  text: string;
  tags: string[] | null;
  project: string | null;
}

export interface ObservationUpdate {
  text: string | null;
  tags: string[] | null;
  status: string | null;
  project: string | null;
}

export interface ObservationFilters {
  status: string | null;
  tag: string | null;
  project: string | null;
}

const VALID_STATUSES = [
  "observed",
  "pattern_confirmed",
  "solution_designed",
  "automated",
] as const;

export function isValidStatus(s: string): boolean {
  return (VALID_STATUSES as readonly string[]).includes(s);
}

export function initDatabase(): Database {
  const db = new Database("compound-eye.db");
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      tags TEXT,
      status TEXT NOT NULL DEFAULT 'observed',
      project TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);
  return db;
}

export function createObservation(
  db: Database,
  data: ObservationCreate
): Observation {
  const tags = data.tags ? JSON.stringify(data.tags) : null;
  const stmt = db.prepare(`
    INSERT INTO observations (text, tags, project)
    VALUES (?, ?, ?)
    RETURNING *
  `);
  return stmt.get(data.text, tags, data.project) as Observation;
}

export function listObservations(
  db: Database,
  filters?: ObservationFilters
): Observation[] {
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  if (filters?.tag) {
    conditions.push(
      "EXISTS (SELECT 1 FROM json_each(observations.tags) WHERE json_each.value = ?)"
    );
    params.push(filters.tag);
  }

  if (filters?.project) {
    conditions.push("project = ?");
    params.push(filters.project);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM observations ${where} ORDER BY created_at DESC`;
  const stmt = db.prepare(sql);
  return stmt.all(...params) as Observation[];
}

export function updateObservation(
  db: Database,
  id: number,
  updates: ObservationUpdate
): Observation | null {
  const sets: string[] = [];
  const params: (string | number)[] = [];

  if (updates.text !== null) {
    sets.push("text = ?");
    params.push(updates.text);
  }

  if (updates.tags !== null) {
    sets.push("tags = ?");
    params.push(JSON.stringify(updates.tags));
  }

  if (updates.status !== null) {
    sets.push("status = ?");
    params.push(updates.status);
  }

  if (updates.project !== null) {
    sets.push("project = ?");
    params.push(updates.project);
  }

  if (sets.length === 0) return null;

  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  params.push(id);

  const sql = `UPDATE observations SET ${sets.join(", ")} WHERE id = ? RETURNING *`;
  const stmt = db.prepare(sql);
  return (stmt.get(...params) as Observation) ?? null;
}

export function deleteObservation(db: Database, id: number): boolean {
  const stmt = db.prepare("DELETE FROM observations WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getObservationsByIds(
  db: Database,
  ids: number[]
): Observation[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at DESC`;
  const stmt = db.prepare(sql);
  return stmt.all(...ids) as Observation[];
}
