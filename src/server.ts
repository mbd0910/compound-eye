import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  createObservation,
  listObservations,
  updateObservation,
  deleteObservation,
  getObservationsByIds,
  isValidStatus,
  listProjects,
  createProject,
  createProjectsBulk,
  deleteProject,
} from "./db.ts";
import type { Observation, ObservationFilters } from "./db.ts";
import { scanForGitRepos } from "./scan.ts";

const STATUS_ORDER = [
  "observed",
  "pattern_confirmed",
  "solution_designed",
  "automated",
];

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function buildExportMarkdown(observations: Observation[]): string {
  const lines: string[] = ["## Compound Eye \u2014 Engineering Observations", ""];

  // Determine grouping strategy
  const allHaveProject = observations.every((o) => o.project !== null);
  const allHaveTags = observations.every(
    (o) => o.tags !== null && JSON.parse(o.tags).length > 0
  );

  if (allHaveProject) {
    const groups = new Map<string, Observation[]>();
    for (const obs of observations) {
      const key = obs.project!;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(obs);
    }
    for (const [project, items] of groups) {
      lines.push(`### ${project}`);
      for (const obs of items) {
        lines.push(formatObservationLine(obs));
      }
      lines.push("");
    }
  } else if (allHaveTags) {
    const groups = new Map<string, Observation[]>();
    for (const obs of observations) {
      const tags: string[] = JSON.parse(obs.tags!);
      const key = tags[0];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(obs);
    }
    for (const [tag, items] of groups) {
      lines.push(`### ${tag}`);
      for (const obs of items) {
        lines.push(formatObservationLine(obs));
      }
      lines.push("");
    }
  } else {
    lines.push("### Observations");
    for (const obs of observations) {
      lines.push(formatObservationLine(obs));
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatObservationLine(obs: Observation): string {
  const status = STATUS_ORDER.includes(obs.status) ? obs.status : obs.status;
  return `- [${status}] ${obs.text} (first observed: ${formatDate(obs.created_at)}, updated: ${formatDate(obs.updated_at)})`;
}

export function createApp(db: Database): {
  app: Hono;
  start: (port: number) => { stop: () => void };
} {
  const app = new Hono();

  // Serve frontend
  app.get("/", async (c) => {
    const file = Bun.file(
      new URL("../public/index.html", import.meta.url).pathname
    );
    return c.html(await file.text());
  });

  // Create observation
  app.post("/api/observations", async (c) => {
    const body = await c.req.json();

    if (!body.text || typeof body.text !== "string" || body.text.trim() === "") {
      return c.json({ error: "text is required" }, 400);
    }

    const tags =
      Array.isArray(body.tags) && body.tags.every((t: unknown) => typeof t === "string")
        ? body.tags
        : null;

    const project =
      typeof body.project === "string" && body.project.trim() !== ""
        ? body.project.trim()
        : null;

    if (!project) {
      return c.json({ error: "project is required" }, 400);
    }

    const observation = createObservation(db, {
      text: body.text.trim(),
      tags,
      project,
    });

    return c.json(observation, 201);
  });

  // List observations
  app.get("/api/observations", (c) => {
    const status = c.req.query("status") || null;
    const tag = c.req.query("tag") || null;
    const project = c.req.query("project") || null;

    if (status && !isValidStatus(status)) {
      return c.json({ error: "Invalid status" }, 400);
    }

    const filters: ObservationFilters = { status, tag, project };
    const observations = listObservations(db, filters);
    return c.json(observations);
  });

  // Update observation
  app.patch("/api/observations/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const body = await c.req.json();

    if (body.status && !isValidStatus(body.status)) {
      return c.json({ error: "Invalid status" }, 400);
    }

    const updates = {
      text: typeof body.text === "string" ? body.text.trim() : null,
      tags: Array.isArray(body.tags) ? body.tags : null,
      status: typeof body.status === "string" ? body.status : null,
      project: typeof body.project === "string" ? body.project.trim() : null,
    };

    const observation = updateObservation(db, id, updates);
    if (!observation) return c.json({ error: "Not found" }, 404);

    return c.json(observation);
  });

  // Delete observation
  app.delete("/api/observations/:id", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const deleted = deleteObservation(db, id);
    if (!deleted) return c.json({ error: "Not found" }, 404);

    return c.body(null, 204);
  });

  // Export observations as markdown
  app.post("/api/observations/export", async (c) => {
    const body = await c.req.json();

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: "ids must be a non-empty array" }, 400);
    }

    if (!body.ids.every((id: unknown) => typeof id === "number")) {
      return c.json({ error: "ids must be numbers" }, 400);
    }

    const observations = getObservationsByIds(db, body.ids);
    if (observations.length === 0) {
      return c.json({ error: "No observations found" }, 404);
    }

    const markdown = buildExportMarkdown(observations);
    return c.json({ markdown });
  });

  // --- Project routes ---

  app.get("/api/projects", (c) => {
    const projects = listProjects(db);
    return c.json(projects);
  });

  app.post("/api/projects", async (c) => {
    const body = await c.req.json();

    if (typeof body.name === "string" && body.name.trim()) {
      const project = createProject(db, { name: body.name.trim() });
      return c.json(project, 201);
    }

    if (Array.isArray(body.names) && body.names.length > 0) {
      const validNames = body.names
        .filter((n: unknown) => typeof n === "string" && (n as string).trim() !== "")
        .map((n: string) => n.trim());
      if (validNames.length === 0) {
        return c.json({ error: "No valid names provided" }, 400);
      }
      const projects = createProjectsBulk(db, validNames);
      return c.json(projects, 201);
    }

    return c.json({ error: "name (string) or names (string[]) required" }, 400);
  });

  app.delete("/api/projects/:id", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const deleted = deleteProject(db, id);
    if (!deleted) return c.json({ error: "Not found" }, 404);

    return c.body(null, 204);
  });

  app.post("/api/projects/scan", async (c) => {
    const body = await c.req.json();

    if (typeof body.path !== "string" || body.path.trim() === "") {
      return c.json({ error: "path is required" }, 400);
    }

    try {
      const candidates = await scanForGitRepos(body.path.trim());
      return c.json({ candidates });
    } catch (err) {
      return c.json({ error: "Scan failed: " + String(err) }, 500);
    }
  });

  function start(port: number): { stop: () => void } {
    const server = Bun.serve({
      port,
      fetch: app.fetch,
    });

    console.log(`compound-eye running at http://localhost:${server.port}`);

    return {
      stop: () => server.stop(),
    };
  }

  return { app, start };
}
