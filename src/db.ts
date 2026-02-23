import { Database } from "bun:sqlite";

export interface Observation {
  id: number;
  text: string;
  tags: string | null;
  source: string;
  disposition: string;
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
  disposition: string | null;
  project: string | null;
}

export interface ObservationFilters {
  disposition: string | null;
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

export interface Action {
  id: number;
  description: string;
  source: string;
  reference: string | null;
  project: string | null;
  created_at: string;
}

export interface ActionCreate {
  description: string;
  source?: string;
  reference?: string;
  project?: string;
  observation_ids: number[];
}

export interface ActionWithObservations extends Action {
  observation_ids: number[];
}

const VALID_DISPOSITIONS = [
  "open",
  "addressed",
  "wont_fix",
  "deferred",
] as const;

export function isValidDisposition(s: string): boolean {
  return (VALID_DISPOSITIONS as readonly string[]).includes(s);
}

function migrateStatusToDisposition(db: Database): void {
  const columns = db.prepare("PRAGMA table_info(observations)").all() as { name: string }[];
  const hasStatus = columns.some((col) => col.name === "status");
  if (!hasStatus) return;

  db.run("BEGIN TRANSACTION");
  try {
    db.run("ALTER TABLE observations RENAME COLUMN status TO disposition");
    db.run(`
      UPDATE observations SET disposition = 'open'
      WHERE disposition IN ('observed', 'pattern_confirmed', 'solution_designed')
    `);
    db.run(`
      UPDATE observations SET disposition = 'addressed'
      WHERE disposition = 'automated'
    `);
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
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
      disposition TEXT NOT NULL DEFAULT 'open',
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
  db.run(`
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'human',
      reference TEXT,
      project TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS action_observations (
      action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
      observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
      PRIMARY KEY (action_id, observation_id)
    )
  `);

  migrateStatusToDisposition(db);

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
    INSERT INTO observations (text, source, project, disposition)
    VALUES (?, ?, ?, 'open')
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

  if (filters?.disposition) {
    conditions.push("disposition = ?");
    params.push(filters.disposition);
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

  if (updates.disposition !== null) {
    sets.push("disposition = ?");
    params.push(updates.disposition);
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

// --- Action functions ---

export function createAction(
  db: Database,
  data: ActionCreate
): ActionWithObservations {
  const source = data.source ?? "human";
  const reference = data.reference ?? null;
  const project = data.project ?? null;

  const action = db.prepare(`
    INSERT INTO actions (description, source, reference, project)
    VALUES (?, ?, ?, ?)
    RETURNING *
  `).get(data.description, source, reference, project) as Action;

  const linkStmt = db.prepare(
    "INSERT INTO action_observations (action_id, observation_id) VALUES (?, ?)"
  );
  for (const obsId of data.observation_ids) {
    linkStmt.run(action.id, obsId);
  }

  return { ...action, observation_ids: data.observation_ids };
}

export function listActions(
  db: Database,
  filters?: { project?: string; observation_id?: number }
): ActionWithObservations[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.project) {
    conditions.push("a.project = ?");
    params.push(filters.project);
  }

  if (filters?.observation_id) {
    conditions.push("a.id IN (SELECT action_id FROM action_observations WHERE observation_id = ?)");
    params.push(filters.observation_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT a.* FROM actions a ${where} ORDER BY a.created_at DESC`;
  const actions = db.prepare(sql).all(...params) as Action[];

  return actions.map((action) => {
    const links = db.prepare(
      "SELECT observation_id FROM action_observations WHERE action_id = ?"
    ).all(action.id) as { observation_id: number }[];
    return { ...action, observation_ids: links.map((l) => l.observation_id) };
  });
}

export function getActionsForObservation(
  db: Database,
  observationId: number
): Action[] {
  return db.prepare(`
    SELECT a.* FROM actions a
    JOIN action_observations ao ON ao.action_id = a.id
    WHERE ao.observation_id = ?
    ORDER BY a.created_at DESC
  `).all(observationId) as Action[];
}
