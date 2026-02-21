#!/usr/bin/env bun

function printUsage(): void {
  console.log(`
compound-eye CLI - Quick observation capture

Usage:
  bun run src/cli.ts add "observation text" [options]

Options:
  --tag <value>      Add a tag (can be used multiple times)
  --project <value>  Set the project
  --port <number>    Server port (default: 4141)

Example:
  bun run src/cli.ts add "flaky test retries always happen in CI" --tag testing --project motd-analyser
  bun run src/cli.ts add "manual deploy steps could be scripted" --tag automation --tag deploys
`.trim());
}

interface ParsedArgs {
  command: string | null;
  text: string | null;
  tags: string[];
  project: string | null;
  port: number;
}

function parseArgs(args: string[]): ParsedArgs {
  let command: string | null = null;
  let text: string | null = null;
  const tags: string[] = [];
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
    if (arg === "--tag" && args[i + 1]) {
      tags.push(args[i + 1]);
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

  return { command, text, tags, project, port };
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));

  if (args.command !== "add") {
    if (args.command) {
      console.error(`Unknown command: ${args.command}`);
    }
    printUsage();
    process.exit(1);
  }

  if (!args.text) {
    console.error("Error: observation text is required");
    printUsage();
    process.exit(1);
  }

  const body: Record<string, unknown> = { text: args.text };
  if (args.tags.length > 0) body.tags = args.tags;
  if (args.project) body.project = args.project;

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

main();
