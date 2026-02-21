#!/usr/bin/env bun

function printUsage(): void {
  console.log(`
compound-eye CLI - Quick observation capture

Usage:
  bun run src/cli.ts add "observation text" [options]
  bun run src/cli.ts scan <path>

Commands:
  add     Capture an observation
  scan    Scan directory for git repos and register as projects

Options (add):
  --source <value>   Who originated this observation (default: human)
  --project <value>  Set the project (owner/repo format)
  --port <number>    Server port (default: 4141)

Options (scan):
  --port <number>    Server port (default: 4141)

Example:
  bun run src/cli.ts add "flaky test retries always happen in CI" --project anthropics/claude-code
  bun run src/cli.ts add "build cache misses on type changes" --source claude --project anthropics/claude-code
  bun run src/cli.ts scan ~/code
`.trim());
}

interface ParsedArgs {
  command: string | null;
  text: string | null;
  source: string;
  project: string | null;
  port: number;
}

function parseArgs(args: string[]): ParsedArgs {
  let command: string | null = null;
  let text: string | null = null;
  let source = "human";
  let project: string | null = null;
  let port = 4141;

  let i = 0;

  // First positional arg is the command
  if (args.length > 0 && !args[0].startsWith("--")) {
    command = args[0];
    i++;
  }

  // Second positional arg is the text
  if (i < args.length && !args[i].startsWith("--")) {
    text = args[i];
    i++;
  }

  // Named args
  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--source" && args[i + 1]) {
      source = args[i + 1];
      i++;
    } else if (arg === "--project" && args[i + 1]) {
      project = args[i + 1];
      i++;
    } else if (arg === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port)) {
        console.error("Invalid port number");
        process.exit(1);
      }
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return { command, text, source, project, port };
}

async function handleAdd(args: ParsedArgs): Promise<void> {
  if (!args.text) {
    console.error("Error: observation text is required");
    printUsage();
    process.exit(1);
  }

  if (!args.project) {
    console.error("Error: --project is required");
    process.exit(1);
  }

  const body: Record<string, unknown> = { text: args.text, project: args.project, source: args.source };

  try {
    const response = await fetch(`http://localhost:${args.port}/api/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Error: ${error.error || response.statusText}`);
      process.exit(1);
    }

    const observation = await response.json();
    console.log(`Captured #${observation.id}: ${observation.text}`);
  } catch (err) {
    if (err instanceof TypeError && String(err).includes("fetch")) {
      console.error(
        `Could not connect to compound-eye on port ${args.port}. Is the server running?`
      );
    } else {
      console.error(`Error: ${err}`);
    }
    process.exit(1);
  }
}

async function handleScan(args: ParsedArgs): Promise<void> {
  if (!args.text) {
    console.error("Error: scan path is required");
    console.error("Usage: bun run src/cli.ts scan <path>");
    process.exit(1);
  }

  const scanPath = args.text;

  try {
    console.log(`Scanning ${scanPath} for git repos...`);
    const scanRes = await fetch(`http://localhost:${args.port}/api/projects/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: scanPath }),
    });

    if (!scanRes.ok) {
      const error = await scanRes.json();
      console.error(`Error: ${error.error || scanRes.statusText}`);
      process.exit(1);
    }

    const { candidates } = (await scanRes.json()) as { candidates: string[] };

    if (candidates.length === 0) {
      console.log("No GitHub repos found.");
      return;
    }

    console.log(`Found ${candidates.length} repo(s):`);
    for (const name of candidates) {
      console.log(`  ${name}`);
    }

    const registerRes = await fetch(`http://localhost:${args.port}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: candidates }),
    });

    if (registerRes.ok) {
      const registered = (await registerRes.json()) as unknown[];
      console.log(
        `Registered ${Array.isArray(registered) ? registered.length : 0} new project(s).`
      );
    }
  } catch (err) {
    if (err instanceof TypeError && String(err).includes("fetch")) {
      console.error(
        `Could not connect to compound-eye on port ${args.port}. Is the server running?`
      );
    } else {
      console.error(`Error: ${err}`);
    }
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));

  if (args.command === "add") {
    await handleAdd(args);
  } else if (args.command === "scan") {
    await handleScan(args);
  } else {
    if (args.command) {
      console.error(`Unknown command: ${args.command}`);
    }
    printUsage();
    process.exit(1);
  }
}

main();
