import { Database } from "bun:sqlite";

export interface Observation {
  id: number;
  text: string;
  tags: string | null;
  source: string;
  status: string;
  project: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObservationCreate {
  text: string;
  source?: string;
  project: string | null;
}

export interface ObservationUpdate {
  text: string | null;
  source: string | null;
  status: string | null;
  project: string | null;
}

export interface ObservationFilters {
  status: string | null;
  source: string | null;
  project: string | null;
}

export interface Project {
  id: number;
  name: string;
  created_at: string;
}

export interface ProjectCreate {
  name: string;
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
      source TEXT NOT NULL DEFAULT 'human',
      status TEXT NOT NULL DEFAULT 'observed',
      project TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);
  return db;
}

export function createObservation(
  db: Database,
  data: ObservationCreate
): Observation {
  if (data.project) {
    ensureProject(db, data.project);
  }
  const source = data.source ?? "human";
  const stmt = db.prepare(`
    INSERT INTO observations (text, source, project)
    VALUES (?, ?, ?)
    RETURNING *
  `);
  return stmt.get(data.text, source, data.project) as Observation;
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

  if (filters?.source) {
    conditions.push("source = ?");
    params.push(filters.source);
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

  if (updates.source !== null) {
    sets.push("source = ?");
    params.push(updates.source);
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

// --- Project functions ---

export function ensureProject(db: Database, name: string): void {
  db.prepare("INSERT OR IGNORE INTO projects (name) VALUES (?)").run(name);
}

export function createProject(db: Database, data: ProjectCreate): Project | null {
  const stmt = db.prepare("INSERT OR IGNORE INTO projects (name) VALUES (?) RETURNING *");
  const row = stmt.get(data.name) as Project | null;
  if (row) return row;
  return db.prepare("SELECT * FROM projects WHERE name = ?").get(data.name) as Project;
}

export function createProjectsBulk(db: Database, names: string[]): Project[] {
  const stmt = db.prepare("INSERT OR IGNORE INTO projects (name) VALUES (?) RETURNING *");
  const results: Project[] = [];
  for (const name of names) {
    const row = stmt.get(name) as Project | undefined;
    if (row) results.push(row);
  }
  return results;
}

export function listProjects(db: Database): Project[] {
  return db.prepare("SELECT * FROM projects ORDER BY name ASC").all() as Project[];
}

export function deleteProject(db: Database, id: number): boolean {
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return result.changes > 0;
}
